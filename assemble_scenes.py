#!/usr/bin/env python3
"""
assemble_scenes.py — AETHER COMBINE Studio v2.2-FINAL
Decouples Continuous Master Voiceover Track from Video-Only FFmpeg xfade Transitions:
1. Measures exact raw_voice_dur[i] via ffprobe across all scenes.
2. Resamples every voice clip to 48000 Hz stereo PCM, adds 200ms lead-in silence
   before Scene 01 (adelay=200|200), appends 350ms pause after every sentence
   (apad=pad_dur=0.35), and concatenates with zero overlap / zero acrossfade into
   master_voiceover_continuous.wav while recording [voice_start[i], voice_end[i]].
3. Normalizes MP4 clips to 3840x2160 @ 24fps CFR, extends tails with
   tpad=stop_mode=clone when req_vid_dur[i] > raw_video_dur[i], and applies
   video-only xfade transitions cleanly centered inside the 350ms pauses.
4. Layers untouched 0.0 dB master voiceover over ambient SFX (-22 dB default,
   -96 dB muted, -6.0 dB on scene_33 aligned to voice_start) + optional music bed
   (-26 dB with -6 dB sidechain ducking and -12 dB during scene_33), normalized to
   -14.0 LUFS / -1.0 dBTP stereo AAC 320k 48kHz.
5. Exports sidecar multi-language SRTs & voice-boundary-locked 9:16 Shorts (./output/shorts/).
"""

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

SUPPORTED_XFADES = {
    "fade",
    "fadeblack",
    "fadewhite",
    "dissolve",
    "wipeleft",
    "wiperight",
    "smoothleft",
    "smoothup",
}

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
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(media_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    raw = (res.stdout or "").strip()
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


def normalize_transition_type(raw_type: str | None) -> str:
    s = str(raw_type or "fade").strip().lower()
    aliases = {
        "xfade": "fade",
        "crossfade": "dissolve",
        "fade_black": "fadeblack",
        "fade_to_black": "fadeblack",
        "fade_white": "fadewhite",
        "fade_to_white": "fadewhite",
        "wipe_left": "wipeleft",
        "wipe_right": "wiperight",
        "smooth_left": "smoothleft",
        "smooth_up": "smoothup",
        "none": "cut",
    }
    s = aliases.get(s, s)
    if s == "cut":
        return "cut"
    if s in SUPPORTED_XFADES:
        return s
    return "fade"


def get_normalized_scenes(manifest: dict) -> list[dict]:
    raw_scenes = manifest.get("timeline") or manifest.get("scenes") or []
    normalized = []

    for idx, item in enumerate(raw_scenes):
        scene = dict(item)
        assets = scene.get("assets") or {}
        vid_proc = scene.get("video_processing") or {}
        aud_proc = scene.get("audio_processing") or {}
        trans_in = vid_proc.get("transition_in")
        trans_out = vid_proc.get("transition_out")

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

        if "transition" not in scene or isinstance(scene.get("transition"), dict):
            raw_tr = trans_in if trans_in is not None else scene.get("transition")
            if isinstance(raw_tr, dict):
                scene["transition"] = normalize_transition_type(raw_tr.get("type") or raw_tr.get("effect"))
                scene["transition_duration"] = float(raw_tr.get("duration_sec") or raw_tr.get("duration") or 0.0)
            else:
                scene["transition"] = normalize_transition_type(str(raw_tr or "cut"))
        else:
            scene["transition"] = normalize_transition_type(str(scene.get("transition") or "cut"))

        if "transition_out_type" not in scene and isinstance(trans_out, dict):
            scene["transition_out_type"] = str(trans_out.get("type") or "none")
            scene["transition_out_duration"] = float(trans_out.get("duration_sec") or 0.0)

        # Ambient mute & gain rules: -96 dB strict mute, -22 dB default, -6.0 dB on scene_33/SFX
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
        if sfx_gain is not None:
            scene["sfx_gain_db"] = float(sfx_gain)
        elif is_scene_33:
            scene["sfx_gain_db"] = -6.0
        else:
            scene["sfx_gain_db"] = -6.0

        voice_gain = aud_proc.get("voiceover_gain_db", scene.get("voiceover_gain_db", 0.0))
        scene["voiceover_gain_db"] = float(voice_gain or 0.0)

        normalized.append(scene)

    return normalized


def build_continuous_voice_master(
    scenes: list[dict],
    work_dir: Path,
    folder_id: str | None,
) -> tuple[Path, list[dict]]:
    """
    Step 1: Measure exact raw_voice_dur[i] for every scene, resample to 48000 Hz stereo PCM,
    prepend 200ms lead-in before Scene 01 (adelay=200|200), append 350ms pause after every
    sentence (apad=pad_dur=0.35), concatenate with zero overlap into master_voiceover_continuous.wav,
    and record [voice_start[i], voice_end[i]].
    """
    n_scenes = len(scenes)
    timings: list[dict] = []
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
            raw_v_dur = get_media_duration(src_voice)
            if raw_v_dur <= 0.0:
                raw_v_dur = max(0.5, manifest_dur - pad_after - lead_in)

            cmd += ["-i", str(src_voice)]
            delay_chain = "adelay=200|200," if idx == 0 else ""
            # Exact finite trim to raw_v_dur before apad ensures precise 350ms inter-sentence pause
            filter_parts.append(
                f"[{input_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"atrim=0:{raw_v_dur:.4f},asetpts=PTS-STARTPTS,"
                f"volume={voice_gain:.2f}dB,{delay_chain}apad=pad_dur={pad_after:.2f}[va_{idx}]"
            )
            input_idx += 1

            voice_start = cum_cursor + lead_in
            voice_end = voice_start + raw_v_dur
            seg_end = voice_end + pad_after
        else:
            raw_v_dur = 0.0
            slot_silent_dur = manifest_dur
            total_seg = lead_in + slot_silent_dur
            filter_parts.append(
                f"anullsrc=r=48000:cl=stereo:d={total_seg:.4f},asetpts=PTS-STARTPTS[va_{idx}]"
            )
            voice_start = cum_cursor + lead_in
            voice_end = voice_start + max(0.0, slot_silent_dur - pad_after)
            seg_end = cum_cursor + total_seg

        concat_labels.append(f"[va_{idx}]")
        timings.append(
            {
                "index": idx,
                "scene_id": sc["scene_id"],
                "raw_voice_dur": round(raw_v_dur, 4),
                "manifest_duration_sec": round(manifest_dur, 4),
                "seg_start": round(cum_cursor, 4),
                "voice_start": round(voice_start, 4),
                "voice_end": round(voice_end, 4),
                "seg_end": round(seg_end, 4),
                "has_voiceover": bool(src_voice and src_voice.is_file()),
            }
        )
        cum_cursor = seg_end

    # Pad final audio master if final scene has a longer outro hold (e.g. end screen card)
    filter_parts.append(f"{''.join(concat_labels)}concat=n={n_scenes}:v=0:a=1[vo_master]")

    script_path = work_dir / "voice_master_fc.txt"
    script_path.write_text(";".join(filter_parts), encoding="utf-8")

    master_voice_wav = work_dir / "master_voiceover_continuous.wav"
    cmd += [
        "-filter_complex_script",
        str(script_path),
        "-map",
        "[vo_master]",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(master_voice_wav),
    ]
    run_cmd(cmd)
    return master_voice_wav, timings


def compute_video_xfade_schedule(scenes: list[dict], timings: list[dict]) -> tuple[list[dict], float]:
    """
    Step 2: Decouple video transitions from voiceover stream.
    Visual cuts / xfade transitions occur inside the 350ms pauses between sentences.
    Returns per-scene schedule with req_vid_dur, clip_dur, cut_center, trans_in_dur, xfade_offset.
    """
    n_scenes = len(scenes)
    boundary_trans: list[tuple[str, float]] = [("cut", 0.0)]

    for i in range(1, n_scenes):
        sc = scenes[i]
        t_type = normalize_transition_type(sc.get("transition"))
        raw_d = float(sc.get("transition_duration") or 0.0)
        if t_type == "cut" or raw_d <= 0.0:
            boundary_trans.append(("cut", 0.0))
        else:
            # Keep xfade comfortably centered across the 350ms inter-sentence breathing pause
            d_clamped = min(max(0.15, raw_d), 0.35 if raw_d <= 0.4 else raw_d)
            boundary_trans.append((t_type, round(d_clamped, 4)))

    # Cut centers inside the 350ms pauses: cut_0 = 0, cut_k = voice_end[k-1] + 0.175
    cut_centers: list[float] = [0.0]
    for i in range(1, n_scenes):
        prev_t = timings[i - 1]
        if prev_t["has_voiceover"]:
            center = prev_t["voice_end"] + (SENTENCE_PAD_SEC * 0.5)
        else:
            center = prev_t["seg_end"]
        cut_centers.append(center)

    # Final timeline end (accommodates trailing outro hold if scene duration > voice duration)
    last_t = timings[-1]
    last_hold_end = max(
        last_t["seg_end"],
        cut_centers[-1] + (last_t["manifest_duration_sec"] - (SENTENCE_PAD_SEC * 0.5 if n_scenes > 1 else 0.0)),
    )
    cut_centers.append(max(last_t["seg_end"], last_hold_end))

    schedule: list[dict] = []
    sum_prev_eff = 0.0
    sum_prev_xfade = 0.0

    for i in range(n_scenes):
        d_in = boundary_trans[i][1] if i > 0 else 0.0
        d_out = boundary_trans[i + 1][1] if i < n_scenes - 1 else 0.0
        trans_in_type = boundary_trans[i][0]

        eff_span = max(0.5, cut_centers[i + 1] - cut_centers[i])
        clip_dur = eff_span + (d_in * 0.5) + (d_out * 0.5)

        speech_span = max(0.0, timings[i]["voice_end"] - timings[i]["voice_start"])
        req_vid_dur = max(float(timings[i]["manifest_duration_sec"]), speech_span + d_in + d_out)

        if i == 0:
            xfade_offset = 0.0
        else:
            # Exact cumulative offset: sum_prev_effective_durations - sum_prev_xfade_durations
            sum_prev_xfade += d_in
            xfade_offset = max(0.0, sum_prev_eff - sum_prev_xfade)

        sum_prev_eff += clip_dur

        schedule.append(
            {
                "index": i,
                "scene_id": scenes[i]["scene_id"],
                "trans_in_type": trans_in_type,
                "d_in": round(d_in, 4),
                "d_out": round(d_out, 4),
                "req_vid_dur": round(req_vid_dur, 4),
                "clip_dur": round(clip_dur, 4),
                "xfade_offset": round(xfade_offset, 4),
                "voice_start": timings[i]["voice_start"],
                "voice_end": timings[i]["voice_end"],
                "seg_start": timings[i]["seg_start"],
                "seg_end": timings[i]["seg_end"],
            }
        )

    total_video_dur = max(last_t["seg_end"], sum_prev_eff - sum_prev_xfade)
    return schedule, round(total_video_dur, 4)


def prepare_video_clip(
    scene: dict,
    sched: dict,
    width: int,
    height: int,
    fps: int,
    work_dir: Path,
    folder_id: str | None,
) -> Path:
    idx = sched["index"]
    video_name = scene.get("file_name") or scene.get("video_file")
    if not video_name:
        raise KeyError(f"Scene #{idx + 1} is missing file_name / video_file")

    src_video = resolve_asset(video_name, work_dir, folder_id)
    if not src_video or not src_video.is_file():
        raise FileNotFoundError(f"Video asset not found for scene #{idx + 1}: {video_name}")

    is_image = src_video.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    clip_dur = float(sched["clip_dur"])
    req_vid_dur = float(sched["req_vid_dur"])
    needed_dur = max(clip_dur, req_vid_dur)

    v_filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
        f"fps={fps}",
        "setsar=1",
        "format=yuv420p",
    ]

    cmd = ["ffmpeg", "-y"]
    if is_image:
        cmd += ["-loop", "1", "-t", f"{needed_dur + 0.1:.4f}", "-i", str(src_video)]
    else:
        raw_vid_dur = get_media_duration(src_video)
        cmd += ["-i", str(src_video)]
        if raw_vid_dur > 0.0 and needed_dur > raw_vid_dur:
            pad_ext = (needed_dur - raw_vid_dur) + 0.15
            v_filters.append(f"tpad=stop_mode=clone:stop_duration={pad_ext:.4f}")

    # Trim to exact scheduled clip_dur and normalize PTS for lockstep xfade
    if idx == 0 and sched["trans_in_type"] in {"fade", "fadeblack"} and sched["d_in"] > 0:
        v_filters.append(f"fade=t=in:st=0:d={sched['d_in']:.3f}")

    out_trans = str(scene.get("transition_out_type") or "none").lower()
    out_trans_dur = float(scene.get("transition_out_duration") or 0.0)
    if out_trans in {"fade_to_black", "fadeblack", "fade"} and out_trans_dur > 0:
        fade_st = max(0.0, clip_dur - out_trans_dur)
        v_filters.append(f"fade=t=out:st={fade_st:.3f}:d={out_trans_dur:.3f}")

    v_filters.append(f"trim=duration={clip_dur:.4f}")
    v_filters.append("setpts=PTS-STARTPTS")

    out_path = work_dir / f"vnorm_{idx + 1:03d}.mp4"
    cmd += [
        "-vf",
        ",".join(v_filters),
        "-an",
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
        str(out_path),
    ]
    run_cmd(cmd)
    return out_path


def build_ambient_sfx_track(
    scenes: list[dict],
    schedule: list[dict],
    total_dur: float,
    work_dir: Path,
    folder_id: str | None,
) -> Path:
    """
    Step 3a: Build video ambient + SFX track:
    - Default video ambient gain: -22.0 dB
    - Strict mute (-96.0 dB) when video_ambient_mute is true (e.g., scene_04, scene_31)
    - -6.0 dB on scene_33 (or SFX clip) aligned precisely to voice_start[scene_33]
    """
    cmd = ["ffmpeg", "-y"]
    filter_parts: list[str] = []
    concat_labels: list[str] = []
    input_idx = 0

    for i, sc in enumerate(scenes):
        info = schedule[i]
        seg_start = float(info["seg_start"])
        seg_end = float(info["seg_end"])
        if i == len(scenes) - 1 and total_dur > seg_end:
            seg_end = total_dur
        slot_len = max(0.05, seg_end - seg_start)
        voice_offset_ms = max(0, int(round((float(info["voice_start"]) - seg_start) * 1000)))

        mute_ambient = bool(sc.get("mute_audio", False))
        ambient_gain = float(sc.get("ambient_gain_db", -22.0))
        sfx_name = sc.get("sfx")
        sfx_gain = float(sc.get("sfx_gain_db", -6.0))

        src_video = resolve_asset(sc.get("file_name"), work_dir, folder_id)
        is_image = bool(src_video and src_video.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
        vid_has_audio = bool(src_video and src_video.is_file() and (not is_image) and has_audio_stream(src_video))

        src_sfx = resolve_asset(sfx_name, work_dir, folder_id) if sfx_name else None
        sfx_has_audio = bool(src_sfx and src_sfx.is_file() and has_audio_stream(src_sfx))

        seg_mix_nodes: list[str] = []

        if vid_has_audio and (not mute_ambient) and ambient_gain > -90.0:
            cmd += ["-i", str(src_video)]
            delay_flt = f"adelay={voice_offset_ms}|{voice_offset_ms}," if voice_offset_ms > 0 else ""
            filter_parts.append(
                f"[{input_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"volume={ambient_gain:.2f}dB,{delay_flt}apad,atrim=0:{slot_len:.4f},asetpts=PTS-STARTPTS[amb_v_{i}]"
            )
            seg_mix_nodes.append(f"[amb_v_{i}]")
            input_idx += 1

        if sfx_has_audio and sfx_gain > -90.0:
            cmd += ["-i", str(src_sfx)]
            sfx_delay = f"adelay={voice_offset_ms}|{voice_offset_ms}," if voice_offset_ms > 0 else ""
            filter_parts.append(
                f"[{input_idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"volume={sfx_gain:.2f}dB,{sfx_delay}apad,atrim=0:{slot_len:.4f},asetpts=PTS-STARTPTS[amb_sfx_{i}]"
            )
            seg_mix_nodes.append(f"[amb_sfx_{i}]")
            input_idx += 1

        if len(seg_mix_nodes) == 0:
            filter_parts.append(
                f"anullsrc=r=48000:cl=stereo:d={slot_len:.4f},asetpts=PTS-STARTPTS[amb_{i}]"
            )
        elif len(seg_mix_nodes) == 1:
            filter_parts.append(f"{seg_mix_nodes[0]}acopy[amb_{i}]")
        else:
            filter_parts.append(
                f"{''.join(seg_mix_nodes)}amix=inputs={len(seg_mix_nodes)}:duration=first:normalize=0[amb_{i}]"
            )

        concat_labels.append(f"[amb_{i}]")

    filter_parts.append(f"{''.join(concat_labels)}concat=n={len(scenes)}:v=0:a=1[amb_master]")
    script_path = work_dir / "ambient_sfx_fc.txt"
    script_path.write_text(";".join(filter_parts), encoding="utf-8")

    ambient_wav = work_dir / "master_ambient_sfx.wav"
    cmd += [
        "-filter_complex_script",
        str(script_path),
        "-map",
        "[amb_master]",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(ambient_wav),
    ]
    run_cmd(cmd)
    return ambient_wav


def mix_final_master_audio(
    manifest: dict,
    master_voice_wav: Path,
    ambient_sfx_wav: Path,
    schedule: list[dict],
    total_dur: float,
    work_dir: Path,
    folder_id: str | None,
) -> Path:
    """
    Step 3b & 3c:
    - Layer master_voiceover_continuous.wav untouched at 0.0 dB
    - Layer ambient_sfx_wav untouched at 0.0 dB relative (already scaled to -22/-96/-6 dB)
    - Optional background music bed: base -26.0 dB with -6.0 dB sidechain ducking under
      master_voiceover_continuous.wav (and -12.0 dB during scene_33)
    - Normalize final stereo audio master to -14.0 LUFS / -1.0 dBTP
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

    cmd = ["ffmpeg", "-y", "-i", str(master_voice_wav), "-i", str(ambient_sfx_wav)]
    filter_parts = [
        f"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur={total_dur:.4f},asplit=2[vo_mix][vo_sc]",
        f"[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur={total_dur:.4f}[amb_mix]",
    ]
    mix_nodes = ["[vo_mix]", "[amb_mix]"]

    if music_path and music_path.is_file() and has_audio_stream(music_path):
        cmd += ["-stream_loop", "-1", "-t", f"{total_dur:.4f}", "-i", str(music_path)]
        s33_info = next((item for item in schedule if "scene_33" in str(item["scene_id"]).lower()), None)
        music_chain = (
            f"[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume=-26.0dB,atrim=0:{total_dur:.4f},asetpts=PTS-STARTPTS"
        )
        if s33_info is not None:
            s33_start = float(s33_info["voice_start"])
            s33_end = float(s33_info["seg_end"])
            music_chain += f",volume=-12.0dB:enable='between(t,{s33_start:.3f},{s33_end:.3f})'"
        filter_parts.append(f"{music_chain}[mus_base]")
        # -6.0 dB calibrated sidechain ducking under master_voiceover_continuous.wav
        filter_parts.append(
            "[mus_base][vo_sc]sidechaincompress=threshold=0.03:ratio=2.0:attack=30:release=300:level_sc=1[mus_ducked]"
        )
        mix_nodes.append("[mus_ducked]")

    filter_parts.append(f"{''.join(mix_nodes)}amix=inputs={len(mix_nodes)}:duration=first:normalize=0[pre_norm]")
    if loudnorm_enabled:
        filter_parts.append(f"[pre_norm]loudnorm=I={lufs:.1f}:TP={tp:.1f}:LRA={lra:.1f}[final_a]")
        out_label = "[final_a]"
    else:
        out_label = "[pre_norm]"

    script_path = work_dir / "audio_master_fc.txt"
    script_path.write_text(";".join(filter_parts), encoding="utf-8")

    master_mix_wav = work_dir / "master_audio_mix.wav"
    cmd += [
        "-filter_complex_script",
        str(script_path),
        "-map",
        out_label,
        "-t",
        f"{total_dur:.4f}",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(master_mix_wav),
    ]
    run_cmd(cmd)
    return master_mix_wav


def export_sidecar_subtitles(
    manifest: dict,
    scenes: list[dict],
    schedule: list[dict],
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

            v_start = float(schedule[i]["voice_start"])
            v_end = max(v_start + 0.4, float(schedule[i]["voice_end"]))
            blocks.append(f"{cue_num}\n{format_srt_timestamp(v_start)} --> {format_srt_timestamp(v_end)}\n{line}")
            cue_num += 1

        if blocks:
            srt_path = out_dir / f"{project_slug}_{lang}.srt"
            srt_path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")
            written.append(srt_path)
            print(f"📝 Exported sidecar SRT: {srt_path}")

    return written


def export_voice_locked_shorts(
    manifest: dict,
    final_video: Path,
    schedule: list[dict],
    out_dir: Path,
) -> list[Path]:
    """
    Step 5: Export 9:16 Shorts (./output/shorts/) locked strictly to continuous
    [seg_start, seg_end] / [voice_start, voice_end] scene boundaries so extracted
    Shorts never clip a single word or overlap voice lines at scene cuts.
    """
    shorts_cfg = manifest.get("shorts_config") or manifest.get("shorts_factory") or {}
    if not shorts_cfg.get("enabled"):
        return []

    if not schedule or not final_video.is_file():
        return []

    target_count = max(1, min(4, int(shorts_cfg.get("shorts_count") or shorts_cfg.get("count") or 3)))
    target_dur = max(12.0, min(58.0, float(shorts_cfg.get("clip_duration_sec") or 32.0)))

    n_scenes = len(schedule)
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

    for short_idx, start_sc_idx in enumerate(anchor_indices[:target_count], start=1):
        start_time = max(0.0, float(schedule[start_sc_idx]["seg_start"]))
        end_sc_idx = start_sc_idx
        while end_sc_idx + 1 < n_scenes:
            next_end = float(schedule[end_sc_idx + 1]["seg_end"])
            if (next_end - start_time) > target_dur and end_sc_idx > start_sc_idx:
                break
            end_sc_idx += 1
            if (next_end - start_time) >= target_dur * 0.85:
                break

        end_time = float(schedule[end_sc_idx]["seg_end"])
        clip_dur = max(3.0, end_time - start_time)
        out_short = shorts_dir / f"short_{short_idx:02d}_1080x1920.mp4"

        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{start_time:.4f}",
            "-i",
            str(final_video),
            "-t",
            f"{clip_dur:.4f}",
            "-vf",
            "crop=ih*9/16:ih,scale=1080:1920,setsar=1",
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
        ]
        run_cmd(cmd)
        exported.append(out_short)
        print(
            f"📱 Exported voice-locked Short #{short_idx}: {out_short} "
            f"(scenes {start_sc_idx + 1}..{end_sc_idx + 1}, {start_time:.2f}s -> {end_time:.2f}s)"
        )

    return exported


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

    # 1. Build Continuous Master Voiceover Track (ZERO overlap, ZERO acrossfade)
    master_voice_wav, timings = build_continuous_voice_master(scenes, work_dir, folder_id)

    # 2. Compute decoupled video xfade schedule synced to [voice_start, voice_end]
    schedule, total_video_dur = compute_video_xfade_schedule(scenes, timings)

    voice_map_path = out_dir / "voice_timeline_map.json"
    voice_map_path.write_text(
        json.dumps(
            {
                "manifest_version": "2.2-FINAL",
                "zero_speech_overlap": True,
                "lead_in_sec": LEAD_IN_SEC,
                "sentence_pad_sec": SENTENCE_PAD_SEC,
                "total_duration_sec": total_video_dur,
                "scenes": schedule,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # 3. Prepare normalized 4K 24fps CFR video clips (with tpad clone tail extension when needed)
    prepared_clips: list[Path] = [
        prepare_video_clip(scenes[i], schedule[i], width, height, fps, work_dir, folder_id)
        for i in range(len(scenes))
    ]

    # 4. Concatenate / xfade ONLY the video stream cleanly inside inter-sentence pauses
    assembled_video = work_dir / "master_video_xfade.mp4"
    if len(prepared_clips) == 1:
        shutil.copy2(prepared_clips[0], assembled_video)
    else:
        v_cmd = ["ffmpeg", "-y"]
        for clip_path in prepared_clips:
            v_cmd += ["-i", str(clip_path)]

        v_filters: list[str] = []
        cur_v = "[0:v]"
        for i in range(1, len(prepared_clips)):
            sc_info = schedule[i]
            t_type = sc_info["trans_in_type"]
            d_in = float(sc_info["d_in"])
            offset = float(sc_info["xfade_offset"])
            next_v = f"[vx_{i}]"

            if d_in > 0.0 and t_type != "cut":
                v_filters.append(
                    f"{cur_v}[{i}:v]xfade=transition={t_type}:duration={d_in:.4f}:offset={offset:.4f}{next_v}"
                )
            else:
                v_filters.append(f"{cur_v}[{i}:v]concat=n=2:v=1:a=0{next_v}")
            cur_v = next_v

        fc_video_path = work_dir / "video_xfade_fc.txt"
        fc_video_path.write_text(";".join(v_filters), encoding="utf-8")

        v_cmd += [
            "-filter_complex_script",
            str(fc_video_path),
            "-map",
            cur_v,
            "-an",
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
            str(assembled_video),
        ]
        run_cmd(v_cmd)

    # 5. Build Ambient SFX Track (-22 dB default, -96 dB mute, -6.0 dB on scene_33 aligned to voice_start)
    ambient_sfx_wav = build_ambient_sfx_track(scenes, schedule, total_video_dur, work_dir, folder_id)

    # 6. Multi-track audio master (0 dB voice + ambient SFX + sidechain ducked music bed + -14.0 LUFS loudnorm)
    master_audio_wav = mix_final_master_audio(
        manifest,
        master_voice_wav,
        ambient_sfx_wav,
        schedule,
        total_video_dur,
        work_dir,
        folder_id,
    )

    # 7. Mux decoupled video + mastered stereo AAC 320k 48kHz audio
    project_name = str(manifest.get("project_name") or "output")
    project_slug = sanitize_slug(project_name)
    final_video = out_dir / f"{project_slug}.mp4"

    mux_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(assembled_video),
        "-i",
        str(master_audio_wav),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
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
    run_cmd(mux_cmd)
    shutil.copy2(final_video, Path("output.mp4"))

    # 8. Sidecar SRT files + Voice-locked 9:16 Shorts
    export_sidecar_subtitles(manifest, scenes, schedule, out_dir, project_slug)
    export_voice_locked_shorts(manifest, final_video, schedule, out_dir)

    print(f"✅ Render complete (Zero Speech Overlap): {final_video} ({total_video_dur:.2f}s)")
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

