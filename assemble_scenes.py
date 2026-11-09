#!/usr/bin/env python3
"""
assemble_scenes.py
Сборка повествовательного видео из N сцен (80, 120, 200+ сцен) по JSON-манифесту
с гибкими режимами субтитров (Hardsub / Softsub / выгрузка .SRT в Google Drive).
"""

import base64
import json
import os
import subprocess


def load_manifest() -> dict:
    b64_payload = os.environ.get("MANIFEST_B64", "").strip()
    if b64_payload:
        raw_json = base64.b64decode(b64_payload).decode("utf-8")
        with open("config.json", "w", encoding="utf-8") as f:
            f.write(raw_json)
        return json.loads(raw_json)
    if os.path.exists("config.json"):
        with open("config.json", "r", encoding="utf-8") as f:
            return json.load(f)
    raise RuntimeError("Не найден MANIFEST_B64 или config.json")


def main() -> None:
    cfg = load_manifest()
    exp = cfg.get("export_settings") or {}
    res = str(exp.get("resolution") or cfg.get("resolution") or "4k").lower()
    v_codec = str(exp.get("video_codec") or cfg.get("video_codec") or "libx264")
    preset = str(exp.get("preset") or ("veryfast" if v_codec == "libx264" else "medium"))
    fps = int(exp.get("fps") or cfg.get("fps") or 24)
    crf = str(exp.get("crf") or cfg.get("crf") or ("20" if v_codec == "libx264" else "22"))
    a_bitrate = f"{int(exp.get('audio_bitrate_kbps') or cfg.get('audio_bitrate_kbps') or 320)}k"

    scale_map = {"4k": "3840:2160", "2k": "2560:1440", "1080p": "1920:1080"}
    scale_wh = scale_map.get(res, "3840:2160")
    folder_id = (cfg.get("cloud_export") or {}).get("target_folder_id") or cfg.get("gdrive_folder_id", "")

    os.makedirs("./output", exist_ok=True)

    # Чтение гибких настроек субтитров из currentManifest.export_settings.subtitles или currentManifest.subtitles
    subs_cfg = cfg.get("subtitles") or exp.get("subtitles") or cfg.get("subtitles_burn_in") or {}
    subs_enabled = bool(subs_cfg.get("enabled", False))
    burn_in = bool(subs_cfg.get("burn_in", False))
    upload_srt = bool(subs_cfg.get("upload_srt", False))
    srt_content = str(subs_cfg.get("srt_content") or "").strip()

    if not srt_content and subs_cfg.get("srt_content_base64"):
        srt_content = base64.b64decode(subs_cfg["srt_content_base64"]).decode("utf-8")

    output_srt_path = "./output/subtitles.srt"
    if subs_enabled and (upload_srt or burn_in) and srt_content:
        with open(output_srt_path, "w", encoding="utf-8") as sf:
            sf.write(srt_content)
        with open("subtitles.srt", "w", encoding="utf-8") as sf_root:
            sf_root.write(srt_content)
        print(f"Saved subtitles to {output_srt_path} ({len(srt_content)} chars)")

    scenes = cfg.get("scenes") or []
    ffmpeg_inputs = []
    filter_parts = []

    for idx, sc in enumerate(scenes):
        file_name = str(sc.get("file_name") or sc.get("filename") or "").strip()
        dur = max(0.5, float(sc.get("duration") or 6.0))
        if not file_name:
            continue
        in_i = len(ffmpeg_inputs) // 2
        ffmpeg_inputs += ["-i", file_name]
        filter_parts.append(
            f"[{in_i}:v]scale={scale_wh},setsar=1,fps={fps},trim=duration={dur},setpts=PTS-STARTPTS[v{in_i}]"
        )

    valid_count = len(ffmpeg_inputs) // 2
    if valid_count == 0:
        raise RuntimeError("В манифесте нет заполненных видеофайлов сцен (scenes[].file_name)")

    if valid_count == 1:
        cur_v = "v0"
    else:
        concat_inputs = "".join(f"[v{i}]" for i in range(valid_count))
        filter_parts.append(f"{concat_inputs}concat=n={valid_count}:v=1:a=0[v_concat]")
        cur_v = "v_concat"

    # Если subtitles.burn_in === true: FFmpeg применяет фильтр -vf "subtitles=subtitles.srt:..."
    # Если subtitles.burn_in === false: видео рендерится чистым без наложения титров
    if subs_enabled and burn_in and srt_content:
        sub_style = (
            "FontName=Inter,FontSize=26,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=45"
        )
        filter_parts.append(f"[{cur_v}]subtitles=subtitles.srt:force_style='{sub_style}'[v_out]")
        cur_v = "v_out"

    out_video = "./output/final_narrative_master.mp4"
    with open("filter_complex_scenes.txt", "w", encoding="utf-8") as f:
        f.write(";".join(filter_parts))

    cmd = [
        "ffmpeg", "-y",
        *ffmpeg_inputs,
        "-filter_complex_script", "filter_complex_scenes.txt",
        "-map", f"[{cur_v}]",
        "-r", str(fps),
        "-c:v", v_codec, "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", a_bitrate,
        "-movflags", "+faststart",
        out_video,
    ]
    print("Running FFmpeg scenes assembly:", " ".join(cmd))
    subprocess.run(cmd, check=True)

    if folder_id:
        subprocess.run(
            ["rclone", "copy", out_video, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
            check=True,
        )
        # Если subtitles.upload_srt === true: Rclone выгружает ./output/subtitles.srt на Google Диск вместе с готовым видео
        if subs_enabled and upload_srt and os.path.exists(output_srt_path):
            subprocess.run(
                ["rclone", "copy", output_srt_path, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
                check=True,
            )


if __name__ == "__main__":
    main()
