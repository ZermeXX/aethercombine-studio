#!/usr/bin/env python3
"""
assemble_pipeline.py
Универсальный конвейер сборки видео и слотов (FFmpeg + Rclone Google Drive)
с поддержкой кэширования скомпилированных видео-слотов в ./temp_render/ (slot_1.mp4, slot_2.mp4 ... + concat -c copy),
гибких режимов субтитров (Hardsub burn_in / Softsub upload_srt / .SRT),
режима Черновик Draft 720p ultrafast и Telegram-уведомлений.
"""

import base64
import json
import os
import subprocess
import urllib.request


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


def is_valid_cached_slot(slot_path: str) -> bool:
    return os.path.exists(slot_path) and os.path.getsize(slot_path) > 1024


def run_pipeline(cfg: dict) -> None:
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
    folder_id = (cfg.get("cloud_export") or {}).get("target_folder_id") or cfg.get("gdrive_folder_id", "")

    os.makedirs("./output", exist_ok=True)
    os.makedirs("./temp_render", exist_ok=True)

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

    timeline_slots = cfg.get("timeline_slots") or cfg.get("slots") or []
    output_video = cfg.get("output_filename") or f"./output/master_{res}_{v_codec}_{fps}fps.mp4"
    master_audio_file = str(
        (cfg.get("master_audio") or {}).get("file_name") or cfg.get("audio_filename") or ""
    ).strip()

    # Если есть timeline_slots, проверяем кэш слотов в ./temp_render/ (slot_1.mp4, slot_2.mp4...)
    if timeline_slots:
        cached_slot_paths = []
        for idx, slot in enumerate(timeline_slots):
            slot_num = idx + 1
            slot_path = f"./temp_render/slot_{slot_num}.mp4"
            base_content = slot.get("base_content") if isinstance(slot.get("base_content"), dict) else {}
            src_clip = (
                base_content.get("file_name")
                or slot.get("file_name")
                or slot.get("filename")
                or ""
            )
            slot_dur = float(slot.get("slot_duration_sec") or 1800)

            if is_valid_cached_slot(slot_path):
                print(f"[CACHE HIT] Слот {slot_path} уже существует в ./temp_render/ — пропускаем перерендер.")
            elif src_clip:
                print(f"[CACHE MISS] Генерация слота #{slot_num} в {slot_path} ...")
                slot_cmd = [
                    "ffmpeg", "-y",
                    "-stream_loop", "-1",
                    "-t", str(slot_dur),
                    "-i", src_clip,
                    "-r", str(fps),
                    "-c:v", v_codec, "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", a_bitrate,
                    slot_path,
                ]
                subprocess.run(slot_cmd, check=True)
            if os.path.exists(slot_path):
                cached_slot_paths.append(slot_path)

        if cached_slot_paths:
            concat_txt = "./temp_render/concat_slots.txt"
            with open(concat_txt, "w", encoding="utf-8") as cf:
                for p in cached_slot_paths:
                    cf.write(f"file '{os.path.abspath(p)}'\n")

            fast_concat_cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_txt]
            if master_audio_file and os.path.exists(master_audio_file):
                fast_concat_cmd += [
                    "-i", master_audio_file,
                    "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", a_bitrate,
                    "-shortest", "-movflags", "+faststart", output_video,
                ]
            else:
                fast_concat_cmd += ["-c", "copy", "-movflags", "+faststart", output_video]

            print("Fast concat of cached slots:", " ".join(fast_concat_cmd))
            subprocess.run(fast_concat_cmd, check=True)
            if folder_id:
                subprocess.run(
                    ["rclone", "copy", output_video, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
                    check=True,
                )
            send_telegram_alert(cfg, "✅ Рендеринг и выгрузка успешно завершены!")
            return

    input_video = cfg.get("video_filename") or "input_master.mp4"
    vf_filters = []
    if res == "720p":
        vf_filters.append("scale=1280:720")
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
    try:
        subprocess.run(cmd, check=True)
    except Exception as exc:
        send_telegram_alert(cfg, f"❌ Ошибка сборки на этапе FFmpeg: {exc}. Проверьте лог FFmpeg.")
        raise

    if folder_id:
        subprocess.run(
            ["rclone", "copy", output_video, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
            check=True,
        )
        if subs_enabled and upload_srt and os.path.exists(output_srt_path):
            subprocess.run(
                ["rclone", "copy", output_srt_path, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
                check=True,
            )

    send_telegram_alert(
        cfg,
        "✅ Рендеринг и выгрузка успешно завершены!",
    )


if __name__ == "__main__":
    raw_b64 = os.environ.get("MANIFEST_B64", "").strip()
    if raw_b64:
        manifest_data = json.loads(base64.b64decode(raw_b64).decode("utf-8"))
    elif os.path.exists("manifest.json"):
        with open("manifest.json", "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
    elif os.path.exists("config.json"):
        with open("config.json", "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
    else:
        manifest_data = {}
    run_pipeline(manifest_data)
