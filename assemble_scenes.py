#!/usr/bin/env python3
"""
assemble_scenes.py
Сборка повествовательного видео и слотов по JSON-манифесту
с кэшированием скомпилированных видео-слотов в ./temp_render/ (slot_1.mp4, slot_2.mp4 ... + быстрая склейка concat -c copy),
гибкими режимами субтитров (Hardsub / Softsub / .SRT), авто-нарезкой Shorts 9:16 и уведомлениями в Telegram.
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
        with open("manifest.json", "w", encoding="utf-8") as mf:
            mf.write(raw_json)
        return json.loads(raw_json)
    if os.path.exists("manifest.json"):
        with open("manifest.json", "r", encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists("config.json"):
        with open("config.json", "r", encoding="utf-8") as f:
            return json.load(f)
    raise RuntimeError("Не найден MANIFEST_B64, manifest.json или config.json")


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
    """Проверяет, существует ли скомпилированный слот в ./temp_render/ и валиден ли он."""
    return os.path.exists(slot_path) and os.path.getsize(slot_path) > 1024


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
    os.makedirs("./temp_render", exist_ok=True)

    # Чтение гибких настроек субтитров
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
    valid_scenes = [sc for sc in scenes if str(sc.get("file_name") or sc.get("filename") or "").strip()]
    if not valid_scenes:
        send_telegram_alert(cfg, "❌ Сбой рендера AetherCombine: в манифесте нет заполненных видеофайлов сцен.")
        raise RuntimeError("В манифесте нет заполненных видеофайлов сцен (scenes[].file_name)")

    # 1. Кэширование слотов в ./temp_render/ (slot_1.mp4, slot_2.mp4 и т.д.)
    # Если файлы слотов уже существуют в temp_render и валидны, пропускаем их тяжелый перерендер
    slot_files = []
    for idx, sc in enumerate(valid_scenes):
        slot_num = idx + 1
        slot_path = f"./temp_render/slot_{slot_num}.mp4"
        file_name = str(sc.get("file_name") or sc.get("filename")).strip()
        dur = max(0.5, float(sc.get("duration") or 6.0))

        if is_valid_cached_slot(slot_path):
            print(f"[CACHE HIT] Слот {slot_path} найден в ./temp_render/ — пропускаем тяжелый перерендер.")
        else:
            print(f"[CACHE MISS] Рендеринг слота #{slot_num} -> {slot_path} ...")
            slot_cmd = [
                "ffmpeg", "-y",
                "-i", file_name,
                "-vf", f"scale={scale_wh},setsar=1,fps={fps},trim=duration={dur},setpts=PTS-STARTPTS",
                "-r", str(fps),
                "-c:v", v_codec, "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p",
                "-an",
                slot_path,
            ]
            subprocess.run(slot_cmd, check=True)
        slot_files.append(slot_path)

    # 2. Быстрая склейка кэшированных слотов (concat -c copy) + наложение новой аудиодорожки
    concat_list_path = "./temp_render/slots_concat.txt"
    with open(concat_list_path, "w", encoding="utf-8") as cf:
        for sp in slot_files:
            abs_sp = os.path.abspath(sp)
            cf.write(f"file '{abs_sp}'\n")

    concat_video_path = "./temp_render/concatenated_video.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list_path, "-c", "copy", concat_video_path],
        check=True,
    )

    master_audio_cfg = cfg.get("master_audio") or {}
    master_audio_file = str(
        master_audio_cfg.get("file_name") or cfg.get("audio_filename") or ""
    ).strip()

    out_video = "./output/final_narrative_master.mp4"

    # Если требуется вшивание субтитров (burn_in), применяем поверх склеенного потока; иначе быстрое копирование видеопотока (-c:v copy)
    if subs_enabled and burn_in and srt_content:
        sub_style = (
            "FontName=Inter,FontSize=26,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=45"
        )
        cmd = ["ffmpeg", "-y", "-i", concat_video_path]
        if master_audio_file and os.path.exists(master_audio_file):
            cmd += ["-i", master_audio_file, "-map", "0:v:0", "-map", "1:a:0", "-shortest"]
        cmd += [
            "-vf", f"subtitles=subtitles.srt:force_style='{sub_style}'",
            "-c:v", v_codec, "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", a_bitrate,
            "-movflags", "+faststart",
            out_video,
        ]
    else:
        cmd = ["ffmpeg", "-y", "-i", concat_video_path]
        if master_audio_file and os.path.exists(master_audio_file):
            cmd += [
                "-i", master_audio_file,
                "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", a_bitrate,
                "-shortest",
                "-movflags", "+faststart",
                out_video,
            ]
        else:
            cmd += ["-c", "copy", "-movflags", "+faststart", out_video]

    print("Running FFmpeg final assembly:", " ".join(cmd))
    try:
        subprocess.run(cmd, check=True)
        if os.path.exists(out_video):
            import shutil
            shutil.copyfile(out_video, "./output.mp4")
        slice_viral_shorts(cfg, scenes, fps, folder_id)
    except Exception as exc:
        send_telegram_alert(cfg, f"❌ Ошибка сборки FFmpeg: {exc}. Проверьте лог FFmpeg.")
        raise

    if folder_id:
        subprocess.run(
            ["rclone", "copy", out_video, "gdrive:", "--drive-root-folder-id", folder_id, "-P"],
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
    main()
