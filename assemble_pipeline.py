#!/usr/bin/env python3
"""
assemble_pipeline.py
Универсальный конвейер сборки видео и слотов (FFmpeg + Rclone Google Drive)
с поддержкой гибких режимов субтитров (Hardsub burn_in / Softsub upload_srt / .SRT).
"""

import base64
import json
import os
import subprocess


def run_pipeline(cfg: dict) -> None:
    exp = cfg.get("export_settings") or {}
    res = str(exp.get("resolution") or cfg.get("resolution") or "4k").lower()
    v_codec = str(exp.get("video_codec") or cfg.get("video_codec") or "libx264")
    preset = str(exp.get("preset") or ("veryfast" if v_codec == "libx264" else "medium"))
    fps = int(exp.get("fps") or cfg.get("fps") or 24)
    crf = str(exp.get("crf") or cfg.get("crf") or ("20" if v_codec == "libx264" else "22"))
    a_bitrate = f"{int(exp.get('audio_bitrate_kbps') or cfg.get('audio_bitrate_kbps') or 320)}k"
    folder_id = (cfg.get("cloud_export") or {}).get("target_folder_id") or cfg.get("gdrive_folder_id", "")

    os.makedirs("./output", exist_ok=True)

    # Параметры гибкой системы субтитров из манифеста (export_settings.subtitles / subtitles)
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
        print(f"Saved SRT file to {output_srt_path}")

    input_video = cfg.get("video_filename") or "input_master.mp4"
    output_video = cfg.get("output_filename") or f"./output/master_{res}_{v_codec}_{fps}fps.mp4"

    vf_filters = []
    # Если subtitles.burn_in === true: FFmpeg применяет фильтр -vf "subtitles=subtitles.srt:..."
    # Если subtitles.burn_in === false: видео рендерится чистым без наложения титров
    if subs_enabled and burn_in and srt_content:
        vf_filters.append(
            "subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=45'"
        )

    cmd = ["ffmpeg", "-y", "-i", input_video]
    if vf_filters:
        cmd += ["-vf", ",".join(vf_filters)]
    cmd += [
        "-r", str(fps),
        "-c:v", v_codec, "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", a_bitrate,
        "-movflags", "+faststart",
        output_video,
    ]

    print("Executing FFmpeg pipeline:", " ".join(cmd))
    subprocess.run(cmd, check=True)

    if folder_id:
        subprocess.run(
            ["rclone", "copy", output_video, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
            check=True,
        )
        # Если subtitles.upload_srt === true: Rclone выгружает ./output/subtitles.srt на Google Диск вместе с готовым видео
        if subs_enabled and upload_srt and os.path.exists(output_srt_path):
            subprocess.run(
                ["rclone", "copy", output_srt_path, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
                check=True,
            )


if __name__ == "__main__":
    raw_b64 = os.environ.get("MANIFEST_B64", "").strip()
    if raw_b64:
        manifest_data = json.loads(base64.b64decode(raw_b64).decode("utf-8"))
    elif os.path.exists("config.json"):
        with open("config.json", "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
    else:
        manifest_data = {}
    run_pipeline(manifest_data)
