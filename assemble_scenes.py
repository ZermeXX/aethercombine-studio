#!/usr/bin/env python3
"""
assemble_scenes.py — AETHER COMBINE Studio Simplified 3-Step Master Assembly Pipeline

STEP 1 — Build full_voice.wav:
  - Iterate manifest.timeline in order and measure exact voice_dur[i] via ffprobe.
  - Convert each clip to 48000 Hz stereo PCM, prepend 0.20s lead-in silence before
    Scene 01 (adelay=200|200), append 0.35s clean silence after every clip (apad=pad_dur=0.35),
    and concatenate sequentially (concat=n=N:v=0:a=1) into full_voice.wav.
  - Record exact slot_dur[i] = voice_dur[i] + 0.35 (+ 0.20 for Scene 01), [slot_start[i], slot_end[i]],
    and [voice_start[i], voice_end[i]].

STEP 2 — Build full_video.mp4 matching exact slot_dur[i]:
  - Normalize each scene MP4 to 3840x2160, 24 fps CFR (setpts=PTS-STARTPTS).
  - Match each clip duration strictly to slot_dur[i]: extend short tails seamlessly with
    tpad=stop_mode=clone:stop_duration=(slot_dur[i] - raw_video_dur[i]); trim longer clips cleanly.
  - Mix scene-level ambient SFX per slot (-96 dB strict mute when video_ambient_mute is true,
    -22 dB default, -6 dB on scene_33 aligned cleanly) and concatenate all N segments directly
    into full_video.mp4 (no xfade time-compression drift).

STEP 3 — Mux full_video.mp4 + full_voice.wav into Final 4K H.264 Master + Sentence-Locked Shorts:
  - Layer full_voice.wav at 0.0 dB onto full_video.mp4 ambient SFX + optional background music
    bed (-26 dB, sidechain ducked -6 dB under voiceover, -12 dB during scene_33).
  - Encode final master with libx264 (High, CRF 18, yuv420p, 3840x2160, 24 fps CFR) and
    normalize audio to -14.0 LUFS / -1.0 dBTP (AAC 320k 48kHz stereo).
  - Export multi-language sidecar SRTs and 9:16 Shorts (./output/shorts/) sliced strictly at
    exact slot_dur[i] boundaries between sentences with the user's Hook Text Overlay.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

LEAD_IN_SEC = 0.20
SENTENCE_PAD_SEC = 0.35


def run_cmd(cmd: list[str]) -> None:
    print("▶", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def has_audio_stream(media_path: Path) -> bool:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        str(media_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return bool(res.stdout.strip())


def get_media_duration(media_path: Path) -> float:
    for entry in ("stream=duration", "format=duration"):
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            entry,
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(media_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        for line in (res.stdout or "").splitlines():
            raw = line.strip()
            if not raw or raw.upper() == "N/A":
                continue
            try:
                val = float(raw)
                if val > 0:
                    return val
            except ValueError:
                pass
    return 0.0


def format_srt_timestamp(sec: float) -> str:
    safe = max(0.0, float(sec))
    hrs = int(safe // 3600)
    mins = int((safe % 3600) // 60)
    secs = int(safe % 60)
    ms = int(round((safe - int(safe)) * 1000)) % 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def sanitize_slug(name: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_\-]+", "_", (name or "aether_project").strip()).strip("_")
    return clean or "aether_project"


def resolve_asset(filename: str | None, work_dir: Path, folder_id: str | None) -> Path | None:
    if not filename:
        return None

    clean_name = filename.strip()
    if not clean_name:
        return None

    candidates = [
        work_dir / clean_name,
        work_dir / Path(clean_name).name,
        Path("assets") / clean_name,
        Path("assets") / Path(clean_name).name,
        Path("input") / clean_name,
        Path("input") / Path(clean_name).name,
        Path(clean_name),
    ]
    for path in candidates:
        if path.is_file():
            return path

    if folder_id:
        remote = os.getenv("GDRIVE_REMOTE", "gdrive")
        dest = work_dir / Path(clean_name).name
        dest.parent.mkdir(parents=True, exist_ok=True)
        run_cmd([
            "rclone",
            "copyto",
            f"{remote}:{clean_name}",
            str(dest),
            "--drive-root-folder-id",
            folder_id,
        ])
        if dest.is_file():
            return dest

    return None


def get_normalized_scenes(manifest: dict) -> list[dict]:
    raw_scenes = manifest.get("timeline") or manifest.get("scenes") or []
    normalized: list[dict] = []

    for idx, item in enumerate(raw_scenes):
        scene = dict(item)
        assets = scene.get("assets") or {}
        aud_proc = scene.get("audio_processing") or {}

        video_file = (
            scene.get("file_name")
            or scene.get("video_file")
            or assets.get("video_file")
            or assets.get("image_reference")
        )
        voice_file = (
            scene.get("voiceover_file")
            or scene.get("audio_file")
            or assets.get("voiceover_file")
            or assets.get("audio_file")
        )
        sfx_file = (
            aud_proc.get("sfx")
            or scene.get("sfx")
            or assets.get("sfx")
            or scene.get("sfx_file")
        )

        scene_id = str(scene.get("scene_id") or f"scene_{idx + 1:02d}")
        scene["scene_id"] = scene_id
        scene["file_name"] = video_file
        scene["video_file"] = video_file
        if voice_file:
            scene["voiceover_file"] = voice_file
            scene["audio_file"] = voice_file
        if sfx_file:
            scene["sfx"] = sfx_file

        # Strict ambient rules: -96 dB when video_ambient_mute is true, -6 dB on scene_33, -22 dB default
        mute_flag = scene.get("video_ambient_mute")
        if mute_flag is None:
            mute_flag = aud_proc.get("video_ambient_mute")
        if mute_flag is None:
            mute_flag = scene.get("mute_audio", False)
        scene["mute_audio"] = bool(mute_flag)

        amb_gain = aud_proc.get("video_ambient_gain_db")
        if amb_gain is None:
            amb_gain = scene.get("video_ambient_gain_db")
        if amb_gain is None:
            amb_gain = scene.get("ambient_gain_db")

        is_scene_33 = "scene_33" in scene_id.lower()
        if scene["mute_audio"]:
            scene["ambient_gain_db"] = -96.0
        elif amb_gain is not None and float(amb_gain) != 0.0:
            scene["ambient_gain_db"] = float(amb_gain)
        elif is_scene_33:
            scene["ambient_gain_db"] = -6.0
        else:
            scene["ambient_gain_db"] = -22.0

        sfx_gain = aud_proc.get("sfx_gain_db", scene.get("sfx_gain_db"))
        scene["sfx_gain_db"] = float(sfx_gain) if sfx_gain is not None else -6.0

        voice_gain = aud_proc.get("voiceover_gain_db", scene.get("voiceover_gain_db", 0.0))
        scene["voiceover_gain_db"] = float(voice_gain or 0.0)

        normalized.append(scene)

    return normalized


# ---------------------------------------------------------------------------
# STEP 1: Concatenate all voiceover clips sequentially -> full_voice.wav
# ---------------------------------------------------------------------------
def step1_build_full_voice(
    scenes: list[dict],
    work_dir: Path,
    folder_id: str | None,
) -> tuple[Path, list[dict]]:
    """
    Measure exact voice_dur[i] via ffprobe, convert to 48000 Hz stereo PCM,
    prepend 0.20s lead-in silence before Scene 01 (adelay=200|200),
    append 0.35s clean silence after every clip (apad=pad_dur=0.35),
    and concatenate sequentially (concat=n=N:v=0:a=1) into full_voice.wav.
    Records exact slot_dur[i] = voice_dur[i] + 0.35 (+ 0.20 for Scene 01).
    """
    n_scenes = len(scenes)
    slots: list[dict] = []
    cmd = ["ffmpeg", "-y"]
    filter_parts: list[str] = []
    concat_labels: list[str] = []
    input_idx = 0
    cum_cursor = 0.0

    for idx, sc in enumerate(scenes):
        voice_name = sc.get("voiceover_file") or sc.get("audio_file")
        src_voice = resolve_asset(voice_name, work_dir, folder_id) if voice_name else None
        lead_in = LEAD_IN_SEC if idx == 0 else 0.0
        pad_after = SENTENCE_PAD_SEC
        voice_gain = float(sc.get("voiceover_gain_db", 0.0))
        manifest_dur = max(0.5, float(sc.get("duration_sec") or sc.get("duration") or 6.0))

        if src_voice and src_voice.is_file():
            voice_dur = get_media_duration(src_voice)
            if voice_dur <= 0.0:
                voice_dur = max(0.5, manifest_dur - pad_after - lead_in)

            cmd += ["-i", str(src_voice)]
            delay_chain = "adelay=200|200," if idx == 0 else ""
            # Zero trimming of spoken words: full clip -> 48kHz stereo -> optional adelay -> 0.35s tail silence
            filter_parts.append(
                f"[{input_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"asetpts=PTS-STARTPTS,"
                f"volume={voice_gain:.2f}dB,{delay_chain}apad=pad_dur={pad_after:.2f}[va_{idx}]"
            )
            input_idx += 1

            slot_dur = lead_in + voice_dur + pad_after
            voice_start = cum_cursor + lead_in
            voice_end = voice_start + voice_dur
            has_vo = True
        else:
            voice_dur = 0.0
            slot_dur = lead_in + manifest_dur
            filter_parts.append(
                f"anullsrc=r=48000:cl=stereo:d={slot_dur:.4f},asetpts=PTS-STARTPTS[va_{idx}]"
            )
            voice_start = cum_cursor + lead_in
            voice_end = voice_start + max(0.0, manifest_dur - pad_after)
            has_vo = False

        slot_start = cum_cursor
        slot_end = cum_cursor + slot_dur
        concat_labels.append(f"[va_{idx}]")

        slots.append(
            {
                "index": idx,
                "scene_id": sc["scene_id"],
                "voice_dur": round(voice_dur, 4),
                "manifest_duration_sec": round(manifest_dur, 4),
                "lead_in_sec": round(lead_in, 4),
                "pad_after_sec": round(pad_after, 4),
                "slot_dur": round(slot_dur, 4),
                "slot_start": round(slot_start, 4),
                "slot_end": round(slot_end, 4),
                "voice_start": round(voice_start, 4),
                "voice_end": round(voice_end, 4),
                "has_voiceover": has_vo,
            }
        )
        cum_cursor = slot_end

    filter_parts.append(f"{''.join(concat_labels)}concat=n={n_scenes}:v=0:a=1[full_vo]")
    fc_path = work_dir / "step1_full_voice_fc.txt"
    fc_path.write_text(";".join(filter_parts), encoding="utf-8")

    full_voice_wav = work_dir / "full_voice.wav"
    cmd += [
        "-filter_complex_script",
        str(fc_path),
        "-map",
        "[full_vo]",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(full_voice_wav),
    ]
    run_cmd(cmd)
    return full_voice_wav, slots


# ---------------------------------------------------------------------------
# STEP 2: Normalize every scene clip & concatenate -> full_video.mp4
# ---------------------------------------------------------------------------
def _prepare_scene_segment(
    idx: int,
    sc: dict,
    target_slot_dur: float,
    width: int,
    height: int,
    fps: int,
    work_dir: Path,
    folder_id: str | None,
) -> Path:
    """
    Normalize scene_XX_vid.mp4 to 3840x2160 @ 24fps CFR, matching exact slot_dur[i]:
      - tpad=stop_mode=clone when target_slot_dur > raw_video_dur
      - clean trim to target_slot_dur otherwise
    Attach slot ambient/SFX track (-96 dB muted, -22 dB default, -6 dB scene_33 aligned cleanly).
    """
    video_name = sc.get("file_name") or sc.get("video_file")
    if not video_name:
        raise KeyError(f"Scene #{idx + 1} is missing file_name / video_file")

    src_video = resolve_asset(video_name, work_dir, folder_id)
    if not src_video or not src_video.is_file():
        raise FileNotFoundError(f"Video asset not found for scene #{idx + 1}: {video_name}")

    is_image = src_video.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    raw_vid_dur = get_media_duration(src_video) if not is_image else 0.0

    # Video filtergraph: normalize to 3840x2160, 24fps CFR, extend via tpad or trim cleanly to target_slot_dur
    v_filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
        f"fps={fps}",
        "setsar=1",
        "format=yuv420p",
    ]
    if (not is_image) and raw_vid_dur > 0.0 and target_slot_dur > raw_vid_dur:
        pad_ext = target_slot_dur - raw_vid_dur
        v_filters.append(f"tpad=stop_mode=clone:stop_duration={pad_ext:.4f}")
    v_filters.append(f"trim=duration={target_slot_dur:.4f}")
    v_filters.append("setpts=PTS-STARTPTS")

    # Ambient / SFX audio filtergraph aligned strictly to this slot [0 .. target_slot_dur]
    mute_ambient = bool(sc.get("mute_audio", False))
    ambient_gain = float(sc.get("ambient_gain_db", -22.0))
    sfx_name = sc.get("sfx")
    sfx_gain = float(sc.get("sfx_gain_db", -6.0))
    vid_has_audio = (not is_image) and has_audio_stream(src_video)

    src_sfx = resolve_asset(sfx_name, work_dir, folder_id) if sfx_name else None
    sfx_has_audio = bool(src_sfx and src_sfx.is_file() and has_audio_stream(src_sfx))

    cmd = ["ffmpeg", "-y"]
    if is_image:
        cmd += ["-loop", "1", "-t", f"{target_slot_dur + 0.1:.4f}", "-i", str(src_video)]
    else:
        cmd += ["-i", str(src_video)]

    sfx_input_idx = None
    if sfx_has_audio:
        sfx_input_idx = 1
        cmd += ["-i", str(src_sfx)]

    fc_parts = [f"[0:v]{','.join(v_filters)}[v_out]"]

    # Align lead-in for scene_01 ambient/SFX cleanly with 200ms voice lead-in
    delay_ms = int(round(LEAD_IN_SEC * 1000)) if idx == 0 else 0
    delay_flt = f"adelay={delay_ms}|{delay_ms}," if delay_ms > 0 else ""

    amb_nodes: list[str] = []
    if vid_has_audio:
        effective_gain = -96.0 if (mute_ambient or ambient_gain <= -90.0) else ambient_gain
        fc_parts.append(
            f"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={effective_gain:.2f}dB,{delay_flt}apad,atrim=0:{target_slot_dur:.4f},asetpts=PTS-STARTPTS[amb_v]"
        )
        amb_nodes.append("[amb_v]")

    if sfx_input_idx is not None:
        fc_parts.append(
            f"[{sfx_input_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={sfx_gain:.2f}dB,{delay_flt}apad,atrim=0:{target_slot_dur:.4f},asetpts=PTS-STARTPTS[amb_sfx]"
        )
        amb_nodes.append("[amb_sfx]")

    if not amb_nodes:
        fc_parts.append(
            f"anullsrc=r=48000:cl=stereo:d={target_slot_dur:.4f},asetpts=PTS-STARTPTS[a_out]"
        )
    elif len(amb_nodes) == 1:
        fc_parts.append(f"{amb_nodes[0]}acopy[a_out]")
    else:
        fc_parts.append(f"{''.join(amb_nodes)}amix=inputs={len(amb_nodes)}:duration=first:normalize=0[a_out]")

    seg_path = work_dir / f"seg_{idx + 1:03d}.mkv"
    cmd += [
        "-filter_complex",
        ";".join(fc_parts),
        "-map",
        "[v_out]",
        "-map",
        "[a_out]",
        "-t",
        f"{target_slot_dur:.4f}",
        "-r",
        str(fps),
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-crf",
        "14",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(seg_path),
    ]
    run_cmd(cmd)
    return seg_path


def step2_build_full_video(
    scenes: list[dict],
    slots: list[dict],
    width: int,
    height: int,
    fps: int,
    work_dir: Path,
    folder_id: str | None,
) -> tuple[Path, float]:
    """
    Build all scene segments matched directly to slot_dur[i] (with zero cumulative
    24fps frame quantization drift) and concatenate sequentially into full_video.mp4.
    No xfade time-compression offsets are applied.
    """
    seg_paths: list[Path] = []
    cum_target = 0.0
    cum_actual = 0.0

    for idx, sc in enumerate(scenes):
        base_slot_dur = float(slots[idx]["slot_dur"])
        # Keep cumulative video duration locked within <= 1/2 frame (0.02s) of full_voice.wav
        cum_target += base_slot_dur
        drift_compensated_dur = max(0.25, cum_target - cum_actual)

        seg_path = _prepare_scene_segment(
            idx=idx,
            sc=sc,
            target_slot_dur=drift_compensated_dur,
            width=width,
            height=height,
            fps=fps,
            work_dir=work_dir,
            folder_id=folder_id,
        )
        seg_paths.append(seg_path)
        actual_seg_dur = get_media_duration(seg_path) or drift_compensated_dur
        cum_actual += actual_seg_dur

    full_video_mkv = work_dir / "full_video.mkv"
    if len(seg_paths) == 1:
        shutil.copy2(seg_paths[0], full_video_mkv)
    else:
        concat_list = work_dir / "full_video_concat.txt"
        concat_list.write_text(
            "\n".join(f"file '{p.resolve().as_posix()}'" for p in seg_paths) + "\n",
            encoding="utf-8",
        )
        run_cmd([
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c:v",
            "copy",
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            str(full_video_mkv),
        ])

    # Also write compatibility MP4 container alias full_video.mp4 (with AAC ambient track) for inspection
    full_video_mp4 = work_dir / "full_video.mp4"
    run_cmd([
        "ffmpeg",
        "-y",
        "-i",
        str(full_video_mkv),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(full_video_mp4),
    ])

    total_dur = get_media_duration(full_video_mp4) or cum_actual
    return full_video_mp4, round(total_dur, 4)


# ---------------------------------------------------------------------------
# STEP 3: Mux full_video.mp4 + full_voice.wav + Music Bed -> Final 4K H.264
# ---------------------------------------------------------------------------
def step3_mux_master_output(
    manifest: dict,
    full_video_mp4: Path,
    full_voice_wav: Path,
    slots: list[dict],
    total_dur: float,
    final_video: Path,
    fps: int,
    crf: int,
    preset: str,
    profile: str,
    audio_bitrate: str,
    work_dir: Path,
    folder_id: str | None,
) -> None:
    """
    Overlay full_voice.wav (0.0 dB) onto full_video.mp4 ambient SFX + optional background
    music (-26 dB base, sidechain ducked -6 dB under voice, -12 dB during scene_33),
    encode with libx264 (High, CRF 18, yuv420p, 3840x2160, 24fps CFR) and normalize
    stereo AAC 320k 48kHz audio to -14.0 LUFS / -1.0 dBTP.
    """
    ambient_cfg = manifest.get("ambient_audio") or manifest.get("music_bed") or manifest.get("continuous_bed") or {}
    music_name = str(ambient_cfg.get("file_name") or ambient_cfg.get("audio_file") or "").strip()
    music_path = resolve_asset(music_name, work_dir, folder_id) if music_name else None

    render_cfg = manifest.get("render_settings") or {}
    loudnorm_cfg = render_cfg.get("loudness_normalization") or manifest.get("audio_mastering") or {}
    anti_locks = manifest.get("anti_desync_locks") or {}
    if not loudnorm_cfg and isinstance(anti_locks.get("loudnorm"), dict):
        loudnorm_cfg = anti_locks["loudnorm"]

    loudnorm_enabled = bool(loudnorm_cfg.get("enabled", loudnorm_cfg.get("loudnorm_enabled", True)))
    lufs = float(loudnorm_cfg.get("target_lufs", loudnorm_cfg.get("integrated_lufs", -14.0)))
    tp = float(loudnorm_cfg.get("true_peak_db", loudnorm_cfg.get("true_peak_dbtp", -1.0)))
    lra = float(loudnorm_cfg.get("lra", 7.0))

    cmd = ["ffmpeg", "-y", "-i", str(full_video_mp4), "-i", str(full_voice_wav)]
    filter_parts = [
        f"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur={total_dur:.4f}[amb_mix]",
        f"[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.0dB,apad=whole_dur={total_dur:.4f},asplit=2[vo_mix][vo_sc]",
    ]
    mix_nodes = ["[vo_mix]", "[amb_mix]"]

    if music_path and music_path.is_file() and has_audio_stream(music_path):
        cmd += ["-stream_loop", "-1", "-t", f"{total_dur:.4f}", "-i", str(music_path)]
        s33_info = next((item for item in slots if "scene_33" in str(item["scene_id"]).lower()), None)
        music_chain = (
            f"[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume=-26.0dB,atrim=0:{total_dur:.4f},asetpts=PTS-STARTPTS"
        )
        if s33_info is not None:
            s33_start = float(s33_info["voice_start"])
            s33_end = float(s33_info["slot_end"])
            music_chain += f",volume=-12.0dB:enable='between(t,{s33_start:.3f},{s33_end:.3f})'"
        filter_parts.append(f"{music_chain}[mus_base]")
        # -6.0 dB sidechain ducking under full_voice.wav
        filter_parts.append(
            "[mus_base][vo_sc]sidechaincompress=threshold=0.03:ratio=2.0:attack=30:release=300:level_sc=1[mus_ducked]"
        )
        mix_nodes.append("[mus_ducked]")

    filter_parts.append(f"{''.join(mix_nodes)}amix=inputs={len(mix_nodes)}:duration=first:normalize=0[pre_norm]")
    if loudnorm_enabled:
        filter_parts.append(f"[pre_norm]loudnorm=I={lufs:.1f}:TP={tp:.1f}:LRA={lra:.1f}[final_a]")
        audio_out_label = "[final_a]"
    else:
        audio_out_label = "[pre_norm]"

    fc_path = work_dir / "step3_mux_fc.txt"
    fc_path.write_text(";".join(filter_parts), encoding="utf-8")

    cmd += [
        "-filter_complex_script",
        str(fc_path),
        "-map",
        "0:v:0",
        "-map",
        audio_out_label,
        "-r",
        str(fps),
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-profile:v",
        profile,
        "-level",
        "5.1",
        "-crf",
        str(crf),
        "-preset",
        preset,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        audio_bitrate,
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-shortest",
        str(final_video),
    ]
    run_cmd(cmd)


# ---------------------------------------------------------------------------
# Sidecar Multi-Language SRTs & Exact Slot-Boundary 9:16 Shorts
# ---------------------------------------------------------------------------
def export_sidecar_subtitles(
    manifest: dict,
    scenes: list[dict],
    slots: list[dict],
    out_dir: Path,
    project_slug: str,
) -> list[Path]:
    subs_export = manifest.get("subtitles_export") or {}
    if not subs_export.get("export_separate_srt_files", True):
        return []

    raw_langs = subs_export.get("languages") or manifest.get("subtitle_languages") or []
    if not raw_langs:
        lang_set: list[str] = []
        for sc in scenes:
            subs = sc.get("subtitles") or {}
            if isinstance(subs, dict):
                for k in subs.keys():
                    norm = str(k).strip().upper().split("-")[0].split("_")[0]
                    if norm and norm not in lang_set:
                        lang_set.append(norm)
        raw_langs = lang_set or ["EN"]

    written: list[Path] = []
    for raw_lang in raw_langs:
        lang = str(raw_lang).strip().upper().split("-")[0].split("_")[0]
        if not lang:
            continue
        blocks: list[str] = []
        cue_num = 1
        for i, sc in enumerate(scenes):
            subs = sc.get("subtitles") or {}
            line = ""
            if isinstance(subs, dict):
                line = str(subs.get(lang) or subs.get(lang.lower()) or "").strip()
            if not line and lang == "EN":
                line = str(sc.get("text_overlay") or "").strip()
            if not line:
                continue

            v_start = float(slots[i]["voice_start"])
            v_end = max(v_start + 0.4, float(slots[i]["voice_end"]))
            blocks.append(f"{cue_num}\n{format_srt_timestamp(v_start)} --> {format_srt_timestamp(v_end)}\n{line}")
            cue_num += 1

        if blocks:
            srt_path = out_dir / f"{project_slug}_{lang}.srt"
            srt_path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")
            written.append(srt_path)
            print(f"📝 Exported sidecar SRT: {srt_path}")

    return written


def _find_drawtext_font() -> str | None:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for p in candidates:
        if Path(p).is_file():
            return p
    return None


def _ffmpeg_has_drawtext() -> bool:
    res = subprocess.run(["ffmpeg", "-v", "error", "-filters"], capture_output=True, text=True)
    return "drawtext" in (res.stdout or "")


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", " ")
        .strip()
    )


def _resolve_dynamic_short_hook(
    manifest: dict,
    scenes: list[dict],
    short_idx_zero: int,
    start_sc_idx: int,
) -> str:
    shorts_cfg = manifest.get("shorts_config") or {}
    shorts_factory = manifest.get("shorts_factory") or {}
    shorts_export = manifest.get("shorts_export") or {}

    segments = shorts_export.get("segments") if isinstance(shorts_export.get("segments"), list) else []
    if short_idx_zero < len(segments) and isinstance(segments[short_idx_zero], dict):
        seg_hook = str(segments[short_idx_zero].get("hook_text") or segments[short_idx_zero].get("hook") or "").strip()
        if seg_hook:
            return seg_hook

    for container in (shorts_cfg, shorts_factory, manifest):
        hooks_list = container.get("hook_texts")
        if isinstance(hooks_list, list) and short_idx_zero < len(hooks_list):
            candidate = str(hooks_list[short_idx_zero] or "").strip()
            if candidate:
                return candidate

    for candidate in (
        shorts_cfg.get("hook_text"),
        shorts_cfg.get("hook_text_en"),
        shorts_factory.get("hook_text"),
        manifest.get("hook_text_overlay"),
        manifest.get("hook_text"),
        scenes[start_sc_idx].get("hook_text") if start_sc_idx < len(scenes) else "",
        scenes[start_sc_idx].get("text_overlay") if start_sc_idx < len(scenes) else "",
    ):
        clean = str(candidate or "").strip()
        if clean:
            return clean

    return ""


def export_slot_locked_shorts(
    manifest: dict,
    scenes: list[dict],
    final_video: Path,
    slots: list[dict],
    total_video_dur: float,
    out_dir: Path,
) -> list[Path]:
    """
    Slice 9:16 Shorts (./output/shorts/) strictly at exact slot_dur[i] boundaries
    ([slot_start, slot_end]) between sentences within a 28s-58s window and
    overlay the user's dynamic Hook Text Overlay string from the manifest/UI.
    """
    shorts_cfg = manifest.get("shorts_config") or manifest.get("shorts_factory") or manifest.get("shorts_export") or {}
    if not shorts_cfg.get("enabled"):
        return []

    if not slots or not final_video.is_file():
        return []

    min_short_dur = 28.0
    max_short_dur = 58.0
    target_count = max(1, min(4, int(shorts_cfg.get("shorts_count") or shorts_cfg.get("count") or 3)))
    raw_target = float(shorts_cfg.get("clip_duration_sec") or 36.0)
    target_dur = max(min_short_dur, min(max_short_dur, raw_target))

    n_scenes = len(slots)
    anchor_indices = sorted({0, max(0, n_scenes // 3), max(0, (n_scenes * 2) // 3)})
    while len(anchor_indices) < target_count and len(anchor_indices) < n_scenes:
        candidate = min(n_scenes - 1, anchor_indices[-1] + max(1, n_scenes // (target_count + 1)))
        if candidate not in anchor_indices:
            anchor_indices.append(candidate)
        else:
            break

    shorts_dir = out_dir / "shorts"
    shorts_dir.mkdir(parents=True, exist_ok=True)
    exported: list[Path] = []
    drawtext_ok = _ffmpeg_has_drawtext()
    font_path = _find_drawtext_font() if drawtext_ok else None

    for short_idx, raw_start_idx in enumerate(anchor_indices[:target_count], start=1):
        start_sc_idx = raw_start_idx
        last_slot_end = min(total_video_dur, float(slots[-1]["slot_end"]))
        while start_sc_idx > 0 and (last_slot_end - float(slots[start_sc_idx]["slot_start"])) < min_short_dur:
            start_sc_idx -= 1

        start_time = max(0.0, float(slots[start_sc_idx]["slot_start"]))
        end_sc_idx = start_sc_idx
        while end_sc_idx + 1 < n_scenes:
            curr_end = min(total_video_dur, float(slots[end_sc_idx]["slot_end"]))
            curr_dur = curr_end - start_time
            next_end = min(total_video_dur, float(slots[end_sc_idx + 1]["slot_end"]))
            next_dur = next_end - start_time

            if next_dur > max_short_dur and curr_dur >= min_short_dur:
                break
            if next_dur > max_short_dur:
                break
            end_sc_idx += 1
            if (next_end - start_time) >= target_dur:
                break

        end_time = min(total_video_dur, float(slots[end_sc_idx]["slot_end"]))
        clip_dur = max(3.0, min(max_short_dur, end_time - start_time))
        out_short = shorts_dir / f"short_{short_idx:02d}_1080x1920.mp4"

        vf_chain = ["crop=ih*9/16:ih", "scale=1080:1920", "setsar=1"]
        hook_text = _resolve_dynamic_short_hook(manifest, scenes, short_idx - 1, start_sc_idx)
        if hook_text and drawtext_ok:
            safe_hook = _escape_drawtext(hook_text)
            font_opt = f"fontfile={font_path}:" if font_path else ""
            vf_chain.append(
                f"drawtext={font_opt}text='{safe_hook}':fontcolor=white:fontsize=54:"
                f"box=1:boxcolor=black@0.68:boxborderw=18:x=(w-text_w)/2:y=220:enable='between(t,0,4.5)'"
            )

        run_cmd([
            "ffmpeg",
            "-y",
            "-ss",
            f"{start_time:.4f}",
            "-i",
            str(final_video),
            "-t",
            f"{clip_dur:.4f}",
            "-vf",
            ",".join(vf_chain),
            "-c:v",
            "libx264",
            "-profile:v",
            "high",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(out_short),
        ])
        exported.append(out_short)
        print(
            f"📱 Exported slot-locked Short #{short_idx}: {out_short} "
            f"(slots {start_sc_idx + 1}..{end_sc_idx + 1}, {start_time:.2f}s -> {end_time:.2f}s, "
            f"dur={clip_dur:.2f}s, hook={'YES' if hook_text else 'NONE'})"
        )

    return exported


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
def run_narrative_pipeline(manifest: dict) -> Path:
    scenes = get_normalized_scenes(manifest)
    if not scenes:
        raise ValueError("Manifest contains no scenes (timeline / scenes is empty)")

    render_cfg = manifest.get("render_settings") or {}
    exp_cfg = manifest.get("export_settings") or {}
    res_raw = str(render_cfg.get("resolution") or exp_cfg.get("resolution") or "3840x2160").split()[0].lower()
    if "720" in res_raw and "x" not in res_raw:
        width, height = 1280, 720
    elif "1080" in res_raw and "x" not in res_raw:
        width, height = 1920, 1080
    elif res_raw in {"4k", "2160p"}:
        width, height = 3840, 2160
    elif "x" in res_raw:
        width, height = (int(x) for x in res_raw.split("x")[:2])
    else:
        width, height = 3840, 2160

    fps = int(render_cfg.get("fps") or exp_cfg.get("fps") or 24)
    crf = int(render_cfg.get("crf") or exp_cfg.get("crf") or 18)
    preset = str(render_cfg.get("preset") or exp_cfg.get("preset") or "slow")
    profile = str(render_cfg.get("profile") or exp_cfg.get("profile") or "high").lower()
    audio_bitrate = str(
        render_cfg.get("audio_bitrate")
        or (f"{exp_cfg['audio_bitrate_kbps']}k" if exp_cfg.get("audio_bitrate_kbps") else "320k")
    )
    folder_id = (
        os.getenv("GDRIVE_FOLDER_ID")
        or (manifest.get("cloud_export") or {}).get("target_folder_id")
        or manifest.get("gdrive_folder_id")
        or manifest.get("folder_id")
    )

    work_dir = Path("build/scenes")
    work_dir.mkdir(parents=True, exist_ok=True)
    out_dir = Path("output")
    out_dir.mkdir(parents=True, exist_ok=True)

    # STEP 1: Build continuous full_voice.wav (0.20s lead-in on scene_01, 0.35s tail silence per clip)
    full_voice_wav, slots = step1_build_full_voice(scenes, work_dir, folder_id)
    total_voice_dur = round(float(slots[-1]["slot_end"]), 4)

    # STEP 2: Build frame-accurate full_video.mp4 matching exact slot_dur[i] (direct concat, no xfade)
    full_video_mp4, total_video_dur = step2_build_full_video(
        scenes=scenes,
        slots=slots,
        width=width,
        height=height,
        fps=fps,
        work_dir=work_dir,
        folder_id=folder_id,
    )
    master_dur = max(total_voice_dur, total_video_dur)

    # Persist timing map for inspection & audit
    (out_dir / "voice_timeline_map.json").write_text(
        json.dumps(
            {
                "pipeline": "3-step-slot-locked",
                "zero_speech_overlap": True,
                "lead_in_sec": LEAD_IN_SEC,
                "sentence_pad_sec": SENTENCE_PAD_SEC,
                "total_voice_dur_sec": total_voice_dur,
                "total_video_dur_sec": total_video_dur,
                "scenes": slots,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # STEP 3: Mux full_video.mp4 + full_voice.wav + optional music bed -> Final 4K H.264 -14 LUFS MP4
    project_name = str(manifest.get("project_name") or "output")
    project_slug = sanitize_slug(project_name)
    final_video = out_dir / f"{project_slug}.mp4"

    step3_mux_master_output(
        manifest=manifest,
        full_video_mp4=full_video_mp4,
        full_voice_wav=full_voice_wav,
        slots=slots,
        total_dur=master_dur,
        final_video=final_video,
        fps=fps,
        crf=crf,
        preset=preset,
        profile=profile,
        audio_bitrate=audio_bitrate,
        work_dir=work_dir,
        folder_id=folder_id,
    )
    shutil.copy2(final_video, Path("output.mp4"))

    # Export sidecar SRTs and exact slot_dur[i]-locked 9:16 Shorts
    export_sidecar_subtitles(manifest, scenes, slots, out_dir, project_slug)
    export_slot_locked_shorts(manifest, scenes, final_video, slots, master_dur, out_dir)

    print(f"✅ 3-Step Master Render complete: {final_video} ({master_dur:.2f}s)")
    return final_video


def main() -> None:
    manifest_path = Path(sys.argv[1] if len(sys.argv) > 1 else os.getenv("MANIFEST_PATH", "manifest.json"))
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with manifest_path.open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    run_narrative_pipeline(manifest)


if __name__ == "__main__":
    main()
