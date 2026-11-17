import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def run_cmd(cmd: list[str]) -> None:
    print("▶", " ".join(cmd))
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


def resolve_asset(filename: str | None, work_dir: Path, folder_id: str | None) -> Path | None:
    if not filename:
        return None

    candidates = [
        work_dir / filename,
        Path("assets") / filename,
        Path("input") / filename,
        Path(filename),
    ]
    for path in candidates:
        if path.is_file():
            return path

    if folder_id:
        remote = os.getenv("GDRIVE_REMOTE", "gdrive")
        dest = work_dir / Path(filename).name
        dest.parent.mkdir(parents=True, exist_ok=True)
        run_cmd([
            "rclone",
            "copyto",
            f"{remote}:{filename}",
            str(dest),
            "--drive-root-folder-id",
            folder_id,
        ])
        if dest.is_file():
            return dest

    return None


def get_normalized_scenes(manifest: dict) -> list[dict]:
    raw_scenes = manifest.get("timeline") or manifest.get("scenes") or []
    normalized = []

    for item in raw_scenes:
        scene = dict(item)
        assets = scene.get("assets") or {}
        vid_proc = scene.get("video_processing") or {}
        aud_proc = scene.get("audio_processing") or {}
        trans_in = vid_proc.get("transition_in") or {}
        trans_out = vid_proc.get("transition_out") or {}

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
        )

        scene["file_name"] = video_file
        scene["video_file"] = video_file
        if voice_file:
            scene["voiceover_file"] = voice_file
            scene["audio_file"] = voice_file

        if "transition" not in scene and trans_in:
            scene["transition"] = trans_in.get("type", "cut")
            scene["transition_duration"] = float(trans_in.get("duration_sec", 0.0))

        if "transition_out_type" not in scene and trans_out:
            scene["transition_out_type"] = trans_out.get("type", "none")
            scene["transition_out_duration"] = float(trans_out.get("duration_sec", 0.0))

        if "mute_audio" not in scene and "video_ambient_mute" in aud_proc:
            scene["mute_audio"] = bool(aud_proc["video_ambient_mute"])
        if "ambient_gain_db" not in scene and "video_ambient_gain_db" in aud_proc:
            scene["ambient_gain_db"] = float(aud_proc["video_ambient_gain_db"])
        if "voiceover_gain_db" not in scene and "voiceover_gain_db" in aud_proc:
            scene["voiceover_gain_db"] = float(aud_proc["voiceover_gain_db"])

        normalized.append(scene)

    return normalized


def prepare_scene(
    scene: dict,
    idx: int,
    width: int,
    height: int,
    fps: int,
    folder_id: str | None,
) -> tuple[Path, float, float]:
    assets = scene.get("assets") or {}
    video_name = (
        scene.get("file_name")
        or scene.get("video_file")
        or assets.get("video_file")
        or assets.get("image_reference")
    )
    if not video_name:
        raise KeyError(f"В сцене #{idx + 1} не указано имя видеофайла (file_name / video_file)")

    voice_name = (
        scene.get("voiceover_file")
        or scene.get("audio_file")
        or assets.get("voiceover_file")
    )

    dur = float(scene.get("duration_sec") or scene.get("duration") or 10.0)
    cf_dur = float(scene.get("transition_duration") or 0.0)
    if (scene.get("transition") or "cut") == "cut":
        cf_dur = 0.0

    work_dir = Path("build/scenes")
    work_dir.mkdir(parents=True, exist_ok=True)

    src_video = resolve_asset(video_name, work_dir, folder_id)
    if not src_video or not src_video.is_file():
        raise FileNotFoundError(f"Не найден видеофайл для сцены #{idx + 1}: {video_name}")

    src_voice = resolve_asset(voice_name, work_dir, folder_id) if voice_name else None

    out_path = work_dir / f"norm_{idx + 1:03d}.mp4"
    is_image = src_video.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}

    v_filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
        f"fps={fps}",
        "setsar=1",
        "format=yuv420p",
        "setpts=PTS-STARTPTS",
    ]
    if idx == 0 and cf_dur > 0 and scene.get("transition") in {"fade", "fadeblack"}:
        v_filters.append(f"fade=t=in:st=0:d={cf_dur:.3f}")
        cf_dur = 0.0

    out_trans = scene.get("transition_out_type", "none")
    out_trans_dur = float(scene.get("transition_out_duration") or 0.0)
    if out_trans in {"fade_to_black", "fadeblack", "fade"} and out_trans_dur > 0:
        fade_start = max(0.0, dur - out_trans_dur)
        v_filters.append(f"fade=t=out:st={fade_start:.3f}:d={out_trans_dur:.3f}")

    cmd = ["ffmpeg", "-y"]
    if is_image:
        cmd += ["-loop", "1", "-t", f"{dur:.3f}", "-i", str(src_video)]
    else:
        cmd += ["-i", str(src_video)]

    filter_parts = [f"[0:v]{','.join(v_filters)}[vout]"]
    mute_ambient = bool(scene.get("mute_audio", False))
    ambient_gain = float(scene.get("ambient_gain_db", -22.0))
    voice_gain = float(scene.get("voiceover_gain_db", 0.0))
    video_has_audio = (not is_image) and has_audio_stream(src_video)

    if src_voice and src_voice.is_file():
        cmd += ["-i", str(src_voice)]
        filter_parts.append(
            f"[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={voice_gain}dB,apad,atrim=0:{dur:.3f},asetpts=PTS-STARTPTS[avo]"
        )
        if video_has_audio and not mute_ambient and ambient_gain > -90.0:
            filter_parts.append(
                f"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                f"volume={ambient_gain}dB,apad,atrim=0:{dur:.3f},asetpts=PTS-STARTPTS[aamb]"
            )
            filter_parts.append("[avo][aamb]amix=inputs=2:duration=first:normalize=0[aout]")
        else:
            filter_parts.append("[avo]acopy[aout]")
    elif video_has_audio and not mute_ambient and ambient_gain > -90.0:
        filter_parts.append(
            f"[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={ambient_gain}dB,apad,atrim=0:{dur:.3f},asetpts=PTS-STARTPTS[aout]"
        )
    else:
        filter_parts.append(f"anullsrc=r=48000:cl=stereo:d={dur:.3f}[aout]")

    cmd += [
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-t",
        f"{dur:.3f}",
        "-r",
        str(fps),
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-crf",
        "16",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(out_path),
    ]
    run_cmd(cmd)
    return out_path, dur, cf_dur


def main() -> None:
    manifest_path = Path(sys.argv[1] if len(sys.argv) > 1 else os.getenv("MANIFEST_PATH", "manifest.json"))
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Манифест не найден: {manifest_path}")

    with manifest_path.open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    scenes = get_normalized_scenes(manifest)
    if not scenes:
        raise ValueError("В манифесте отсутствуют сцены (timeline / scenes пуст)")

    render_cfg = manifest.get("render_settings") or {}
    res_str = str(render_cfg.get("resolution", "3840x2160")).split()[0]
    width, height = (int(x) for x in res_str.lower().split("x"))
    fps = int(render_cfg.get("fps", 24))
    crf = int(render_cfg.get("crf", 18))
    preset = str(render_cfg.get("preset", "slow"))
    audio_bitrate = str(render_cfg.get("audio_bitrate", "320k"))
    folder_id = os.getenv("GDRIVE_FOLDER_ID") or manifest.get("gdrive_folder_id") or manifest.get("folder_id")

    prepared: list[tuple[Path, float, float, str]] = []
    for idx, scene in enumerate(scenes):
        sc_path, dur, cf_dur = prepare_scene(scene, idx, width, height, fps, folder_id)
        trans_type = str(scene.get("transition") or "cut")
        prepared.append((sc_path, dur, cf_dur, trans_type))

    project_name = manifest.get("project_name", "output")
    out_dir = Path("output")
    out_dir.mkdir(parents=True, exist_ok=True)
    final_video = out_dir / f"{project_name}.mp4"

    if len(prepared) == 1:
        shutil.copy2(prepared[0][0], final_video)
        return

    cmd = ["ffmpeg", "-y"]
    for sc_path, _, _, _ in prepared:
        cmd += ["-i", str(sc_path)]

    filters = []
    cur_v = "[0:v]"
    cur_a = "[0:a]"
    total_dur = prepared[0][1]

    for idx in range(1, len(prepared)):
        _, dur_i, cf_dur_i, trans_type = prepared[idx]
        next_v = f"[v{idx}]"
        next_a = f"[a{idx}]"

        if cf_dur_i > 0.0 and trans_type != "cut":
            offset = max(0.0, total_dur - cf_dur_i)
            filters.append(
                f"{cur_v}[{idx}:v]xfade=transition={trans_type}:duration={cf_dur_i:.3f}:offset={offset:.3f}{next_v}"
            )
            filters.append(
                f"{cur_a}[{idx}:a]acrossfade=d={cf_dur_i:.3f}:c1=tri:c2=tri{next_a}"
            )
            total_dur = total_dur + dur_i - cf_dur_i
        else:
            filters.append(f"{cur_v}[{idx}:v]concat=n=2:v=1:a=0{next_v}")
            filters.append(f"{cur_a}[{idx}:a]concat=n=2:v=0:a=1{next_a}")
            total_dur += dur_i

        cur_v = next_v
        cur_a = next_a

    loudnorm = render_cfg.get("loudness_normalization") or {}
    if loudnorm.get("enabled", True):
        lufs = float(loudnorm.get("target_lufs", -14.0))
        tp = float(loudnorm.get("true_peak_db", -1.0))
        lra = float(loudnorm.get("lra", 7.0))
        filters.append(f"{cur_a}loudnorm=I={lufs}:TP={tp}:LRA={lra}[afinal]")
        cur_a = "[afinal]"

    cmd += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        cur_v,
        "-map",
        cur_a,
        "-r",
        str(fps),
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-level",
        "5.1",
        "-crf",
        str(crf),
        "-preset",
        preset,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        audio_bitrate,
        "-ar",
        "48000",
        "-ac",
        "2",
        str(final_video),
    ]
    run_cmd(cmd)
    print(f"✅ Render complete: {final_video} ({total_dur:.2f}s)")


if __name__ == "__main__":
    main()
