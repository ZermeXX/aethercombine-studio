#!/usr/bin/env python3
"""
assemble_scenes.py
Сборка повествовательного видео из N сцен (80, 120, 200+ сцен) по JSON-манифесту
с гибкими режимами субтитров (Hardsub / Softsub / выгрузка .SRT в Google Drive),
авто-нарезкой вирусных Shorts (9:16, 1080x1920) в ./output/shorts/ и уведомлениями в Telegram.
"""

import base64
import json
import os
import subprocess
import urllib.request


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


def send_telegram_alert(cfg: dict, text: str) -> None:
    tg = cfg.get("telegram_notifications") or {}
    bot_token = (tg.get("bot_token") or os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (tg.get("chat_id") or os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if not bot_token or not chat_id:
        return
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception as exc:
        print(f"Telegram alert warning: {exc}")


def slice_viral_shorts(cfg: dict, scenes: list, fps: int, folder_id: str) -> None:
    shorts_cfg = cfg.get("shorts_config") or (cfg.get("export_settings") or {}).get("shorts") or {}
    if not shorts_cfg.get("enabled", False):
        return

    count = max(1, min(3, int(shorts_cfg.get("count") or 3)))
    shorts_dir = shorts_cfg.get("output_dir") or "./output/shorts"
    os.makedirs(shorts_dir, exist_ok=True)
    clips_meta = shorts_cfg.get("clips") or []

    valid_scenes = [s for s in scenes if str(s.get("file_name") or s.get("filename") or "").strip()]
    if not valid_scenes:
        return

    for idx in range(min(count, len(valid_scenes))):
        sc = valid_scenes[idx]
        src_file = str(sc.get("file_name") or sc.get("filename")).strip()
        clip_info = clips_meta[idx] if idx < len(clips_meta) else {}
        hook_text = str(
            clip_info.get("hook_text_en")
            or sc.get("subtitle_text")
            or f"SECRET ARCHIVE SCENE #{idx + 1}"
        ).upper()
        safe_hook = hook_text.replace("'", "").replace(":", " -")[:42]
        out_short = os.path.join(shorts_dir, f"short_{idx + 1}_9x16.mp4")

        vf_chain = (
            "crop=ih*9/16:ih,scale=1080:1920,setsar=1,"
            f"drawtext=text='{safe_hook}':fontcolor=white:fontsize=52:"
            "box=1:boxcolor=black@0.65:boxborderw=18:x=(w-text_w)/2:y=180"
        )
        short_cmd = [
            "ffmpeg", "-y",
            "-i", src_file,
            "-vf", vf_chain,
            "-t", "15",
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            out_short,
        ]
        print(f"Generating 9:16 Short #{idx + 1}:", " ".join(short_cmd))
        subprocess.run(short_cmd, check=True)

    if folder_id and shorts_cfg.get("upload_to_gdrive", True):
        subprocess.run(
            ["rclone", "copy", shorts_dir, "gdrive:shorts", "--drive-root-folder-id", folder_id, "-P"],
            check=True,
        )


def main() -> None:
    cfg = load_manifest()
    exp = cfg.get("export_settings") or {}
    res = str(exp.get("resolution") or cfg.get("resolution") or "4k").lower()
    draft_mode = bool(exp.get("draft_mode") or res == "720p")
    v_codec = str(exp.get("video_codec") or cfg.get("video_codec") or "libx264")
    preset = str(
        exp.get("preset")
        or ("ultrafast" if draft_mode else ("veryfast" if v_codec == "libx264" else "medium"))
    )
    fps = int(exp.get("fps") or cfg.get("fps") or 24)
    crf = str(exp.get("crf") or cfg.get("crf") or ("20" if v_codec == "libx264" else "22"))
    a_bitrate = f"{int(exp.get('audio_bitrate_kbps') or cfg.get('audio_bitrate_kbps') or 320)}k"

    scale_map = {
        "4k": "3840:2160",
        "2k": "2560:1440",
        "1080p": "1920:1080",
        "720p": "1280:720",
    }
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
        send_telegram_alert(cfg, "❌ Сбой рендера AetherCombine: в манифесте нет заполненных видеофайлов сцен.")
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
    try:
        subprocess.run(cmd, check=True)
        slice_viral_shorts(cfg, scenes, fps, folder_id)
    except Exception as exc:
        send_telegram_alert(cfg, f"❌ Сбой рендера FFmpeg в AetherCombine: {exc}")
        raise

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

    send_telegram_alert(
        cfg,
        f"✅ Готово! Мастер-файл ({res.upper()}, {v_codec}, preset {preset}) выгружен в Google Drive.",
    )


if __name__ == "__main__":
    main()

