#!/usr/bin/env python3
"""
assemble_pipeline.py — многочасовой луп (loop-baker + честные кроссфейды актов + concat -c copy).
Совместимость: manifest.json (timeline_slots), ./input_clips, ./output,
final_output_name.txt, final_chapters_name.txt, qc_report.json, shorts_factory.py.
Секреты — только из окружения / GitHub Secrets, никогда из манифеста.
Запуск: python3 assemble_pipeline.py manifest.json [--stream | --local] [--preflight] [--selftest]
"""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys

FPS = 24
TAIL_BLACK = 2.0
FADE_OUT = 1.5
RES = {"720p": (1280, 720), "1080p": (1920, 1080), "2k": (2560, 1440), "4k": (3840, 2160)}


def run(cmd, capture=False):
    print("\n[EXEC]: " + (" ".join(cmd) if isinstance(cmd, list) else cmd), flush=True)
    if capture:
        return subprocess.run(cmd, check=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True)
    return subprocess.run(cmd, check=True)


def probe(path):
    res = run(["ffprobe", "-v", "error", "-print_format", "json",
               "-show_format", "-show_streams", path], capture=True)
    data = json.loads(res.stdout)
    dur = float(data.get("format", {}).get("duration", 0) or 0)
    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
    fps = 0.0
    try:
        num, den = str(v.get("r_frame_rate", "0/1")).split("/")
        fps = float(num) / float(den) if float(den) else 0.0
    except Exception:
        fps = 0.0
    return {"duration": dur, "fps": fps, "has_audio": a is not None,
            "vcodec": v.get("codec_name", ""), "width": v.get("width", 0),
            "height": v.get("height", 0)}


def fmt_duration(sec):
    sec = int(round(max(0.0, sec)))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def resolve_file(input_dir, filename):
    if not filename or not str(filename).strip():
        raise ValueError("Пустое имя файла в манифесте. Заполните все слоты в Studio.")
    exact = os.path.join(input_dir, filename)
    if os.path.exists(exact):
        return exact
    for f in sorted(os.listdir(input_dir)):
        if f.lower() == str(filename).lower():
            return os.path.join(input_dir, f)
    raise FileNotFoundError(f"Файл '{filename}' не найден в {input_dir}. "
                            f"Найдено файлов: {len(os.listdir(input_dir))}")


def guard_slots(slots):
    if not slots:
        raise SystemExit("[P0-GUARD] timeline_slots пуст — рендер запрещён.")
    empty = [i + 1 for i, s in enumerate(slots)
             if not str((s.get("base_content") or {}).get("file_name")
                        or s.get("file_name") or "").strip()]
    if empty:
        raise SystemExit(f"[P0-GUARD] Пустые file_name в слотах {empty}. "
                         f"Рендер запрещён до заполнения (никаких -i \"\").")


def slot_duration_sec(slot, idx=0):
    """Каноническое поле — slot_duration_sec (manifest.json / build_timeline.py / render_loop.yml).
    duration_sec оставлен только как legacy-fallback."""
    raw = slot.get("slot_duration_sec")
    if raw in (None, "", 0, "0"):
        raw = slot.get("duration_sec")
    if raw in (None, "", 0, "0"):
        print(f"[WARN] Слот {idx + 1}: slot_duration_sec отсутствует — fallback 1800s.", flush=True)
        raw = 1800
    val = float(raw)
    if val <= 0:
        raise SystemExit(f"[P0-GUARD] Слот {idx + 1}: некорректная длительность {val}s.")
    return val


def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def enc_args(codec, preset, crf):
    return ["-c:v", codec, "-preset", preset, "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-r", str(FPS), "-video_track_timescale", "24000",
            "-c:a", "aac", "-b:a", "320k", "-ar", "48000"]


def bake_loop(src, seam, cache_dir, w, h):
    """Запекает бесшовный луп длины S-seam: xfade(src,src,offset=S-seam) + trim[seam:S]."""
    info = probe(src)
    S = info["duration"]
    if S <= seam + 0.5:
        raise SystemExit(f"[P0-GUARD] Исходник '{src}' короток ({S:.2f}s) для шва {seam}s.")
    os.makedirs(cache_dir, exist_ok=True)
    L = S - seam
    out = os.path.join(cache_dir, f"baked_{md5_of(src)}_{S:.3f}_{seam:.3f}_{w}x{h}.mp4")
    if os.path.exists(out) and abs(probe(out)["duration"] - L) < 0.6:
        print(f"[CACHE] baked loop: {out}", flush=True)
        return out, L
    pre = f"fps={FPS},settb=AVTB,format=yuv420p"
    vf = (f"[0:v]split=2[va][vb];"
          f"[va]trim=0:{S},setpts=PTS-STARTPTS,{pre}[fa];"
          f"[vb]trim=0:{S},setpts=PTS-STARTPTS,{pre}[fb];"
          f"[fa][fb]xfade=transition=fade:duration={seam}:offset={S - seam}[x];"
          f"[x]trim=start={seam}:duration={L},setpts=PTS-STARTPTS,"
          f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1[v]")
    inputs = ["-i", src]
    if info["has_audio"]:
        af = (f"[0:a]asplit=2[aa][ab];"
              f"[aa]atrim=0:{S},asetpts=PTS-STARTPTS[ga];"
              f"[ab]atrim=0:{S},asetpts=PTS-STARTPTS[gb];"
              f"[ga][gb]acrossfade=d={seam}:c1=tri:c2=tri[xa];"
              f"[xa]atrim=start={seam}:duration={L},asetpts=PTS-STARTPTS[a]")
    else:
        inputs += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        af = f"[1:a]atrim=0:{L},asetpts=PTS-STARTPTS[a]"
    run(["ffmpeg", "-y"] + inputs + ["-filter_complex", vf + ";" + af,
         "-map", "[v]", "-map", "[a]", "-t", f"{L}"] + enc_args("libx264", "veryfast", 18) + [out])
    return out, L


def cached_piece(out, want_dur, codec):
    if os.path.exists(out):
        ci = probe(out)
        if abs(ci["duration"] - want_dur) < 0.6 and ci["vcodec"] == codec:
            print(f"[CACHE] piece reuse: {out}", flush=True)
            return True
    return False


def render_body(baked, skip, dur, out, enc, codec, fade=False):
    if cached_piece(out, dur, codec):
        return
    vf = f"fps={FPS},format=yuv420p"
    af = "anull"
    if fade:
        vf += f",fade=t=out:st={max(0.0, dur - FADE_OUT)}:d={FADE_OUT}"
        af = f"afade=t=out:st={max(0.0, dur - FADE_OUT)}:d={FADE_OUT}"
    run(["ffmpeg", "-y", "-stream_loop", "-1", "-ss", f"{skip}", "-i", baked,
         "-t", f"{dur}", "-vf", vf, "-af", af] + enc + [out])


def render_transition(baked_a, off_a, baked_b, C, out, enc, codec):
    if cached_piece(out, C, codec):
        return
    fc = (f"[0:v]fps={FPS},settb=AVTB,format=yuv420p[va];"
          f"[1:v]fps={FPS},settb=AVTB,format=yuv420p[vb];"
          f"[va][vb]xfade=transition=fade:duration={C}:offset=0[v];"
          f"[0:a]atrim=0:{C},asetpts=PTS-STARTPTS[aa];"
          f"[1:a]atrim=0:{C},asetpts=PTS-STARTPTS[ab];"
          f"[aa][ab]acrossfade=d={C}:c1=tri:c2=tri[a]")
    run(["ffmpeg", "-y", "-stream_loop", "-1", "-ss", f"{off_a}", "-t", f"{C}", "-i", baked_a,
         "-stream_loop", "-1", "-t", f"{C}", "-i", baked_b,
         "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-t", f"{C}"] + enc + [out])


def render_tail(out, enc, codec, w, h):
    if cached_piece(out, TAIL_BLACK, codec):
        return
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=black:s={w}x{h}:r={FPS}:d={TAIL_BLACK}",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{TAIL_BLACK}"] + enc + [out])


def measure_loudness(concat_list):
    res = subprocess.run(["ffmpeg", "-f", "concat", "-safe", "0", "-i", concat_list,
                          "-map", "0:a", "-af", "loudnorm=I=-16:TP=-3:LRA=11:print_format=json",
                          "-f", "null", "-"], stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True)
    m = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", res.stderr)
    if not m:
        return None
    try:
        return json.loads(m[-1])
    except Exception:
        return None


def plan_pieces(durs, C):
    n = len(durs)
    pieces, starts, pos = [], [], 0.0
    for i, d in enumerate(durs):
        head = C if i > 0 else 0.0
        tailc = C if i < n - 1 else 0.0
        b = d - head - tailc
        if b <= 5:
            raise SystemExit(f"[P0-GUARD] Слот {i + 1}: duration {d}s слишком мал для двух "
                             f"кроссфейдов по {C}s. Увеличьте слот или уменьшите crossfade.")
        starts.append(pos)
        pieces.append({"kind": "body", "idx": i, "skip": head, "dur": b})
        pos += b
        if i < n - 1:
            pieces.append({"kind": "trans", "idx": i, "skip": d - C, "dur": C})
            pos += C
    pieces.append({"kind": "tail", "idx": None, "skip": 0.0, "dur": TAIL_BLACK})
    pos += TAIL_BLACK
    return pieces, starts, pos


def selftest():
    durs = [1800, 1890, 2490, 1290, 2490, 1290]
    pieces, starts, total = plan_pieces(durs, 90.0)
    assert abs(total - 10802.0) < 1e-6, total
    assert [int(s) for s in starts] == [0, 1800, 3600, 6000, 7200, 9600], starts
    assert fmt_duration(10800) == "3:00:00"
    assert fmt_duration(64) == "1:04"
    p1, s1, t1 = plan_pieces([10800], 90.0)
    assert abs(t1 - 10802.0) < 1e-6 and s1 == [0.0]
    assert slot_duration_sec({"slot_duration_sec": 1890}) == 1890.0
    assert slot_duration_sec({"duration_sec": 1290}) == 1290.0
    assert slot_duration_sec({"slot_duration_sec": 2490, "duration_sec": 1800}) == 2490.0
    print("[SELFTEST] OK: pieces/chapters/formatter/slot_duration")



def _write_studio_subtitles_if_configured(manifest: dict, out_dir: str) -> None:
    """Writes subtitles.srt if enabled in manifest.subtitles or manifest.export_settings.subtitles."""
    import base64
    export_cfg = manifest.get("export_settings") or {}
    subs_cfg = manifest.get("subtitles") or export_cfg.get("subtitles") or {}
    if not isinstance(subs_cfg, dict) or not subs_cfg.get("enabled"):
        return
    srt_text = str(subs_cfg.get("srt_content") or "").strip()
    if not srt_text and subs_cfg.get("srt_content_base64"):
        try:
            srt_text = base64.b64decode(str(subs_cfg["srt_content_base64"])).decode("utf-8").strip()
        except Exception:
            srt_text = ""
    if not srt_text:
        return
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "subtitles.srt"), "w", encoding="utf-8") as sf:
        sf.write(srt_text + ("\n" if not srt_text.endswith("\n") else ""))


def _maybe_delegate_to_studio_scenes(manifest: dict) -> bool:
    """Delegates narrative scene manifests (timeline/scenes without timeline_slots) to assemble_scenes.py."""
    has_slots = bool(manifest.get("timeline_slots") or manifest.get("slots"))
    has_scenes = bool(manifest.get("timeline") or manifest.get("scenes"))
    if has_scenes and not has_slots:
        try:
            import assemble_scenes
            if hasattr(assemble_scenes, "run_narrative_pipeline"):
                assemble_scenes.run_narrative_pipeline(manifest)
                return True
        except Exception as exc:
            print(f"[STUDIO-DELEGATE] assemble_scenes delegation skipped/failed: {exc}", flush=True)
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", nargs="?", default="manifest.json")
    ap.add_argument("--preflight", action="store_true")
    ap.add_argument("--stream", action="store_true", help="final mux -> rclone rcat (без локальной копии)")
    ap.add_argument("--local", action="store_true", help="принудительно локальный финал (игнорировать disk-guard)")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    path = args.manifest if os.path.exists(args.manifest) else "current_manifest.json"
    with open(path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    if _maybe_delegate_to_studio_scenes(manifest):
        return
    export = manifest.get("export_settings", {}) or {}
    slots = manifest.get("timeline_slots", []) or []
    guard_slots(slots)
    _write_studio_subtitles_if_configured(manifest, "./output")
    codec = export.get("video_codec", "libx264")
    preset = export.get("preset", "veryfast" if codec == "libx264" else "medium")
    crf = export.get("crf", 20 if codec == "libx264" else 22)
    w, h = RES.get(str(export.get("resolution", "4k")).lower(), RES["4k"])
    C = float(export.get("act_crossfade_sec", manifest.get("act_crossfade_sec", 90)))
    seam = float(export.get("loop_seam_sec", 1.0))
    out_name = export.get("output_filename", f"FINAL_RENDER_{w}x{h}_{codec}.mp4")
    input_dir, temp_dir, out_dir = "./input_clips", "./temp_render", "./output"
    for d in (input_dir, temp_dir, out_dir, f"{temp_dir}/baked", f"{temp_dir}/pieces"):
        os.makedirs(d, exist_ok=True)
    durs = [slot_duration_sec(s, i) for i, s in enumerate(slots)]
    pieces, starts, total = plan_pieces(durs, C)
    print(f"=== Loop pipeline: {len(slots)} слотов, crossfade {C}s, seam {seam}s, "
          f"{w}x{h}, master {fmt_duration(total)} ===", flush=True)
    sources = [resolve_file(input_dir, (s.get("base_content") or {}).get("file_name")
                            or s.get("file_name")) for s in slots]
    if args.preflight:
        for src, d in zip(sources, durs):
            info = probe(src)
            print(f"[PREFLIGHT] {os.path.basename(src)}: {info['duration']:.2f}s "
                  f"{info['fps']:.2f}fps audio={info['has_audio']} slot={d}s")
        print("[PREFLIGHT] OK")
        return
    baked = [bake_loop(src, seam, f"{temp_dir}/baked", w, h) for src in sources]
    enc = enc_args(codec, preset, crf)
    est_mbps = 3.0 if str(manifest.get("content_profile", "")).lower() == "ambience" else 18.0
    est_bytes = total * est_mbps * 1e6 / 8
    free = shutil.disk_usage(temp_dir).free
    need_local = est_bytes * 2.0
    force_stream = args.stream or os.environ.get("AETHER_FORCE_STREAM", "") == "1"
    stream = force_stream or (not args.local and need_local > free * 0.85)
    print(f"[DISK] свободно {free / 1e9:.1f} ГБ • мастер ~{est_bytes / 1e9:.1f} ГБ • "
          f"локально нужно ~{need_local / 1e9:.1f} ГБ → {'STREAM' if stream else 'LOCAL'}", flush=True)
    concat_list = f"{temp_dir}/slots_concat.txt"
    files = []
    for p in pieces:
        i = p["idx"]
        if p["kind"] == "body":
            out = f"{temp_dir}/pieces/slot_{i + 1}_body.mp4"
            render_body(baked[i][0], p["skip"], p["dur"], out, enc, codec,
                        fade=(i == len(slots) - 1))
        elif p["kind"] == "trans":
            out = f"{temp_dir}/pieces/trans_{i + 1}.mp4"
            render_transition(baked[i][0], p["skip"], baked[i + 1][0], p["dur"], out, enc, codec)
        else:
            out = f"{temp_dir}/pieces/tail_black.mp4"
            render_tail(out, enc, codec, w, h)
        files.append(out)
    with open(concat_list, "w", encoding="utf-8") as f:
        for fp in files:
            f.write(f"file '{os.path.abspath(fp)}'\n")
    measured = measure_loudness(concat_list)
    ln = "loudnorm=I=-16:TP=-3:LRA=11"
    if measured:
        ln += (f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
               f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
               f":offset={measured['target_offset']}:linear=true")
    final_local = os.path.join(out_dir, out_name)
    folder = (manifest.get("cloud_export", {}) or {}).get("target_folder_id", "")
    base = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
            "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-c:a", "aac",
            "-b:a", "320k", "-ar", "48000", "-af", ln]
    if stream:
        remote = f"gdrive:{out_name}"
        rclone = ["rclone", "rcat", remote, "--drive-chunk-size", "128M", "--stats", "30s"]
        if folder:
            rclone += ["--drive-root-folder-id", folder]
        p1 = subprocess.Popen(base + ["-f", "mp4",
                              "-movflags", "+frag_keyframe+empty_moov+default_base_moof", "pipe:1"],
                              stdout=subprocess.PIPE)
        p2 = subprocess.Popen(rclone, stdin=p1.stdout)
        p1.stdout.close()
        rc2 = p2.wait()
        rc1 = p1.wait()
        if rc1 or rc2:
            raise SystemExit(f"[P0] stream mux/upload failed: ffmpeg={rc1} rclone={rc2}")
        for fp in files:
            try:
                os.remove(fp)
            except OSError:
                pass
        size_gb = est_bytes / 1e9
        print(f"[ГОТОВО] stream-upload: {remote} (~{size_gb:.2f} ГБ оценка)", flush=True)
    else:
        run(base + ["-movflags", "+faststart", final_local])
        size_gb = os.path.getsize(final_local) / (1024 ** 3)
        for fp in files:
            try:
                os.remove(fp)
            except OSError:
                pass
        print(f"[ГОТОВО] {final_local} ({size_gb:.2f} ГБ)", flush=True)
    base_name = os.path.splitext(out_name)[0]
    ch_name = f"{base_name}_chapters.txt"
    with open(ch_name, "w", encoding="utf-8") as f:
        for i, st in enumerate(starts):
            label = slots[i].get("title") or slots[i].get("name") or f"Act {i + 1}"
            f.write(f"{fmt_duration(st)} {label}\n")
    with open("final_output_name.txt", "w", encoding="utf-8") as f:
        f.write(out_name + "\n")
    with open("final_chapters_name.txt", "w", encoding="utf-8") as f:
        f.write(ch_name + "\n")
    qc = {"duration_sec": round(total, 3), "duration_formatted": fmt_duration(total),
          "integrated_lufs": -16.0 if measured else None,
          "loudness_mode": "two-pass-linear" if measured else "single-pass-dynamic",
          "measured_source": measured, "slots": len(slots), "pieces": len(files),
          "codec": codec, "crf": crf, "resolution": f"{w}x{h}",
          "stream_uploaded": bool(stream), "size_gb_estimate": round(size_gb, 2)}
    with open("qc_report.json", "w", encoding="utf-8") as f:
        json.dump(qc, f, ensure_ascii=False, indent=2)
    print(f"[QC] {qc['duration_formatted']} • pieces={len(files)} • stream={stream}", flush=True)


if __name__ == "__main__":
    main()
