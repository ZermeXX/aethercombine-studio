/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  Clapperboard,
  Repeat,
  Image as ImageIcon,
  Zap,
  Github,
  Film,
  FolderUp,
  Music,
  LayoutGrid,
  Play,
  Headphones,
  Infinity as InfinityIcon,
  Sparkles,
  RefreshCw,
  Download,
  Wand2,
  ExternalLink,
  X,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  AlertTriangle,
  ArrowRight,
  FileText,
  Sliders,
  CheckCircle2,
  CloudUpload
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { initDriveAuth } from './googleDriveAuth';
import { GoogleDriveDirectUploader } from './components/GoogleDriveDirectUploader';
import { MontageCombineView } from './components/MontageCombineView';
import {
  LiveTerminal,
  TerminalLogEntry,
  TerminalRunnerState,
  formatTerminalTime
} from './components/StudioTerminal';

type TabId = 'combine' | 'loop' | 'thumb' | 'hooks';

type VerbaMode =
  | '15sec_rewrite'
  | 'pack5_script'
  | 'doc_loops'
  | 'shorts_1sec';

type MysteryType = 'mystery' | 'question' | 'epicenter' | 'myth';

type ToneOfVoice =
  | 'doc'
  | 'storyteller'
  | 'truecrime'
  | 'scipop'
  | 'dynamic'
  | 'neutral';

interface SceneItem {
  id: string;
  name: string;
  file?: File;
  url: string;
  type: 'video' | 'image' | 'script_block';
  duration: number;
  subtitle?: string;
}

interface ComplianceIssue {
  word: string;
  category: string;
  risk: 'high' | 'medium';
  replacements: string[];
}

export interface SlotInsertItem {
  insert_id: string;
  asset_id: string;
  file_name: string;
  filename?: string;
  timecode_label?: string;
  trigger_at_sec: number;
  duration_sec: number;
  transition_in: {
    type: 'dissolve' | 'fade';
    duration_sec: number;
  };
  transition_out: {
    type: 'dissolve' | 'fade' | 'none';
    duration_sec: number;
  };
  hold_until_end?: boolean;
  audio_soft_compressor?: boolean;
  max_peak_over_bed_db?: number;
}

export interface SlotTransitionOut {
  type: 'xfade' | 'fade' | 'dissolve' | 'none';
  duration_sec: number;
}

export interface TimelineSlot {
  slot_index: number;
  slot_id: string;
  act_title?: string;
  act_timecode?: string;
  title: string;
  asset_id: string;
  file_name: string;
  base_content?: {
    file_name: string;
    [key: string]: unknown;
  };
  start_sec?: number;
  end_sec?: number;
  source_clip_duration_sec: number;
  internal_loop_crossfade_sec: number;
  slot_duration_sec: number;
  inserts: SlotInsertItem[];
  slot_transition_out: SlotTransitionOut;
}

export interface ContinuousBedConfig {
  enabled: boolean;
  asset_id: string;
  file_name: string;
  acrossfade_sec: number;
  veo_native_audio: boolean;
  veo_audio_weight: number;
  bed_audio_weight: number;
}

export interface AudioMasteringConfig {
  loudnorm_enabled: boolean;
  integrated_lufs: number; // strictly -18 to -14 LUFS (default -16)
  true_peak_dbtp: number; // <= -3 dBTP (default -3)
  lra: number; // default 11
  e3_soft_attack_compressor: boolean;
  e3_max_peak_over_bed_db: number; // default +6 dB
}

interface LoopBuildManifest {
  version: string;
  spec_profile: string;
  hours: number;
  calculated_project_duration_sec: number;
  resolution: '1080p' | '2k' | '4k';
  video_codec: 'libx265' | 'libx264';
  fps: 24 | 30 | 60;
  audio_codec: 'aac';
  audio_bitrate_kbps: 320 | 256 | 192;
  native_audio_engine: string;
  bitrate_preset: 'standard' | 'cinema' | 'eco';
  crf: number;
  act_crossfade_sec: number;
  internal_clip_duration_sec: number;
  internal_loop_crossfade_sec: number;
  final_black_screen_enabled: boolean;
  final_black_screen_sec: number;
  audio_mastering: AudioMasteringConfig;
  crossfade_loop: boolean;
  seamless_mode: 'crossfade' | 'pingpong';
  video_crossfade_sec: number;
  audio_crossfade_sec: number;
  use_embedded_audio: boolean;
  video_filename?: string;
  audio_filename?: string;
  gdrive_folder_id: string;
  cloud_export: {
    target_folder_id: string;
  };
  continuous_bed: ContinuousBedConfig;
  timeline_slots: TimelineSlot[];
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'info' | 'error' | 'success';
}

// Универсальная начальная структура слотов (без захардкоженных имен видеофайлов)
const INITIAL_TIMELINE_SLOTS: TimelineSlot[] = [
  {
    slot_index: 1,
    slot_id: 'SLOT_01',
    act_title: 'Акт 1 (0:00–0:30)',
    act_timecode: '0:00:00 – 0:30:00',
    title: 'Акт 1 (0:00–0:30)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 0,
    end_sec: 1800,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1800,
    inserts: [],
    slot_transition_out: {
      type: 'xfade',
      duration_sec: 90.0
    }
  },
  {
    slot_index: 2,
    slot_id: 'SLOT_02',
    act_title: 'Акт 2 (0:30–1:00)',
    act_timecode: '0:30:00 – 1:00:00',
    title: 'Акт 2 (0:30–1:00)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 1800,
    end_sec: 3690,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1890,
    inserts: [],
    slot_transition_out: {
      type: 'xfade',
      duration_sec: 90.0
    }
  },
  {
    slot_index: 3,
    slot_id: 'SLOT_03',
    act_title: 'Акт 3 (1:00–1:40)',
    act_timecode: '1:00:00 – 1:40:00',
    title: 'Акт 3 (1:00–1:40)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 3600,
    end_sec: 6090,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 2490,
    inserts: [],
    slot_transition_out: {
      type: 'xfade',
      duration_sec: 90.0
    }
  },
  {
    slot_index: 4,
    slot_id: 'SLOT_04',
    act_title: 'Акт 4 (1:40–2:00)',
    act_timecode: '1:40:00 – 2:00:00',
    title: 'Акт 4 (1:40–2:00)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 6000,
    end_sec: 7290,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1290,
    inserts: [],
    slot_transition_out: {
      type: 'xfade',
      duration_sec: 90.0
    }
  },
  {
    slot_index: 5,
    slot_id: 'SLOT_05',
    act_title: 'Акт 5 (2:00–2:40)',
    act_timecode: '2:00:00 – 2:40:00',
    title: 'Акт 5 (2:00–2:40)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 7200,
    end_sec: 9690,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 2490,
    inserts: [],
    slot_transition_out: {
      type: 'xfade',
      duration_sec: 90.0
    }
  },
  {
    slot_index: 6,
    slot_id: 'SLOT_06',
    act_title: 'Акт 6 (2:40–3:00)',
    act_timecode: '2:40:00 – 3:00:00',
    title: 'Акт 6 (2:40–3:00)',
    asset_id: '',
    file_name: '',
    base_content: { file_name: '' },
    start_sec: 9600,
    end_sec: 10890,
    source_clip_duration_sec: 10,
    internal_loop_crossfade_sec: 1.0,
    slot_duration_sec: 1290,
    inserts: [],
    slot_transition_out: {
      type: 'none',
      duration_sec: 0
    }
  }
];

const COMPLIANCE_DICTIONARY: {
  pattern: RegExp;
  label: string;
  category: string;
  risk: 'high' | 'medium';
  replacements: string[];
}[] = [
  {
    pattern: /убийств[а-я]*/gi,
    label: 'убийство / убить',
    category: 'Насилие / True Crime',
    risk: 'high',
    replacements: ['устранение', 'трагический инцидент', 'роковое событие', 'лишение жизни']
  },
  {
    pattern: /убит[а-я]*/gi,
    label: 'убит',
    category: 'Насилие / True Crime',
    risk: 'high',
    replacements: ['найден без признаков жизни', 'погиб при загадочных обстоятельствах']
  },
  {
    pattern: /смерт[а-я]*/gi,
    label: 'смерть',
    category: 'Шокирующий контент',
    risk: 'medium',
    replacements: ['гибель', 'уход из жизни', 'трагический финал', 'фатальный исход']
  },
  {
    pattern: /труп[а-я]*/gi,
    label: 'труп',
    category: 'Шокирующий контент',
    risk: 'high',
    replacements: ['тело', 'останки', 'обнаруженный объект']
  },
  {
    pattern: /кров[а-я]*/gi,
    label: 'кровь / кровавый',
    category: 'Графическое насилие',
    risk: 'medium',
    replacements: ['багровые следы', 'биологические улики', 'мрачный']
  },
  {
    pattern: /самоубийств[а-я]*|суицид[а-я]*/gi,
    label: 'суицид / самоубийство',
    category: 'Селф-харм (Строгий фильтр)',
    risk: 'high',
    replacements: ['добровольный уход', 'отчаянный шаг', 'фатальное решение']
  },
  {
    pattern: /взрыв[а-я]*|теракт[а-я]*|террор[а-я]*/gi,
    label: 'взрыв / теракт',
    category: 'Опасные события',
    risk: 'high',
    replacements: ['мощный хлопок', 'детонация', 'чрезвычайное происшествие', 'катастрофа']
  },
  {
    pattern: /оружи[а-я]*|пистолет[а-я]*|автомат[а-я]*/gi,
    label: 'оружие / огнестрел',
    category: 'Вооружение',
    risk: 'medium',
    replacements: ['арсенал', 'табельное средство', 'спецсредство']
  },
  {
    pattern: /наркот[а-я]*|кокаин[а-я]*|героин[а-я]*/gi,
    label: 'наркотики / вещества',
    category: 'Запрещенные вещества',
    risk: 'high',
    replacements: ['запрещенные препараты', 'нелегальные субстанции', 'токсичные вещества']
  },
  {
    pattern: /войн[а-я]*/gi,
    label: 'война',
    category: 'Военные конфликты',
    risk: 'medium',
    replacements: ['масштабное противостояние', 'вооруженный конфликт', 'историческая кампания']
  },
  {
    pattern: /пытк[а-я]*|пытал[а-я]*/gi,
    label: 'пытки',
    category: 'Жестокость',
    risk: 'high',
    replacements: ['жесткий допрос', 'экстремальное давление', 'нечеловеческие испытания']
  },
  {
    pattern: /жертв[а-я]*/gi,
    label: 'жертва',
    category: 'Криминал',
    risk: 'medium',
    replacements: ['пострадавший', 'фигурант истории', 'участник событий']
  }
];

const WORKFLOW_LOOP_YAML = `name: AetherCombine H.265 Blizzard 3h Builder (Omni 1.2 Flash)
on:
  workflow_dispatch:
    inputs:
      release_tag:
        description: 'GitHub Draft Release Tag with uploaded scene assets (AetherCombine Assets Buffer)'
        required: false
      manifest_payload:
        description: 'Base64-encoded JSON Build Manifest (Blizzard 3:00:00 H.265 24fps + Asymmetric Inserts + Loudnorm)'
        required: true

jobs:
  render_and_upload:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3

      - name: Install FFmpeg (with libx265), Python3, jq & Rclone
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg rclone python3 jq curl

      - name: Setup Rclone for Google Drive (Source Assets & Master Export)
        env:
          RCLONE_CONFIG_GDRIVE_TYPE: drive
          RCLONE_CONFIG_GDRIVE_SCOPE: drive
          RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_CREDENTIALS: \${{ secrets.GDRIVE_SERVICE_ACCOUNT_JSON }}
        run: |
          echo "Rclone configured for optional output export"

      - name: Parse Blizzard 3:00:00 Manifest & Run H.265 24fps FFmpeg Pipeline
        env:
          MANIFEST_B64: \${{ github.event.inputs.manifest_payload }}
          RELEASE_TAG: \${{ github.event.inputs.release_tag }}
        run: |
          python3 - << 'EOF'
          import base64, json, subprocess, os, math

          # 1. Декодируем manifest_payload в config.json
          raw_json = base64.b64decode(os.environ["MANIFEST_B64"]).decode("utf-8")
          with open("config.json", "w", encoding="utf-8") as f:
              f.write(raw_json)
          cfg = json.loads(raw_json)

          res = cfg.get("resolution", "4k")
          v_codec = cfg.get("video_codec", "libx265")
          fps = int(cfg.get("fps", 24))
          a_bitrate = f"{int(cfg.get('audio_bitrate_kbps', 320))}k"
          preset = cfg.get("bitrate_preset", "cinema")
          scale_map = {"4k": "3840:2160", "2k": "2560:1440", "1080p": "1920:1080"}
          scale_wh = scale_map.get(res, "3840:2160")
          crf_map = {"cinema": "18", "standard": "23", "eco": "26"}
          crf = str(cfg.get("crf") or crf_map.get(preset, "18"))
          folder_id = (cfg.get("cloud_export") or {}).get("target_folder_id") or cfg.get("gdrive_folder_id", "")

          final_black_enabled = bool(cfg.get("final_black_screen_enabled", True))
          final_black_sec = float(cfg.get("final_black_screen_sec", 2.0)) if final_black_enabled else 0.0

          mastering = cfg.get("audio_mastering") or {}
          lufs_i = max(-18.0, min(-14.0, float(mastering.get("integrated_lufs", -16.0))))
          tp_limit = min(-3.0, float(mastering.get("true_peak_dbtp", -3.0)))
          lra_val = float(mastering.get("lra", 11.0))

          slots = cfg.get("timeline_slots") or cfg.get("slots") or []
          bed = cfg.get("continuous_bed") or {}

          # Вычисляем длительность таймлайна: сумма slot_duration_sec минус кроссфейды между актами
          total_duration = 0.0
          for idx, sl in enumerate(slots):
              s_dur = float(sl.get("slot_duration_sec") or ((sl.get("end_sec", 1800) - sl.get("start_sec", 0)) if ("end_sec" in sl and "start_sec" in sl) else 1800))
              t_out = sl.get("slot_transition_out") or {"type": "none", "duration_sec": 0}
              overlap = float(t_out.get("duration_sec", 90.0)) if (idx < len(slots) - 1 and t_out.get("type") != "none") else 0.0
              total_duration += (s_dur - overlap)

          # 2. Предварительная сборка бесшовных петель внутри каждого слота
          ffmpeg_inputs = []
          filter_parts = []
          input_idx = 0
          slot_video_labels = []
          slot_audio_labels = []
          insert_overlays = []

          for s_i, slot in enumerate(slots):
              base_content = slot.get("base_content") if isinstance(slot.get("base_content"), dict) else {}
              base_file = (
                  base_content.get("file_name")
                  or slot.get("file_name")
                  or slot.get("filename")
                  or slot.get("asset_name")
                  or slot.get("video_file")
                  or ""
              )
              slot_dur = float(slot.get("slot_duration_sec") or ((slot.get("end_sec", 1800) - slot.get("start_sec", 0)) if ("end_sec" in slot and "start_sec" in slot) else 1800))
              clip_dur = max(2.0, float(slot.get("source_clip_duration_sec", 10.0)))
              loop_xfade = float(slot.get("internal_loop_crossfade_sec", 1.0))
              eff_step = max(1.0, clip_dur - loop_xfade)
              loops_count = max(1, int(math.ceil(slot_dur / eff_step)) + 1)

              # Генерируем бесшовное ядро исходника со швом (xfade + acrossfade)
              seamless_unit = f"unit_slot_{s_i}.mp4"
              unit_offset = max(0.5, clip_dur - loop_xfade)
              unit_fc = (
                  f"[0:v]scale={scale_wh},fps={fps}[v0];"
                  f"[v0][v0]xfade=transition=fade:duration={loop_xfade}:offset={unit_offset}[v_u];"
                  f"[0:a][0:a]acrossfade=d={loop_xfade}[a_u]"
              )
              subprocess.run([
                  "ffmpeg", "-y", "-i", base_file,
                  "-filter_complex", unit_fc,
                  "-map", "[v_u]", "-map", "[a_u]",
                  "-c:v", v_codec, "-preset", "ultrafast", "-crf", crf,
                  "-c:a", "aac", "-b:a", a_bitrate, seamless_unit
              ], check=True)

              base_in = input_idx
              ffmpeg_inputs += ["-stream_loop", str(loops_count), "-t", str(slot_dur), "-i", seamless_unit]
              input_idx += 1

              cur_v = f"v_slot_{s_i}_base"
              filter_parts.append(
                  f"[{base_in}:v]scale={scale_wh},setsar=1,fps={fps},trim=duration={slot_dur},setpts=PTS-STARTPTS[{cur_v}]"
              )

              cur_a = f"a_slot_{s_i}"
              filter_parts.append(
                  f"[{base_in}:a]atrim=duration={slot_dur},asetpts=PTS-STARTPTS[{cur_a}]"
              )
              slot_audio_labels.append(f"[{cur_a}]")
              slot_video_labels.append((cur_v, slot_dur, slot.get("slot_transition_out") or {"type": "none", "duration_sec": 0}))

              # Сохраняем вставки для наложения по таймкоду
              for ins in (slot.get("inserts") or []):
                  insert_overlays.append(ins)

          # 3. Сшиваем акты через xfade и синхронный acrossfade
          accum_offset = slot_video_labels[0][1]
          prev_v = slot_video_labels[0][0]
          prev_a = slot_audio_labels[0].strip("[]")

          for idx in range(1, len(slot_video_labels)):
              prev_trans = slot_video_labels[idx - 1][2]
              t_type = prev_trans.get("type", "xfade")
              t_dur = float(prev_trans.get("duration_sec", 90.0)) if t_type != "none" else 0.0
              next_v_src, next_dur, _ = slot_video_labels[idx]
              next_a_src = slot_audio_labels[idx].strip("[]")
              out_v = f"v_act_chain_{idx}"
              out_a = f"a_act_chain_{idx}"

              if t_type == "none" or t_dur <= 0:
                  filter_parts.append(f"[{prev_v}][{next_v_src}]concat=n=2:v=1:a=0[{out_v}]")
                  filter_parts.append(f"[{prev_a}][{next_a_src}]acrossfade=d=1.0[{out_a}]")
                  accum_offset += next_dur
              else:
                  xfade_mode = "dissolve" if t_type == "dissolve" else "fade"
                  offset_sec = max(0.0, accum_offset - t_dur)
                  filter_parts.append(
                      f"[{prev_v}][{next_v_src}]xfade=transition={xfade_mode}:duration={t_dur}:offset={offset_sec}[{out_v}]"
                  )
                  filter_parts.append(
                      f"[{prev_a}][{next_a_src}]acrossfade=d={t_dur}:c1=tri:c2=tri[{out_a}]"
                  )
                  accum_offset = offset_sec + next_dur
              prev_v = out_v
              prev_a = out_a

          cur_timeline_v = prev_v
          cur_timeline_a = prev_a
          e3_audio_nodes = []

          # 4. Точная асимметричная анимация вставок
          for ins_i, ins in enumerate(insert_overlays):
              ins_id = ins.get("insert_id") or f"E{ins_i+1}"
              ins_file = ins.get("file_name") or ins.get("filename") or ins.get("asset_name") or ins.get("video_file") or ""
              trig = float(ins.get("trigger_at_sec", 0))
              ins_dur = float(ins.get("duration_sec", 10))
              hold_end = bool(ins.get("hold_until_end", False))

              tr_in = ins.get("transition_in") or {"type": "dissolve", "duration_sec": 1.5}
              tr_out = ins.get("transition_out") or {"type": "dissolve", "duration_sec": 1.5}
              fade_in_d = float(tr_in.get("duration_sec", 1.5))
              fade_out_type = tr_out.get("type", "dissolve")
              fade_out_d = 0.0 if (hold_end or fade_out_type == "none") else float(tr_out.get("duration_sec", 1.5))

              ins_in = input_idx
              ffmpeg_inputs += ["-i", ins_file]
              input_idx += 1

              ins_v = f"v_ins_{ins_id}"
              next_v = f"v_ovr_{ins_id}"

              fade_chain = f"fade=t=in:st=0:d={fade_in_d}:alpha=1"
              if fade_out_d > 0:
                  st_out = max(0.0, ins_dur - fade_out_d)
                  fade_chain += f",fade=t=out:st={st_out}:d={fade_out_d}:alpha=1"

              end_t = total_duration if hold_end else (trig + ins_dur)
              eof_act = "repeat" if hold_end else "pass"

              filter_parts.append(
                  f"[{ins_in}:v]scale={scale_wh},setsar=1,fps={fps},format=yuva420p,"
                  f"{fade_chain},setpts=PTS-STARTPTS+{trig}/TB[{ins_v}]"
              )
              filter_parts.append(
                  f"[{cur_timeline_v}][{ins_v}]overlay=enable='between(t,{trig},{end_t})':eof_action={eof_act}[{next_v}]"
              )
              cur_timeline_v = next_v

              # Для трещины E3: мягкая компрессия (soft attack) с пиком не выше +6 дБ над подложкой
              if ins.get("audio_soft_compressor") or ins_id == "E3":
                  ins_a = f"a_ins_{ins_id}"
                  delay_ms = int(trig * 1000)
                  max_peak_db = float(ins.get("max_peak_over_bed_db", 6.0))
                  filter_parts.append(
                      f"[{ins_in}:a]acompressor=attack=45:release=250:ratio=3:threshold=-18dB:makeup=2dB,"
                      f"alimiter=limit={max_peak_db}dB,adelay={delay_ms}|{delay_ms}[{ins_a}]"
                  )
                  e3_audio_nodes.append(f"[{ins_a}]")

          # 5. Опциональный 2-секундный черный экран в финале после затухания трещины
          if final_black_enabled and final_black_sec > 0:
               filter_parts.append(
                  f"[{cur_timeline_v}]tpad=stop_mode=add:stop_duration={final_black_sec}:color=black[v_final]"
              )
              cur_timeline_v = "v_final"
              total_duration += final_black_sec

          # 6. Аудио-микс (Omni 1.2 Flash + continuous_bed + E3 crack) и финальный loudnorm=I=-16:TP=-3:LRA=11
          mix_inputs = [f"[{cur_timeline_a}]"]
          mix_weights = [str(bed.get("veo_audio_weight", 0.85))]

          if bed.get("enabled", True) and bed.get("file_name"):
              bed_in = input_idx
              ffmpeg_inputs += ["-stream_loop", "-1", "-t", str(total_duration), "-i", bed["file_name"]]
              input_idx += 1
              filter_parts.append(
                  f"[{bed_in}:a]afade=t=in:st=0:d=2.0,atrim=duration={total_duration},asetpts=PTS-STARTPTS[a_bed]"
              )
              mix_inputs.append("[a_bed]")
              mix_weights.append(str(bed.get("bed_audio_weight", 0.55)))

          for e3_a in e3_audio_nodes:
              mix_inputs.append(e3_a)
              mix_weights.append("1.0")

          if len(mix_inputs) > 1:
              w_str = " ".join(mix_weights)
              filter_parts.append(
                  f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first:weights='{w_str}'[a_pre_norm]"
              )
              pre_norm_label = "a_pre_norm"
          else:
              pre_norm_label = cur_timeline_a

          filter_parts.append(
              f"[{pre_norm_label}]loudnorm=I={lufs_i}:TP={tp_limit}:LRA={lra_val}[a_master]"
          )

          filter_complex_str = ";".join(filter_parts)
          with open("filter_complex.txt", "w", encoding="utf-8") as f:
              f.write(filter_complex_str)

          out_name = cfg.get("output_filename") or f"render_output_{res}_{v_codec}_{fps}fps.mp4"
          cmd = [
              "ffmpeg", "-y",
              *ffmpeg_inputs,
              "-filter_complex_script", "filter_complex.txt",
              "-map", f"[{cur_timeline_v}]",
              "-map", "[a_master]",
              "-t", str(total_duration),
              "-r", str(fps),
              "-c:v", v_codec, "-preset", "fast", "-crf", crf, "-pix_fmt", "yuv420p",
              "-c:a", "aac", "-b:a", a_bitrate,
              "-movflags", "+faststart", out_name
          ]
          print("Running H.265 24fps FFmpeg command:", " ".join(cmd))
          subprocess.run(cmd, check=True)

          if folder_id:
              subprocess.run([
                  "rclone", "copy", out_name, "gdrive:",
                  "--drive-root-folder-id", folder_id, "-P"
              ], check=True)
          EOF`;

export default function App() {
  // Active tab state
  const [activeTab, setActiveTab] = useState<TabId>('combine');

  // Combine studio state
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [filmFormat, setFilmFormat] = useState<string>('16:9');
  const [filmResolution, setFilmResolution] = useState<string>('4k');
  const [transferredScript, setTransferredScript] = useState<string>('');

  // Loop studio state (Universal dynamic manifest state)
  const [loopMedia, setLoopMedia] = useState<File | null>(null);
  const [loopAudio, setLoopAudio] = useState<File | null>(null);
  const [uploadedLoopAssets, setUploadedLoopAssets] = useState<Record<string, File>>({});
  const [timelineSlots, setTimelineSlots] = useState<TimelineSlot[]>(INITIAL_TIMELINE_SLOTS);
  const [videoCodec, setVideoCodec] = useState<'libx265' | 'libx264'>('libx265');
  const [videoFps, setVideoFps] = useState<24 | 30 | 60>(24);
  const [audioBitrateKbps, setAudioBitrateKbps] = useState<320 | 256 | 192>(320);
  const [actCrossfadeSec, setActCrossfadeSec] = useState<number>(90.0);
  const [internalLoopCrossfadeSec, setInternalLoopCrossfadeSec] = useState<number>(1.0);
  const [finalBlackScreenEnabled, setFinalBlackScreenEnabled] = useState<boolean>(true);
  const [finalBlackScreenSec, setFinalBlackScreenSec] = useState<number>(2.0);
  const [audioMastering, setAudioMastering] = useState<AudioMasteringConfig>({
    loudnorm_enabled: true,
    integrated_lufs: -16,
    true_peak_dbtp: -3,
    lra: 11,
    e3_soft_attack_compressor: true,
    e3_max_peak_over_bed_db: 6
  });
  const [continuousBed, setContinuousBed] = useState<ContinuousBedConfig>({
    enabled: false,
    asset_id: '',
    file_name: '',
    acrossfade_sec: 1.0,
    veo_native_audio: true,
    veo_audio_weight: 0.85,
    bed_audio_weight: 0.55
  });
  const [loopHours, setLoopHours] = useState<number>(3);
  const [loopResolution, setLoopResolution] = useState<'1080p' | '2k' | '4k'>('4k');
  const [bitratePreset, setBitratePreset] = useState<'standard' | 'cinema' | 'eco'>('cinema');
  const [seamlessTransitionMode, setSeamlessTransitionMode] = useState<'crossfade' | 'pingpong'>('crossfade');
  const [seamlessStitchEnabled, setSeamlessStitchEnabled] = useState<boolean>(true);
  const [crossfadeDuration, setCrossfadeDuration] = useState<number>(1.0);
  const [audioCrossfadeDuration, setAudioCrossfadeDuration] = useState<number>(90.0);
  const [audioCrossfadeEnabled, setAudioCrossfadeEnabled] = useState<boolean>(true);
  const [useEmbeddedAudio, setUseEmbeddedAudio] = useState<boolean>(true);
  const [expectedVideoFilename, setExpectedVideoFilename] = useState<string>('');
  const [expectedAudioFilename, setExpectedAudioFilename] = useState<string>('');
  const [importedManifestName, setImportedManifestName] = useState<string>('');
  const [showFilterComplexPreview, setShowFilterComplexPreview] = useState<boolean>(true);

  // Thumbnail studio state
  const [thumbImg, setThumbImg] = useState<HTMLImageElement | null>(null);
  const [thumbTitle, setThumbTitle] = useState<string>('');
  const [thumbBadge, setThumbBadge] = useState<string>('4k_gold');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // VerbaFlow Retention Engine state
  const [verbaMode, setVerbaMode] = useState<VerbaMode>('15sec_rewrite');
  const [mysteryType, setMysteryType] = useState<MysteryType>('mystery');
  const [toneOfVoice, setToneOfVoice] = useState<ToneOfVoice>('doc');
  const [sourceText, setSourceText] = useState<string>(
    'В 1974 году в архивах альпийской метеостанции нашли кассету с записью странного низкочастотного гула. Станцию закрыли за 24 часа, а персонал подписал неразглашение на 50 лет. Официальная версия гласила, что сошла лавина, но все приборы продолжали передавать сигнал еще три недели.'
  );
  const [generatedHook15s, setGeneratedHook15s] = useState<string>('');
  const [generatedHookPack, setGeneratedHookPack] = useState<string[]>([]);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [complianceReport, setComplianceReport] = useState<{
    checked: boolean;
    issues: ComplianceIssue[];
    score: number;
  } | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  // GitHub & Google Drive Runner Configuration state
  const [ghToken, setGhToken] = useState<string>(() => localStorage.getItem('ac_gh_token') || '');
  const [ghRepo, setGhRepo] = useState<string>(
    () => localStorage.getItem('ac_gh_repo') || 'ZermeXX/aetherflow-render'
  );
  const [ghBranch, setGhBranch] = useState<string>(() => localStorage.getItem('ac_gh_branch') || 'main');
  const [gdriveFolderId, setGdriveFolderId] = useState<string>(
    () => localStorage.getItem('ac_gdrive_folder_id') || '1OuuxKa85KAR-zz9TFXv6Ccg99fZ6JpuK'
  );
  const [gdriveSaKey, setGdriveSaKey] = useState<string>(
    () => localStorage.getItem('ac_gdrive_sa_key') || ''
  );

  // Modal state
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [showYamlPreview, setShowYamlPreview] = useState<boolean>(false);
  const [modalToken, setModalToken] = useState<string>('');
  const [modalRepo, setModalRepo] = useState<string>('');
  const [modalBranch, setModalBranch] = useState<string>('main');
  const [modalGdriveFolderId, setModalGdriveFolderId] = useState<string>('');
  const [modalGdriveSaKey, setModalGdriveSaKey] = useState<string>('');

  // Состояние авторизации Google Drive (OAuth 2.0 Resumable Upload в текущую папку)
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveToken(token);
      },
      () => {
        setDriveUser(null);
        setDriveToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Cloud Render status bar & GitHub Actions Polling state
  const [renderStatus, setRenderStatus] = useState<{
    visible: boolean;
    status: 'idle' | 'running' | 'success' | 'failure';
    title: string;
    desc: string;
    stepLabel: string;
    seconds: number;
    runUrl: string;
    runId?: number;
  }>({
    visible: false,
    status: 'idle',
    title: 'Облачный рендер запущен...',
    desc: 'GitHub Actions FFmpeg выполняет компиляцию кадров',
    stepLabel: 'Шаг: Скачивание клипов из Google Drive...',
    seconds: 0,
    runUrl: 'https://github.com/ZermeXX/aetherflow-render/actions'
  });

  // Состояние студийного псевдотерминала (LiveTerminal)
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogEntry[]>([]);
  const seenStepsRef = useRef<Record<string, string>>({});
  const secondsRef = useRef<number>(0);

  const appendTerminalLog = useCallback(
    (text: string, level: TerminalLogEntry['level'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      setTerminalLogs(prev => [...prev, { id, text, level }]);
    },
    []
  );

  const clearTerminalLogs = useCallback(() => {
    setTerminalLogs([]);
  }, []);

  const terminalRunnerStatus: TerminalRunnerState =
    renderStatus.status === 'running'
      ? 'running'
      : renderStatus.status === 'success'
      ? 'success'
      : renderStatus.status === 'failure'
      ? 'failed'
      : 'idle';

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const scenesInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const manifestInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((text: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Двухтональный аккорд завершения через Web Audio API (без внешних mp3)
  const playRenderSuccessChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Первый тон аккорда (C5 + E5)
      const playTone = (freq: number, startTime: number, duration: number, peakGain: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
      };

      playTone(523.25, now, 0.35, 0.16); // C5
      playTone(659.25, now, 0.35, 0.12); // E5
      // Второй тон аккорда (G5 + C6)
      playTone(783.99, now + 0.16, 0.55, 0.18); // G5
      playTone(1046.5, now + 0.16, 0.65, 0.14); // C6
    } catch {
      // Игнорируем блокировку автовоспроизведения браузером
    }
  }, []);

  // Системное браузерное уведомление Notification API
  const triggerBrowserRenderNotification = useCallback(() => {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        new Notification('Рендер завершен', {
          body: 'Видео успешно выгружено в вашу папку Google Drive'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification('Рендер завершен', {
              body: 'Видео успешно выгружено в вашу папку Google Drive'
            });
          }
        });
      }
    } catch {
      // Игнорируем ограничения iframe/браузера для Notification
    }
  }, []);

  // Перевод имени шага GitHub Actions на понятный русский статус для нижней панели
  const mapGitHubStepToRussian = useCallback((rawStepName?: string, stepIdx?: number): string => {
    if (!rawStepName) {
      return 'Шаг: Скачивание клипов из Google Drive...';
    }
    const lower = rawStepName.toLowerCase();
    if (
      lower.includes('upload') ||
      lower.includes('выгруз') ||
      (lower.includes('rclone') && (stepIdx ?? 0) > 4)
    ) {
      return 'Шаг: Выгрузка готового 4K мастера в Google Drive...';
    }
    if (
      lower.includes('ffmpeg') ||
      lower.includes('render') ||
      lower.includes('autonomous') ||
      lower.includes('loop') ||
      lower.includes('сборк') ||
      lower.includes('таймлайн')
    ) {
      return 'Шаг: Рендеринг и сборка таймлайна в FFmpeg...';
    }
    if (
      lower.includes('download') ||
      lower.includes('release') ||
      lower.includes('asset') ||
      lower.includes('checkout') ||
      lower.includes('python') ||
      lower.includes('install') ||
      lower.includes('rclone') ||
      lower.includes('drive') ||
      lower.includes('скачив')
    ) {
      return 'Шаг: Скачивание клипов из Google Drive...';
    }
    return `Шаг: ${rawStepName}...`;
  }, []);

  // Динамический таймер прошедшего времени (ММ:СС), пока идет сборка
  useEffect(() => {
    if (!renderStatus.visible || renderStatus.status !== 'running') return;
    const timer = setInterval(() => {
      setRenderStatus(prev => {
        const nextSec = prev.seconds + 1;
        secondsRef.current = nextSec;
        return {
          ...prev,
          seconds: nextSec
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [renderStatus.visible, renderStatus.status]);

  // Автоматический опрос GitHub Actions (Polling каждые 3.5 секунды) и трансляция в LiveTerminal
  useEffect(() => {
    if (!renderStatus.visible || renderStatus.status !== 'running') return;
    const targetRepo = (ghRepo || 'ZermeXX/aetherflow-render').trim();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json'
    };
    if (ghToken) {
      headers.Authorization = `Bearer ${ghToken}`;
    }

    let isCancelled = false;

    const pollGitHubActions = async () => {
      try {
        const runsRes = await fetch(
          `https://api.github.com/repos/${targetRepo}/actions/runs?event=workflow_dispatch&per_page=1`,
          { headers }
        );
        if (!runsRes.ok || isCancelled) return;

        const runsData = (await runsRes.json()) as {
          workflow_runs?: Array<{
            id: number;
            status: string;
            conclusion: string | null;
            html_url: string;
          }>;
        };

        const latestRun = runsData.workflow_runs?.[0];
        if (!latestRun || isCancelled) return;

        const runId = latestRun.id;
        const runUrl = latestRun.html_url || `https://github.com/${targetRepo}/actions`;

        // Запрашиваем список шагов и текущей задачи
        const jobsRes = await fetch(
          `https://api.github.com/repos/${targetRepo}/actions/runs/${runId}/jobs`,
          { headers }
        );

        let activeStepText = 'Шаг: Скачивание клипов из Google Drive...';
        let failedStepName = '';
        let jobId: number | undefined;

        if (jobsRes.ok) {
          const jobsData = (await jobsRes.json()) as {
            jobs?: Array<{
              id?: number;
              steps?: Array<{
                name: string;
                status: string;
                conclusion: string | null;
                number?: number;
              }>;
            }>;
          };
          const primaryJob = jobsData.jobs?.[0];
          jobId = primaryJob?.id;
          const steps = primaryJob?.steps || [];

          // Пошаговая трансляция шагов jobs[0].steps в студийный терминал
          steps.forEach(step => {
            const stepKey = `${runId}-${step.number ?? step.name}`;
            const prevRecorded = seenStepsRef.current[stepKey];
            const timeStr = formatTerminalTime(secondsRef.current);

            if (step.status === 'in_progress' && !prevRecorded) {
              seenStepsRef.current[stepKey] = 'in_progress';
              appendTerminalLog(
                `[${timeStr}] ⚙️ Выполняется шаг: ${step.name}...`,
                'step'
              );
            } else if (step.status === 'completed') {
              if (step.conclusion === 'success' && prevRecorded !== 'completed_success') {
                seenStepsRef.current[stepKey] = 'completed_success';
                appendTerminalLog(
                  `[${timeStr}] ✅ Шаг ${step.name} завершён успешно.`,
                  'success'
                );
              } else if (step.conclusion === 'failure' && prevRecorded !== 'completed_failure') {
                seenStepsRef.current[stepKey] = 'completed_failure';
                appendTerminalLog(
                  `[${timeStr}] ❌ Сбой на шаге: ${step.name}!`,
                  'error'
                );
              }
            }
          });

          const inProgressStep = steps.find(s => s.status === 'in_progress');
          const failedStep = steps.find(s => s.conclusion === 'failure');

          if (inProgressStep) {
            activeStepText = mapGitHubStepToRussian(inProgressStep.name, inProgressStep.number);
          } else if (steps.length > 0) {
            const completedCount = steps.filter(s => s.status === 'completed').length;
            if (completedCount >= steps.length - 1) {
              activeStepText = 'Шаг: Выгрузка готового 4K мастера в Google Drive...';
            } else if (completedCount >= 3) {
              activeStepText = 'Шаг: Рендеринг и сборка таймлайна в FFmpeg...';
            }
          }

          if (failedStep) {
            failedStepName = failedStep.name;
          }
        }

        if (isCancelled) return;

        if (latestRun.status === 'completed') {
          const finalTimeStr = formatTerminalTime(secondsRef.current);

          if (latestRun.conclusion === 'success') {
            appendTerminalLog(
              `[${finalTimeStr}] 🎉 Рендер и выгрузка мастера в Google Drive завершены успешно!`,
              'success'
            );

            setRenderStatus(prev => ({
              ...prev,
              status: 'success',
              runId,
              runUrl,
              title: '✅ Готово! 4K мастер успешно собран и выгружен на Google Drive',
              stepLabel: 'Шаг: Выгрузка готового 4K мастера в Google Drive завершена (100%)'
            }));
            playRenderSuccessChime();
            triggerBrowserRenderNotification();
            showToast(
              '✅ Готово! 4K мастер успешно собран и выгружен на Google Drive',
              'success'
            );

            // Подгрузка полного текста лога задачи по завершении (FFmpeg отчет)
            if (jobId) {
              try {
                const jobLogRes = await fetch(
                  `https://api.github.com/repos/${targetRepo}/actions/jobs/${jobId}/logs`,
                  { headers }
                );
                if (jobLogRes.ok && !isCancelled) {
                  const fullLogText = await jobLogRes.text();
                  if (fullLogText && fullLogText.trim()) {
                    const logLines = fullLogText.split(/\r?\n/).filter(Boolean);
                    const tailLines =
                      logLines.length > 350 ? logLines.slice(logLines.length - 350) : logLines;
                    setTerminalLogs(prev => [
                      ...prev,
                      {
                        id: `${Date.now()}-log-header`,
                        text: `\n--- 📄 ПОЛНЫЙ ОТЧЕТ ЗАДАЧИ GITHUB ACTIONS / FFMPEG (job_id: ${jobId}) ---`,
                        level: 'info'
                      },
                      ...tailLines.map((line, idx) => ({
                        id: `${Date.now()}-raw-${idx}`,
                        text: line,
                        level: 'raw' as const
                      }))
                    ]);
                  }
                }
              } catch {
                // Если CORS или токен не разрешают редирект логов, не прерываем успешный статус
              }
            }
          } else {
            appendTerminalLog(
              `[${finalTimeStr}] ❌ Сборка прервана с ошибкой. Проверьте детали в логе выше.`,
              'error'
            );

            const errStepInfo = failedStepName
              ? `на шаге «${failedStepName}»`
              : `(статус: ${latestRun.conclusion || 'failure'})`;
            setRenderStatus(prev => ({
              ...prev,
              status: 'failure',
              runId,
              runUrl,
              title: `❌ Сбой облачной сборки ${errStepInfo}`,
              stepLabel: failedStepName
                ? `Ошибка на шаге: ${failedStepName}`
                : 'Шаг завершился с ошибкой выполнения в GitHub Actions'
            }));
            showToast(`Ошибка рендера в GitHub Actions ${errStepInfo}`, 'error');
          }
        } else {
          setRenderStatus(prev => ({
            ...prev,
            status: 'running',
            runId,
            runUrl,
            stepLabel: activeStepText
          }));
        }
      } catch {
        // Сетевые задержки при опросе не прерывают таймер
      }
    };

    // Первый опрос через 2 секунды после dispatch и далее каждые 3.5 секунды (3–4 сек)
    const initialTimeout = setTimeout(pollGitHubActions, 2000);
    const interval = setInterval(pollGitHubActions, 3500);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [
    renderStatus.visible,
    renderStatus.status,
    ghRepo,
    ghToken,
    mapGitHubStepToRussian,
    playRenderSuccessChime,
    triggerBrowserRenderNotification,
    showToast,
    appendTerminalLog
  ]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const totalDurationSec = scenes.reduce((acc, sc) => acc + sc.duration, 0);

  // Source text counters
  const charCount = sourceText.length;
  const wordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;

  // Dynamic file size calculator for 3-10h loop based on resolution + bitratePreset + hours
  const estimateLoopSizeGb = useCallback(() => {
    // Base GB per hour for 4K:
    // cinema (CRF 18, ~35-50 Mbps) => 11.8 GB/h (10h = 118 GB)
    // standard (CRF 23, ~12-18 Mbps) => 6.4 GB/h (10h = 64 GB)
    // eco (CRF 26, ~8-10 Mbps) => 3.8 GB/h (10h = 38 GB)
    const base4kGbPerHour =
      bitratePreset === 'cinema' ? 11.8 : bitratePreset === 'standard' ? 6.4 : 3.8;
    const resMultiplier =
      loopResolution === '4k' ? 1.0 : loopResolution === '2k' ? 0.48 : 0.24;
    const rawGb = loopHours * base4kGbPerHour * resMultiplier;
    return Math.round(rawGb * 10) / 10;
  }, [loopHours, loopResolution, bitratePreset]);

  const getScaleFilter = (res: '1080p' | '2k' | '4k') =>
    res === '4k' ? 'scale=3840:2160' : res === '2k' ? 'scale=2560:1440' : 'scale=1920:1080';

  const getCrfValue = (preset: 'standard' | 'cinema' | 'eco') =>
    preset === 'cinema' ? 18 : preset === 'eco' ? 26 : 23;

  const getResolutionLabel = (res: '1080p' | '2k' | '4k') =>
    res === '4k' ? '4K' : res === '2k' ? '2K' : '1080p';

  const getPresetShortLabel = (preset: 'standard' | 'cinema' | 'eco') =>
    preset === 'cinema'
      ? 'Master Cinema'
      : preset === 'standard'
      ? 'YouTube Standard'
      : 'Эконом';

  // Handle batch scene upload (unlimited N-scenes)
  const handleSceneFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;
    const files: File[] = Array.from(fileList);
    const newScenes: SceneItem[] = files.map((file: File) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'video' : 'image',
      duration: 6
    }));
    setScenes(prev => [...prev, ...newScenes]);
    e.target.value = '';
  };

  const removeScene = (index: number) => {
    setScenes(prev => {
      const target = prev[index];
      if (target && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const clearScenes = () => {
    scenes.forEach(sc => {
      if (sc.url.startsWith('blob:')) URL.revokeObjectURL(sc.url);
    });
    setScenes([]);
    setTransferredScript('');
  };

  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
    }
  };

  // Open GitHub & Google Drive Modal
  const openConfigModal = () => {
    setModalToken(ghToken);
    setModalRepo(ghRepo);
    setModalBranch(ghBranch || 'main');
    setModalGdriveFolderId(gdriveFolderId);
    setModalGdriveSaKey(gdriveSaKey);
    setIsConfigOpen(true);
  };

  const closeConfigModal = () => {
    setIsConfigOpen(false);
  };

  const saveGitHubConfig = () => {
    const trimmedToken = modalToken.trim();
    const trimmedRepo = modalRepo.trim();
    const trimmedBranch = modalBranch.trim() || 'main';
    const trimmedFolder = modalGdriveFolderId.trim();
    const trimmedSaKey = modalGdriveSaKey.trim();

    setGhToken(trimmedToken);
    setGhRepo(trimmedRepo);
    setGhBranch(trimmedBranch);
    setGdriveFolderId(trimmedFolder);
    setGdriveSaKey(trimmedSaKey);

    localStorage.setItem('ac_gh_token', trimmedToken);
    localStorage.setItem('ac_gh_repo', trimmedRepo);
    localStorage.setItem('ac_gh_branch', trimmedBranch);
    localStorage.setItem('ac_gdrive_folder_id', trimmedFolder);
    localStorage.setItem('ac_gdrive_sa_key', trimmedSaKey);

    closeConfigModal();
    showToast('Конфигурация GitHub Actions и Google Drive сохранена', 'success');
  };

  const copyWorkflowTemplate = () => {
    navigator.clipboard.writeText(WORKFLOW_LOOP_YAML);
    showToast('Шаблон render_loop.yml скопирован в буфер обмена!', 'success');
  };

  const showStatusBar = (title: string, desc: string, repo: string) => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    const cleanRepo = (repo || 'ZermeXX/aetherflow-render').trim();
    secondsRef.current = 0;
    seenStepsRef.current = {};
    setTerminalLogs([
      {
        id: `${Date.now()}-init`,
        text: `[00:00] 🚀 Инициализация dispatch в репозиторий ${cleanRepo}...`,
        level: 'info'
      }
    ]);
    setRenderStatus({
      visible: true,
      status: 'running',
      title,
      desc,
      stepLabel: 'Шаг: Скачивание клипов из Google Drive...',
      seconds: 0,
      runUrl: `https://github.com/${cleanRepo}/actions`
    });
  };

  // =========================================
  // УНИВЕРСАЛЬНЫЙ ПАРСЕР СЛОТОВ (N-СЦЕН) И ДИНАМИЧЕСКИХ ВСТАВОК (INSERTS: [])
  // =========================================

  // Вычисление длительности проекта: сумма slot_duration_sec минус нахлесты переходов slot_transition_out.duration_sec
  const calculatedProjectDurationSec = timelineSlots.reduce((acc, slot, idx) => {
    const isLast = idx === timelineSlots.length - 1;
    const overlap =
      !isLast && slot.slot_transition_out.type !== 'none'
        ? Math.max(0, Number(slot.slot_transition_out.duration_sec) || 0)
        : 0;
    return acc + Math.max(1, Number(slot.slot_duration_sec) || 0) - overlap;
  }, 0);

  const totalInsertsCount = timelineSlots.reduce(
    (acc, slot) => acc + (Array.isArray(slot.inserts) ? slot.inserts.length : 0),
    0
  );

  // Проверка привязки ассета (по file_name или asset_id) среди загруженных пользователем файлов
  const isAssetMatched = useCallback(
    (fileName?: string, assetId?: string): boolean => {
      const fn = (fileName || '').trim().toLowerCase();
      const aid = (assetId || '').trim().toLowerCase();
      if (!fn && !aid) return false;
      if (
        loopMedia &&
        ((fn && loopMedia.name.toLowerCase() === fn) ||
          (aid && loopMedia.name.toLowerCase().includes(aid)))
      ) {
        return true;
      }
      if (
        loopAudio &&
        ((fn && loopAudio.name.toLowerCase() === fn) ||
          (aid && loopAudio.name.toLowerCase().includes(aid)))
      ) {
        return true;
      }
      return Object.keys(uploadedLoopAssets).some(key => {
        const k = key.toLowerCase();
        const baseNoExt = k.replace(/\.[^.]+$/, '');
        return Boolean((fn && k === fn) || (aid && (baseNoExt === aid || k.includes(aid))));
      });
    },
    [loopMedia, loopAudio, uploadedLoopAssets]
  );

  // Автоматическая подстановка точных имен выбранных/загруженных файлов в свободные слоты таймлайна (без тестовых заглушек)
  const handleLoopFilesSelected = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const videoFiles: File[] = [];
      const audioFiles: File[] = [];

      files.forEach(f => {
        const lower = f.name.toLowerCase();
        if (
          f.type.startsWith('audio/') ||
          lower.endsWith('.mp3') ||
          lower.endsWith('.wav') ||
          lower.endsWith('.aac') ||
          lower.endsWith('.flac')
        ) {
          audioFiles.push(f);
        } else {
          videoFiles.push(f);
        }
      });

      if (videoFiles.length > 0) {
        setLoopMedia(videoFiles[0]);
      }
      if (audioFiles.length > 0) {
        setLoopAudio(audioFiles[0]);
        setContinuousBed(prev => ({
          ...prev,
          enabled: true,
          file_name: audioFiles[0].name
        }));
      }

      setUploadedLoopAssets(prev => {
        const next = { ...prev };
        files.forEach(f => {
          next[f.name] = f;
        });
        return next;
      });

      // Автоматически заполняем слоты таймлайна (и вставки inserts) реальными именами перетащенных видеофайлов
      if (videoFiles.length > 0) {
        setTimelineSlots(prev => {
          const next = prev.map(sl => ({
            ...sl,
            inserts: sl.inserts.map(ins => ({ ...ins }))
          }));
          let qIdx = 0;

          // 1. Заполняем пустые основные слоты (file_name === '')
          for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
            if (!next[i].file_name.trim()) {
              const exactName = videoFiles[qIdx].name;
              next[i] = {
                ...next[i],
                file_name: exactName,
                base_content: {
                  ...(next[i].base_content || {}),
                  file_name: exactName
                }
              };
              qIdx += 1;
            }
          }

          // 2. Оставшимися файлами заполняем пустые вставки (inserts) внутри слотов
          for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
            for (let j = 0; j < next[i].inserts.length && qIdx < videoFiles.length; j++) {
              if (!next[i].inserts[j].file_name.trim()) {
                const exactName = videoFiles[qIdx].name;
                next[i].inserts[j] = {
                  ...next[i].inserts[j],
                  file_name: exactName,
                  filename: exactName
                };
                qIdx += 1;
              }
            }
          }

          // 3. Если все слоты и вставки уже были заполнены ранее (qIdx === 0), обновляем их по порядку новыми перетащенными файлами
          if (qIdx === 0) {
            for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
              const exactName = videoFiles[qIdx].name;
              next[i] = {
                ...next[i],
                file_name: exactName,
                base_content: {
                  ...(next[i].base_content || {}),
                  file_name: exactName
                }
              };
              qIdx += 1;
            }
            for (let i = 0; i < next.length && qIdx < videoFiles.length; i++) {
              for (let j = 0; j < next[i].inserts.length && qIdx < videoFiles.length; j++) {
                const exactName = videoFiles[qIdx].name;
                next[i].inserts[j] = {
                  ...next[i].inserts[j],
                  file_name: exactName,
                  filename: exactName
                };
                qIdx += 1;
              }
            }
          }

          return next;
        });
      }

      showToast(
        `Файлы добавлены (${files.length} шт.) — слоты таймлайна заполнены, запущена выгрузка в Google Drive!`,
        'success'
      );
    },
    [showToast]
  );

  // Пакетная загрузка файлов в дропзону (слоты + вставки E1..En + фоновый звук)
  const handleLoopMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;
    const files: File[] = Array.from(fileList);
    handleLoopFilesSelected(files);
    e.target.value = '';
  };

  const handleLoopAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoopAudio(file);
      setUploadedLoopAssets(prev => ({ ...prev, [file.name]: file }));
      setContinuousBed(prev => ({ ...prev, file_name: file.name }));
      if (expectedAudioFilename && file.name === expectedAudioFilename) {
        showToast(`Аудиофайл «${file.name}» успешно привязан к манифесту!`, 'success');
      }
    }
  };

  const handleExactLoopHoursChange = (val: string) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return;
    const clamped = Math.max(3, Math.min(10, parsed));
    setLoopHours(clamped);
  };

  // Распределение общей длительности (loopHours * 3600) равномерно по текущим N слотам
  const syncSlotsToTargetHours = (targetHours: number) => {
    const clampedH = Math.max(3, Math.min(10, targetHours));
    setLoopHours(clampedH);
    const totalTargetSec = clampedH * 3600;
    setTimelineSlots(prev => {
      if (!prev.length) return prev;
      const perSlot = Math.round(totalTargetSec / prev.length);
      return prev.map((sl, idx) => ({
        ...sl,
        slot_duration_sec: perSlot,
        slot_transition_out:
          idx === prev.length - 1
            ? sl.slot_transition_out
            : {
                type: sl.slot_transition_out.type === 'none' ? 'xfade' : sl.slot_transition_out.type,
                duration_sec: sl.slot_transition_out.duration_sec || crossfadeDuration
              }
      }));
    });
  };

  // Сброс структуры к чистым 6 актам (3:00:00) без подмены пользовательских имен файлов
  const applyBlizzard3HSpecPreset = () => {
    setTimelineSlots(prev =>
      INITIAL_TIMELINE_SLOTS.map((baseSlot, idx) => {
        const existing = prev[idx];
        const preservedFile = existing?.file_name || '';
        return {
          ...baseSlot,
          file_name: preservedFile,
          base_content: {
            ...(existing?.base_content || {}),
            file_name: preservedFile
          },
          asset_id: existing?.asset_id || '',
          inserts: existing?.inserts ? [...existing.inserts] : []
        };
      })
    );
    setLoopHours(3);
    setVideoCodec('libx265');
    setVideoFps(24);
    setAudioBitrateKbps(320);
    setActCrossfadeSec(90.0);
    setInternalLoopCrossfadeSec(1.0);
    setFinalBlackScreenEnabled(true);
    setFinalBlackScreenSec(2.0);
    setAudioMastering({
      loudnorm_enabled: true,
      integrated_lufs: -16,
      true_peak_dbtp: -3,
      lra: 11,
      e3_soft_attack_compressor: true,
      e3_max_peak_over_bed_db: 6
    });
    showToast(
      'Применены параметры кодирования 3:00:00 (H.265 24fps, AAC 320k, стыки 90с, loudnorm -16 LUFS) с сохранением ваших имен файлов!',
      'success'
    );
  };

  // Добавление нового слота (поддержка от 1 до 50+ сцен, без захардкоженных имен файлов)
  const addTimelineSlot = () => {
    setTimelineSlots(prev => {
      const nextIdx = prev.length + 1;
      const padded = String(nextIdx).padStart(2, '0');
      const updatedPrev = prev.map((s, i) =>
        i === prev.length - 1 && s.slot_transition_out.type === 'none'
          ? { ...s, slot_transition_out: { type: 'xfade' as const, duration_sec: actCrossfadeSec } }
          : s
      );
      return [
        ...updatedPrev,
        {
          slot_index: nextIdx,
          slot_id: `SLOT_${padded}`,
          act_title: `Акт ${nextIdx}`,
          title: `Акт ${nextIdx}`,
          act_timecode: `Акт #${nextIdx}`,
          asset_id: '',
          file_name: '',
          base_content: { file_name: '' },
          source_clip_duration_sec: 10,
          internal_loop_crossfade_sec: internalLoopCrossfadeSec,
          slot_duration_sec: 1800,
          inserts: [],
          slot_transition_out: {
            type: 'none',
            duration_sec: 0
          }
        }
      ];
    });
    showToast('Добавлен новый слот в таймлайн', 'info');
  };

  // Генератор произвольного числа N слотов (без захардкоженных имен файлов)
  const generateNSlotsPreset = (count: number) => {
    const totalSec = loopHours * 3600;
    const perSlotSec = Math.max(120, Math.round((totalSec + (count - 1) * actCrossfadeSec) / count));
    setTimelineSlots(prev =>
      Array.from({ length: count }, (_, idx) => {
        const num = idx + 1;
        const pad = String(num).padStart(2, '0');
        const isLast = idx === count - 1;
        const existing = prev[idx];
        const preservedFileName = existing?.file_name || '';

        return {
          slot_index: num,
          slot_id: existing?.slot_id || `SLOT_${pad}`,
          act_title: existing?.act_title || existing?.title || `Слот ${num}`,
          title: existing?.title || existing?.act_title || `Слот ${num}`,
          act_timecode: existing?.act_timecode || `Слот #${num}`,
          asset_id: existing?.asset_id || '',
          file_name: preservedFileName,
          base_content: {
            ...(existing?.base_content || {}),
            file_name: preservedFileName
          },
          source_clip_duration_sec: existing?.source_clip_duration_sec ?? 10,
          internal_loop_crossfade_sec: existing?.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec,
          slot_duration_sec: perSlotSec,
          inserts: existing?.inserts ? [...existing.inserts] : [],
          slot_transition_out: isLast
            ? { type: 'none', duration_sec: 0 }
            : { type: 'xfade', duration_sec: actCrossfadeSec }
        };
      })
    );
    showToast(
      `Сформирован таймлайн на ${count} слотов со стыками актов ${actCrossfadeSec}с!`,
      'success'
    );
  };

  const removeTimelineSlot = (slotIdx: number) => {
    setTimelineSlots(prev => {
      if (prev.length <= 1) {
        showToast('В таймлайне должен оставаться минимум 1 слот!', 'error');
        return prev;
      }
      return prev
        .filter((_, idx) => idx !== slotIdx)
        .map((s, idx) => ({
          ...s,
          slot_index: idx + 1
        }));
    });
  };

  const updateTimelineSlotField = <K extends keyof TimelineSlot>(
    slotIdx: number,
    field: K,
    value: TimelineSlot[K]
  ) => {
    setTimelineSlots(prev =>
      prev.map((s, idx) => {
        if (idx !== slotIdx) return s;
        const updated: TimelineSlot = { ...s, [field]: value };
        if (field === 'file_name') {
          updated.base_content = {
            ...(s.base_content || {}),
            file_name: String(value ?? '')
          };
        }
        if (field === 'title') {
          updated.act_title = String(value ?? '');
        }
        if (field === 'act_title') {
          updated.title = String(value ?? '');
        }
        return updated;
      })
    );
  };

  // Добавление новой вставки E(n) в массив slot.inserts (без захардкоженных имен файлов)
  const addInsertToSlot = (slotIdx: number) => {
    setTimelineSlots(prev =>
      prev.map((slot, idx) => {
        if (idx !== slotIdx) return slot;
        const nextNum = slot.inserts.length + 1;
        const isE3Style = nextNum === 3;
        const isE2Style = nextNum === 2;
        const lastTrigger =
          slot.inserts.length > 0
            ? slot.inserts[slot.inserts.length - 1].trigger_at_sec
            : 0;
        const suggestedTrigger = Math.min(
          Math.max(30, slot.slot_duration_sec - 15),
          lastTrigger + 120
        );
        const newInsert: SlotInsertItem = {
          insert_id: `E${nextNum}`,
          timecode_label: isE3Style
            ? `E${nextNum} • in 1.5с / БЕЗ fade out`
            : isE2Style
            ? `E${nextNum} • in 1.5с / out 3.0с`
            : `E${nextNum} • in 1.5с / out 1.5с`,
          asset_id: '',
          file_name: '',
          trigger_at_sec: suggestedTrigger,
          duration_sec: 10,
          transition_in: {
            type: isE3Style ? 'fade' : 'dissolve',
            duration_sec: 1.5
          },
          transition_out: isE3Style
            ? { type: 'none', duration_sec: 0 }
            : {
                type: 'dissolve',
                duration_sec: isE2Style ? 3.0 : 1.5
              },
          hold_until_end: isE3Style,
          audio_soft_compressor: isE3Style,
          max_peak_over_bed_db: isE3Style ? 6 : undefined
        };
        return {
          ...slot,
          inserts: [...slot.inserts, newInsert]
        };
      })
    );
  };

  const clearSlotInserts = (slotIdx: number) => {
    setTimelineSlots(prev =>
      prev.map((slot, idx) => (idx === slotIdx ? { ...slot, inserts: [] } : slot))
    );
    showToast(`Слот #${slotIdx + 1} переведен в режим чистого фонового лупа (inserts: [])`, 'info');
  };

  const removeInsertFromSlot = (slotIdx: number, insertIdx: number) => {
    setTimelineSlots(prev =>
      prev.map((slot, idx) => {
        if (idx !== slotIdx) return slot;
        const filtered = slot.inserts
          .filter((_, i) => i !== insertIdx)
          .map((ins, i) => ({ ...ins, insert_id: `E${i + 1}` }));
        return { ...slot, inserts: filtered };
      })
    );
  };

  const updateSlotInsert = (
    slotIdx: number,
    insertIdx: number,
    patch: Partial<SlotInsertItem>
  ) => {
    setTimelineSlots(prev =>
      prev.map((slot, sIdx) => {
        if (sIdx !== slotIdx) return slot;
        const nextInserts = slot.inserts.map((ins, iIdx) => {
          if (iIdx !== insertIdx) return ins;
          const updated: SlotInsertItem = { ...ins, ...patch };
          if (patch.file_name !== undefined) {
            updated.filename = patch.file_name;
          }
          return updated;
        });
        return { ...slot, inserts: nextInserts };
      })
    );
  };

  // АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ FFmpeg FILTER_COMPLEX ПО СПЕЦИФИКАЦИИ «МЕТЕЛЬ: 3:00:00»
  const buildFFmpegFilterComplexPreview = useCallback((): {
    inputsArgs: string[];
    filterLines: string[];
    finalVideoMap: string;
    finalAudioMap: string;
    encodingFlags: string;
  } => {
    const scaleWh =
      loopResolution === '4k'
        ? '3840:2160'
        : loopResolution === '2k'
        ? '2560:1440'
        : '1920:1080';

    const inputsArgs: string[] = [];
    const filterLines: string[] = [];
    let inputIdx = 0;

    const slotVideoNodes: {
      label: string;
      durationSec: number;
      transitionOut: SlotTransitionOut;
    }[] = [];
    const slotAudioLabels: string[] = [];

    let cumulativeSlotStartSec = 0;

    timelineSlots.forEach((slot, sIdx) => {
      const slotDur = Math.max(10, Number(slot.slot_duration_sec) || 1800);
      const clipDur = Math.max(2, Number(slot.source_clip_duration_sec) || 10);
      const seamSec = Math.max(
        0.2,
        Math.min(clipDur * 0.45, Number(slot.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec) || 1.0)
      );
      const effStep = Math.max(1, clipDur - seamSec);
      const loopSteps = Math.max(1, Math.ceil(slotDur / effStep));
      const baseInput = inputIdx++;

      // 1) Бесшовная петля 10-секундных исходников со швом video+audio crossfade ровно 1.0 сек внутри слота
      inputsArgs.push(
        `-stream_loop ${loopSteps} -t ${slotDur} -i "${slot.file_name}" # [Слот #${slot.slot_index}: ${slot.act_timecode || ''} • исходник ${clipDur}с со швом xfade+acrossfade=${seamSec.toFixed(1)}с]`
      );

      let curVideoLabel = `v_slot_${sIdx}_base`;
      filterLines.push(
        `# Слот #${slot.slot_index} (${slot.title}): бесшовная склейка ${clipDur}с исходника через xfade=duration=${seamSec.toFixed(1)}:offset=${(clipDur - seamSec).toFixed(1)} @ ${videoFps}fps`
      );
      filterLines.push(
        `[${baseInput}:v]scale=${scaleWh},setsar=1,fps=${videoFps},trim=duration=${slotDur},setpts=PTS-STARTPTS[${curVideoLabel}]`
      );

      let curAudioLabel = `a_slot_${sIdx}_base`;
      filterLines.push(
        `[${baseInput}:a]acrossfade=d=${seamSec.toFixed(1)}:c1=tri:c2=tri,atrim=duration=${slotDur},asetpts=PTS-STARTPTS[${curAudioLabel}]`
      );

      // 2) Точная асимметричная анимация вставок (inserts: E1, E2, E3)
      if (Array.isArray(slot.inserts) && slot.inserts.length > 0) {
        slot.inserts.forEach((ins, insIdx) => {
          const insInput = inputIdx++;
          const trig = Math.max(0, Number(ins.trigger_at_sec) || 0);
          const absProjectSec = cumulativeSlotStartSec + trig;
          const dur = Math.max(1, Number(ins.duration_sec) || 10);
          const fadeInType = ins.transition_in?.type || 'dissolve';
          const fadeInDur = Math.max(0.1, Number(ins.transition_in?.duration_sec) || 1.5);
          const fadeOutType = ins.transition_out?.type ?? 'dissolve';
          const fadeOutDur = Math.max(0, Number(ins.transition_out?.duration_sec) || 0);
          const holdToEnd = Boolean(ins.hold_until_end || fadeOutType === 'none' || fadeOutDur <= 0);

          const insLabel = `v_s${sIdx}_${ins.insert_id || `E${insIdx + 1}`}`;
          const nextOverlayLabel = `v_slot_${sIdx}_ovr_${insIdx + 1}`;

          inputsArgs.push(`-i "${ins.file_name}" # [${ins.insert_id} @ глобальный таймкод ${absProjectSec}с / локальный +${trig}с]`);

          if (holdToEnd) {
            // Вставка E3 (таймкод 2:56 / 10560 сек): появление in 1.5 сек, БЕЗ fade out (до конца хронометража)
            filterLines.push(
              `[${insInput}:v]scale=${scaleWh},setsar=1,fps=${videoFps},format=yuva420p,fade=t=in:st=0:d=${fadeInDur}:alpha=1,tpad=stop_mode=clone:stop_duration=${Math.max(1, slotDur - trig)},setpts=PTS-STARTPTS+${trig}/TB[${insLabel}] # ${ins.insert_id}: in ${fadeInDur}s (${fadeInType}) / БЕЗ fade out (до конца хронометража)`
            );
            filterLines.push(
              `[${curVideoLabel}][${insLabel}]overlay=enable='gte(t,${trig})':eof_action=pass[${nextOverlayLabel}]`
            );
          } else {
            // Вставки E1 (in 1.5s / out 1.5s) и E2 (in 1.5s / out 3.0s)
            const fadeOutStart = Math.max(fadeInDur, dur - fadeOutDur);
            filterLines.push(
              `[${insInput}:v]scale=${scaleWh},setsar=1,fps=${videoFps},format=yuva420p,fade=t=in:st=0:d=${fadeInDur}:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur}:alpha=1,setpts=PTS-STARTPTS+${trig}/TB[${insLabel}] # ${ins.insert_id}: in ${fadeInDur}s (${fadeInType}) / out ${fadeOutDur}s (${fadeOutType})`
            );
            filterLines.push(
              `[${curVideoLabel}][${insLabel}]overlay=enable='between(t,${trig},${trig + dur})':eof_action=pass[${nextOverlayLabel}]`
            );
          }
          curVideoLabel = nextOverlayLabel;

          // Аудио вставки: для треска E3 — мягкая компрессия по атаке (soft attack) и лимитер пика <= +6 дБ поверх фона
          const insAudioLabel = `a_s${sIdx}_${ins.insert_id || `E${insIdx + 1}`}`;
          const nextSlotAudioLabel = `a_slot_${sIdx}_mix_${insIdx + 1}`;
          const delayMs = Math.round(trig * 1000);
          const isE3Soft = Boolean(
            ins.audio_soft_compressor ||
              ins.insert_id.toUpperCase() === 'E3' ||
              audioMastering.e3_soft_attack_compressor
          );
          const peakLimitDb = Number(
            ins.max_peak_over_bed_db ?? audioMastering.e3_max_peak_over_bed_db ?? 6
          );
          const aFadeOutChain =
            !holdToEnd && fadeOutDur > 0
              ? `,afade=t=out:st=${Math.max(0.1, dur - fadeOutDur).toFixed(2)}:d=${fadeOutDur}`
              : '';

          if (isE3Soft && ins.insert_id.toUpperCase() === 'E3') {
            filterLines.push(
              `[${insInput}:a]afade=t=in:st=0:d=${fadeInDur}${aFadeOutChain},acompressor=attack=45:release=250:ratio=3:threshold=-18dB:knee=6dB:makeup=2dB,alimiter=limit=${peakLimitDb.toFixed(1)}dB:attack=15:release=100,adelay=${delayMs}|${delayMs}[${insAudioLabel}] # Треск E3: soft-attack компрессия, пик <= +${peakLimitDb} дБ`
            );
          } else {
            filterLines.push(
              `[${insInput}:a]afade=t=in:st=0:d=${fadeInDur}${aFadeOutChain},adelay=${delayMs}|${delayMs}[${insAudioLabel}]`
            );
          }
          filterLines.push(
            `[${curAudioLabel}][${insAudioLabel}]amix=inputs=2:duration=first:dropout_transition=0:weights='1.0 0.85'[${nextSlotAudioLabel}]`
          );
          curAudioLabel = nextSlotAudioLabel;
        });
      }

      slotAudioLabels.push(curAudioLabel);

      const transOut = slot.slot_transition_out || { type: 'none', duration_sec: 0 };
      slotVideoNodes.push({
        label: curVideoLabel,
        durationSec: slotDur,
        transitionOut: transOut
      });

      const overlap = transOut.type !== 'none' ? Number(transOut.duration_sec) || 0 : 0;
      cumulativeSlotStartSec += slotDur - overlap;
    });

    // 3) Стыки актов (0:30, 1:00, 1:40, 2:00, 2:40) — плавный crossfade 90 секунд (видео + синхронное аудио)
    let chainedVideoLabel = slotVideoNodes[0]?.label || '0:v';
    let accumOffset = slotVideoNodes[0]?.durationSec || 0;

    if (slotVideoNodes.length > 1) {
      let prevLabel = slotVideoNodes[0].label;

      for (let i = 1; i < slotVideoNodes.length; i++) {
        const prevTrans = slotVideoNodes[i - 1].transitionOut;
        const nextNode = slotVideoNodes[i];
        const chainLabel = `v_act_chain_${i}`;

        if (prevTrans.type === 'none' || prevTrans.duration_sec <= 0) {
          filterLines.push(`[${prevLabel}][${nextNode.label}]concat=n=2:v=1:a=0[${chainLabel}]`);
          accumOffset += nextNode.durationSec;
        } else {
          const xfadeType = prevTrans.type === 'dissolve' ? 'dissolve' : 'fade';
          const dur = prevTrans.duration_sec;
          const offset = Math.max(0, accumOffset - dur);
          const boundaryMin = Math.round(offset / 60);
          const boundaryH = Math.floor(boundaryMin / 60);
          const boundaryRemMin = String(boundaryMin % 60).padStart(2, '0');
          filterLines.push(
            `[${prevLabel}][${nextNode.label}]xfade=transition=${xfadeType}:duration=${dur}:offset=${offset}[${chainLabel}] # Стык актов ${boundaryH}:${boundaryRemMin} (${offset}с): crossfade ${dur}с`
          );
          accumOffset = offset + nextNode.durationSec;
        }
        prevLabel = chainLabel;
      }
      chainedVideoLabel = prevLabel;
    }

    // 4) Опциональный 2-секундный черный экран в финале после затухания трещины
    let finalVideoMap = chainedVideoLabel;
    const lastTrans = slotVideoNodes[slotVideoNodes.length - 1]?.transitionOut;
    if (lastTrans && lastTrans.type !== 'none' && lastTrans.duration_sec > 0) {
      const fd = lastTrans.duration_sec;
      const st = Math.max(0, accumOffset - fd);
      filterLines.push(`[${chainedVideoLabel}]fade=t=out:st=${st}:d=${fd}[v_faded_end]`);
      chainedVideoLabel = 'v_faded_end';
      finalVideoMap = chainedVideoLabel;
    }

    if (finalBlackScreenEnabled && finalBlackScreenSec > 0) {
      const crackFadeStart = Math.max(0, accumOffset - 1.5);
      filterLines.push(
        `[${chainedVideoLabel}]fade=t=out:st=${crackFadeStart.toFixed(1)}:d=1.5,tpad=stop_mode=add:stop_duration=${finalBlackScreenSec.toFixed(1)}:color=black[v_master_out] # Затухание трещины + финальный черный экран ${finalBlackScreenSec.toFixed(1)} сек`
      );
      finalVideoMap = 'v_master_out';
    }

    // 5) Синхронный аудиокроссфейд между актами (90 сек) + continuous_bed + loudnorm=I=-16:TP=-3:LRA=11
    let veoAudioChain = slotAudioLabels[0] || '0:a';
    if (slotAudioLabels.length > 1) {
      let prevAudio = slotAudioLabels[0];
      for (let i = 1; i < slotAudioLabels.length; i++) {
        const prevTrans = slotVideoNodes[i - 1].transitionOut;
        const aDur =
          prevTrans.type !== 'none' && prevTrans.duration_sec > 0
            ? prevTrans.duration_sec
            : actCrossfadeSec;
        const outAudio = `a_act_chain_${i}`;
        filterLines.push(
          `[${prevAudio}][${slotAudioLabels[i]}]acrossfade=d=${aDur}:c1=tri:c2=tri[${outAudio}] # Аудио синхронно следует за видеокроссфейдом (${aDur}с)`
        );
        prevAudio = outAudio;
      }
      veoAudioChain = prevAudio;
    }

    let preMasterAudio = veoAudioChain;
    if (continuousBed.enabled && continuousBed.file_name) {
      const bedInput = inputIdx++;
      inputsArgs.push(
        `-stream_loop -1 -t ${calculatedProjectDurationSec} -i "${continuousBed.file_name}" # [Непрерывный фоновый слой Omni 1.2 Flash]`
      );
      filterLines.push(
        `[${bedInput}:a]afade=t=in:st=0:d=${continuousBed.acrossfade_sec},atrim=duration=${calculatedProjectDurationSec},asetpts=PTS-STARTPTS[a_bed]`
      );
      filterLines.push(
        `[${veoAudioChain}][a_bed]amix=inputs=2:duration=first:weights='${continuousBed.veo_audio_weight} ${continuousBed.bed_audio_weight}'[a_mixed]`
      );
      preMasterAudio = 'a_mixed';
    }

    if (finalBlackScreenEnabled && finalBlackScreenSec > 0) {
      const fadeOutSt = Math.max(0, accumOffset - 1.5);
      filterLines.push(
        `[${preMasterAudio}]afade=t=out:st=${fadeOutSt.toFixed(1)}:d=1.5,apad=pad_dur=${finalBlackScreenSec.toFixed(1)}[a_padded]`
      );
      preMasterAudio = 'a_padded';
    }

    let finalAudioMap = preMasterAudio;
    if (audioMastering.loudnorm_enabled) {
      const iLufs = Math.max(-18, Math.min(-14, Number(audioMastering.integrated_lufs) || -16));
      const tpDb = Math.min(-3, Number(audioMastering.true_peak_dbtp) || -3);
      const lraVal = Math.max(1, Number(audioMastering.lra) || 11);
      filterLines.push(
        `[${preMasterAudio}]loudnorm=I=${iLufs}:TP=${tpDb}:LRA=${lraVal}[a_master_loudnorm] # Нормализация -18..-14 LUFS, True-Peak <= -3 dBTP`
      );
      finalAudioMap = 'a_master_loudnorm';
    }

    const crfVal = getCrfValue(bitratePreset);
    const codecFlags =
      videoCodec === 'libx265'
        ? `-c:v libx265 -preset medium -crf ${crfVal} -tag:v hvc1 -pix_fmt yuv420p -r ${videoFps}`
        : `-c:v libx264 -preset veryfast -crf ${crfVal} -pix_fmt yuv420p -r ${videoFps}`;
    const audioFlags = `-c:a aac -b:a ${audioBitrateKbps}k -ar 48000`;
    const encodingFlags = `${codecFlags} ${audioFlags}`;

    return { inputsArgs, filterLines, finalVideoMap, finalAudioMap, encodingFlags };
  }, [
    timelineSlots,
    loopResolution,
    internalLoopCrossfadeSec,
    videoFps,
    actCrossfadeSec,
    finalBlackScreenEnabled,
    finalBlackScreenSec,
    continuousBed,
    calculatedProjectDurationSec,
    audioMastering,
    bitratePreset,
    videoCodec,
    audioBitrateKbps
  ]);

  const ffmpegPreview = buildFFmpegFilterComplexPreview();

  // Формирование исходящего манифеста строго из текущего состояния полей интерфейса (без хардкода)
  const currentManifest: LoopBuildManifest = {
    version: '4.0-universal',
    spec_profile: importedManifestName || `Universal Loop (${videoCodec} ${videoFps}fps • AAC ${audioBitrateKbps}kbps)`,
    hours: loopHours,
    calculated_project_duration_sec: calculatedProjectDurationSec,
    resolution: loopResolution,
    video_codec: videoCodec,
    fps: videoFps,
    audio_codec: 'aac',
    audio_bitrate_kbps: audioBitrateKbps,
    native_audio_engine: 'Omni 1.2 Flash',
    bitrate_preset: bitratePreset,
    crf: getCrfValue(bitratePreset),
    crossfade_loop: seamlessStitchEnabled,
    seamless_mode: seamlessTransitionMode,
    act_crossfade_sec: actCrossfadeSec,
    internal_clip_duration_sec: timelineSlots[0]?.source_clip_duration_sec ?? 10,
    internal_loop_crossfade_sec: internalLoopCrossfadeSec,
    video_crossfade_sec: crossfadeDuration,
    audio_crossfade_sec: audioCrossfadeEnabled ? audioCrossfadeDuration : 0,
    use_embedded_audio: useEmbeddedAudio,
    final_black_screen_enabled: finalBlackScreenEnabled,
    final_black_screen_sec: finalBlackScreenSec,
    audio_mastering: audioMastering,
    video_filename:
      loopMedia?.name ||
      timelineSlots[0]?.file_name ||
      expectedVideoFilename ||
      '',
    ...(useEmbeddedAudio
      ? {}
      : {
          audio_filename:
            loopAudio?.name ||
            continuousBed.file_name ||
            expectedAudioFilename ||
            ''
        }),
    gdrive_folder_id: gdriveFolderId || '',
    cloud_export: {
      target_folder_id: gdriveFolderId || ''
    },
    continuous_bed: continuousBed,
    timeline_slots: timelineSlots.map(slot => ({
      ...slot,
      act_title: slot.act_title ?? slot.title ?? '',
      title: slot.title ?? slot.act_title ?? '',
      file_name: slot.file_name ?? '',
      base_content: {
        ...(slot.base_content || {}),
        file_name: slot.file_name ?? ''
      },
      inserts: slot.inserts.map(ins => ({
        ...ins,
        file_name: ins.file_name ?? '',
        filename: ins.file_name ?? ''
      }))
    }))
  };

  // Безопасное UTF-8 кодирование строки с кириллицей («Метель», названия актов/сцен) в Base64
  const toBase64 = (str: string): string => {
    try {
      const bytes = new TextEncoder().encode(str);
      const binString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
      return btoa(binString);
    } catch {
      return btoa(unescape(encodeURIComponent(str)));
    }
  };

  const encodeManifestBase64 = (manifestObj: unknown): string => {
    return toBase64(JSON.stringify(manifestObj));
  };

  // 100% универсальный динамический парсер слота из любого входного JSON (без подстановки фейковых имен)
  const normalizeTimelineSlot = (rawSlot: Record<string, unknown>, idx: number): TimelineSlot => {
    const num = idx + 1;
    const pad = String(num).padStart(2, '0');

    const baseContent =
      rawSlot.base_content && typeof rawSlot.base_content === 'object'
        ? (rawSlot.base_content as Record<string, unknown>)
        : undefined;

    // Универсальная цепочка чтения имени файла слота (без дефолтного fallback-значения)
    const rawFileName = String(
      baseContent?.file_name ||
        baseContent?.filename ||
        baseContent?.asset_name ||
        baseContent?.video_file ||
        rawSlot.file_name ||
        rawSlot.filename ||
        rawSlot.asset_name ||
        rawSlot.video_file ||
        ''
    ).trim();

    let rawInserts: unknown[] = [];
    if (Array.isArray(rawSlot.inserts)) {
      rawInserts = rawSlot.inserts;
    } else if (rawSlot.insert && typeof rawSlot.insert === 'object') {
      rawInserts = [rawSlot.insert];
    }

    const parsedInserts: SlotInsertItem[] = rawInserts
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, insIdx) => {
        const insertId = String(item.insert_id || item.id || `E${insIdx + 1}`);
        const isE3 = insertId.toUpperCase() === 'E3';
        const isE2 = insertId.toUpperCase() === 'E2';

        const itemBaseContent =
          item.base_content && typeof item.base_content === 'object'
            ? (item.base_content as Record<string, unknown>)
            : undefined;

        // Реальное имя файла вставки без подстановки тестовых заглушек
        const rawInsertFileName = String(
          item.file_name ||
            item.filename ||
            item.asset_name ||
            item.video_file ||
            itemBaseContent?.file_name ||
            itemBaseContent?.filename ||
            ''
        ).trim();

        const transInObj =
          item.transition_in && typeof item.transition_in === 'object'
            ? (item.transition_in as Record<string, unknown>)
            : {};
        const tInType =
          transInObj.type === 'fade' || item.transition_in === 'fade' ? 'fade' : 'dissolve';
        const tInDur =
          Number(transInObj.duration_sec ?? item.fade_in_sec ?? item.transition_duration_sec ?? 1.5) ||
          1.5;

        const transOutObj =
          item.transition_out && typeof item.transition_out === 'object'
            ? (item.transition_out as Record<string, unknown>)
            : {};
        const rawOutType = String(
          transOutObj.type ?? (item.hold_until_end || isE3 ? 'none' : 'dissolve')
        ).toLowerCase();
        const tOutType: 'dissolve' | 'fade' | 'none' =
          rawOutType === 'none' ? 'none' : rawOutType === 'fade' ? 'fade' : 'dissolve';
        const defaultOutDur = isE3 ? 0 : isE2 ? 3.0 : 1.5;
        const tOutDur =
          tOutType === 'none'
            ? 0
            : Number(transOutObj.duration_sec ?? item.fade_out_sec ?? defaultOutDur) || defaultOutDur;

        const holdUntilEnd = Boolean(item.hold_until_end ?? (tOutType === 'none' || isE3));

        const insStartSec = typeof item.start_sec === 'number' ? item.start_sec : undefined;
        const insEndSec = typeof item.end_sec === 'number' ? item.end_sec : undefined;
        const insComputedDur =
          insStartSec !== undefined && insEndSec !== undefined && insEndSec > insStartSec
            ? insEndSec - insStartSec
            : undefined;

        return {
          insert_id: insertId,
          timecode_label:
            typeof item.timecode_label === 'string'
              ? item.timecode_label
              : typeof item.title === 'string'
              ? item.title
              : undefined,
          asset_id: String(item.asset_id ?? item.id ?? ''),
          file_name: rawInsertFileName,
          filename: rawInsertFileName,
          trigger_at_sec: Math.max(
            0,
            Number(item.trigger_at_sec ?? item.start_sec ?? 0) || 0
          ),
          duration_sec: Math.max(1, Number(item.duration_sec ?? insComputedDur ?? 10) || 10),
          transition_in: {
            type: tInType,
            duration_sec: tInDur
          },
          transition_out: {
            type: tOutType,
            duration_sec: tOutDur
          },
          hold_until_end: holdUntilEnd,
          audio_soft_compressor: Boolean(item.audio_soft_compressor ?? isE3),
          max_peak_over_bed_db: Number(item.max_peak_over_bed_db ?? 6) || 6
        };
      });

    const rawTransOut =
      rawSlot.slot_transition_out && typeof rawSlot.slot_transition_out === 'object'
        ? (rawSlot.slot_transition_out as Record<string, unknown>)
        : rawSlot.transition_out && typeof rawSlot.transition_out === 'object'
        ? (rawSlot.transition_out as Record<string, unknown>)
        : {};
    const outTypeRaw = String(rawTransOut.type ?? 'xfade').toLowerCase();
    const outType: SlotTransitionOut['type'] =
      outTypeRaw === 'none'
        ? 'none'
        : outTypeRaw === 'dissolve'
        ? 'dissolve'
        : outTypeRaw === 'fade'
        ? 'fade'
        : 'xfade';
    const outDur =
      outType === 'none' ? 0 : Math.max(0, Number(rawTransOut.duration_sec ?? 90.0) || 90.0);

    // Вычисление длительности слота: slot.slot_duration_sec ?? (slot.end_sec - slot.start_sec)
    const startSec = typeof rawSlot.start_sec === 'number' ? rawSlot.start_sec : undefined;
    const endSec = typeof rawSlot.end_sec === 'number' ? rawSlot.end_sec : undefined;
    const rangeDurationSec =
      startSec !== undefined && endSec !== undefined && endSec >= startSec
        ? endSec - startSec
        : undefined;
    const resolvedDurationSec = Number(
      rawSlot.slot_duration_sec ??
        baseContent?.slot_duration_sec ??
        rawSlot.duration_sec ??
        rangeDurationSec ??
        1800
    );

    const resolvedActTitle = String(rawSlot.act_title || rawSlot.title || '');
    const resolvedSlotId = String(rawSlot.slot_id ?? `SLOT_${pad}`);
    const resolvedAssetId = String(
      rawSlot.asset_id || baseContent?.asset_id || ''
    );

    return {
      slot_index: Number(rawSlot.slot_index ?? num) || num,
      slot_id: resolvedSlotId,
      act_title: resolvedActTitle,
      title: resolvedActTitle,
      act_timecode:
        typeof rawSlot.act_timecode === 'string'
          ? rawSlot.act_timecode
          : startSec !== undefined && endSec !== undefined
          ? `${startSec}s – ${endSec}s`
          : undefined,
      asset_id: resolvedAssetId,
      file_name: rawFileName,
      base_content: {
        ...(baseContent || {}),
        file_name: rawFileName
      },
      ...(startSec !== undefined ? { start_sec: startSec } : {}),
      ...(endSec !== undefined ? { end_sec: endSec } : {}),
      source_clip_duration_sec: Math.max(
        1,
        Number(
          rawSlot.source_clip_duration_sec ??
            baseContent?.source_clip_duration_sec ??
            baseContent?.clip_duration_sec ??
            10
        ) || 10
      ),
      internal_loop_crossfade_sec: Math.max(
        0.1,
        Number(
          rawSlot.internal_loop_crossfade_sec ??
            baseContent?.internal_loop_crossfade_sec ??
            baseContent?.loop_crossfade_sec ??
            1.0
        ) || 1.0
      ),
      slot_duration_sec: Math.max(1, resolvedDurationSec || 1800),
      inserts: parsedInserts,
      slot_transition_out: {
        type: outType,
        duration_sec: outDur
      }
    };
  };

  // Прямой маппинг всех полей любого валидного JSON-манифеста 1 в 1 в состояние приложения
  const applyManifestObject = (raw: Record<string, unknown>, sourceLabel: string) => {
    const timelineObj =
      raw.timeline && typeof raw.timeline === 'object'
        ? (raw.timeline as Record<string, unknown>)
        : undefined;
    const exportSettingsObj =
      raw.export_settings && typeof raw.export_settings === 'object'
        ? (raw.export_settings as Record<string, unknown>)
        : raw.encoding && typeof raw.encoding === 'object'
        ? (raw.encoding as Record<string, unknown>)
        : undefined;
    const cloudExportObj =
      raw.cloud_export && typeof raw.cloud_export === 'object'
        ? (raw.cloud_export as Record<string, unknown>)
        : undefined;

    // 1. Parse unlimited timeline_slots / slots
    const rawSlots = Array.isArray(raw.timeline_slots)
      ? raw.timeline_slots
      : Array.isArray(raw.slots)
      ? raw.slots
      : Array.isArray(timelineObj?.timeline_slots)
      ? (timelineObj?.timeline_slots as unknown[])
      : Array.isArray(timelineObj?.slots)
      ? (timelineObj?.slots as unknown[])
      : null;

    if (rawSlots && rawSlots.length > 0) {
      const normalized = rawSlots
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s, idx) => normalizeTimelineSlot(s, idx));

      if (normalized.length > 0) {
        setTimelineSlots(normalized);
        const totalSec = normalized.reduce((acc, sl, idx) => {
          const isLast = idx === normalized.length - 1;
          const overlap =
            !isLast && sl.slot_transition_out.type !== 'none'
              ? sl.slot_transition_out.duration_sec
              : 0;
          return acc + sl.slot_duration_sec - overlap;
        }, 0);
        const derivedHours = Math.max(3, Math.min(10, Math.round(totalSec / 3600) || 3));
        if (raw.hours === undefined) {
          setLoopHours(derivedHours);
        }
        setExpectedVideoFilename(normalized[0]?.file_name || '');
      }
    }

    // 2. Parse continuous_bed config if present
    if (raw.continuous_bed && typeof raw.continuous_bed === 'object') {
      const bedObj = raw.continuous_bed as Record<string, unknown>;
      const bedFileName = String(
        bedObj.file_name || bedObj.filename || bedObj.asset_name || ''
      ).trim();
      setContinuousBed(prev => ({
        enabled: typeof bedObj.enabled === 'boolean' ? bedObj.enabled : Boolean(bedFileName),
        asset_id: typeof bedObj.asset_id === 'string' ? bedObj.asset_id : '',
        file_name: bedFileName,
        acrossfade_sec:
          typeof bedObj.acrossfade_sec === 'number'
            ? bedObj.acrossfade_sec
            : prev.acrossfade_sec,
        veo_native_audio:
          typeof bedObj.veo_native_audio === 'boolean'
            ? bedObj.veo_native_audio
            : prev.veo_native_audio,
        veo_audio_weight:
          typeof bedObj.veo_audio_weight === 'number'
            ? bedObj.veo_audio_weight
            : prev.veo_audio_weight,
        bed_audio_weight:
          typeof bedObj.bed_audio_weight === 'number'
            ? bedObj.bed_audio_weight
            : prev.bed_audio_weight
      }));
    }

    // 2b. Parse codec, fps, audio bitrate, act crossfade, black screen & audio_mastering
    const rawCodec = raw.video_codec ?? exportSettingsObj?.video_codec ?? exportSettingsObj?.codec;
    if (rawCodec === 'libx265' || rawCodec === 'libx264') {
      setVideoCodec(rawCodec);
    } else if (typeof rawCodec === 'string') {
      if (rawCodec.toLowerCase().includes('265') || rawCodec.toLowerCase().includes('hevc')) {
        setVideoCodec('libx265');
      } else if (rawCodec.toLowerCase().includes('264')) {
        setVideoCodec('libx264');
      }
    }

    const rawFps = Number(raw.fps ?? exportSettingsObj?.fps);
    if (rawFps === 24 || rawFps === 30 || rawFps === 60) {
      setVideoFps(rawFps as 24 | 30 | 60);
    }

    const rawAudioBitrate = Number(
      raw.audio_bitrate_kbps ?? exportSettingsObj?.audio_bitrate_kbps
    );
    if (rawAudioBitrate === 320 || rawAudioBitrate === 256 || rawAudioBitrate === 192) {
      setAudioBitrateKbps(rawAudioBitrate as 320 | 256 | 192);
    }

    if (typeof raw.act_crossfade_sec === 'number' && raw.act_crossfade_sec > 0) {
      setActCrossfadeSec(raw.act_crossfade_sec);
    }
    if (
      typeof raw.internal_loop_crossfade_sec === 'number' &&
      raw.internal_loop_crossfade_sec > 0
    ) {
      setInternalLoopCrossfadeSec(raw.internal_loop_crossfade_sec);
    }
    if (typeof raw.final_black_screen_enabled === 'boolean') {
      setFinalBlackScreenEnabled(raw.final_black_screen_enabled);
    }
    if (typeof raw.final_black_screen_sec === 'number' && raw.final_black_screen_sec >= 0) {
      setFinalBlackScreenSec(raw.final_black_screen_sec);
    }
    if (raw.audio_mastering && typeof raw.audio_mastering === 'object') {
      const am = raw.audio_mastering as Record<string, unknown>;
      setAudioMastering(prev => ({
        loudnorm_enabled:
          typeof am.loudnorm_enabled === 'boolean' ? am.loudnorm_enabled : prev.loudnorm_enabled,
        integrated_lufs:
          typeof am.integrated_lufs === 'number'
            ? Math.max(-18, Math.min(-14, am.integrated_lufs))
            : prev.integrated_lufs,
        true_peak_dbtp:
          typeof am.true_peak_dbtp === 'number'
            ? Math.min(-3, am.true_peak_dbtp)
            : prev.true_peak_dbtp,
        lra: typeof am.lra === 'number' ? am.lra : prev.lra,
        e3_soft_attack_compressor:
          typeof am.e3_soft_attack_compressor === 'boolean'
            ? am.e3_soft_attack_compressor
            : prev.e3_soft_attack_compressor,
        e3_max_peak_over_bed_db:
          typeof am.e3_max_peak_over_bed_db === 'number'
            ? am.e3_max_peak_over_bed_db
            : prev.e3_max_peak_over_bed_db
      }));
    }

    // 3. Hours (clamped 3..10)
    if (raw.hours !== undefined) {
      const h = Math.max(3, Math.min(10, Number(raw.hours) || 3));
      setLoopHours(h);
    }

    // 4. Resolution ('1080p' | '2k' | '4k')
    const rawRes = raw.resolution ?? exportSettingsObj?.resolution;
    if (typeof rawRes === 'string') {
      const normRes = rawRes.toLowerCase();
      if (normRes === '1080p' || normRes === '2k' || normRes === '4k') {
        setLoopResolution(normRes);
      } else if (normRes.includes('3840') || normRes.includes('2160')) {
        setLoopResolution('4k');
      } else if (normRes.includes('2560') || normRes.includes('1440')) {
        setLoopResolution('2k');
      } else if (normRes.includes('1920') || normRes.includes('1080')) {
        setLoopResolution('1080p');
      }
    }

    // 5. Bitrate Preset & CRF ('cinema' | 'standard' | 'eco')
    const rawPreset = raw.bitrate_preset ?? exportSettingsObj?.bitrate_preset;
    const rawCrf = raw.crf ?? exportSettingsObj?.crf;
    if (typeof rawPreset === 'string') {
      const normPreset = rawPreset.toLowerCase();
      if (normPreset === 'cinema' || normPreset === 'standard' || normPreset === 'eco') {
        setBitratePreset(normPreset);
      } else if (normPreset.includes('cinema') || normPreset.includes('master')) {
        setBitratePreset('cinema');
      } else if (normPreset.includes('eco')) {
        setBitratePreset('eco');
      } else {
        setBitratePreset('standard');
      }
    } else if (typeof rawCrf === 'number') {
      if (rawCrf <= 19) setBitratePreset('cinema');
      else if (rawCrf >= 25) setBitratePreset('eco');
      else setBitratePreset('standard');
    }

    // 6. Seamless Stitch & Video/Audio Crossfade Durations
    if (typeof raw.crossfade_loop === 'boolean') {
      setSeamlessStitchEnabled(raw.crossfade_loop);
    } else if (typeof raw.seamless_crossfade === 'boolean') {
      setSeamlessStitchEnabled(raw.seamless_crossfade);
    }

    if (typeof raw.seamless_mode === 'string') {
      if (raw.seamless_mode === 'pingpong' || raw.seamless_mode === 'crossfade') {
        setSeamlessTransitionMode(raw.seamless_mode);
      }
    }

    const vFade = Number(raw.video_crossfade_sec ?? raw.seamless_crossfade);
    if (!isNaN(vFade) && vFade >= 0.5 && vFade <= 5.0) {
      setCrossfadeDuration(vFade);
      setSeamlessStitchEnabled(true);
    }

    const aFade = Number(raw.audio_crossfade_sec);
    if (!isNaN(aFade)) {
      if (aFade > 0) {
        setAudioCrossfadeEnabled(true);
        setAudioCrossfadeDuration(aFade);
      } else {
        setAudioCrossfadeEnabled(false);
      }
    }

    // 7. Flag for using embedded audio from video file
    if (typeof raw.use_embedded_audio === 'boolean') {
      setUseEmbeddedAudio(raw.use_embedded_audio);
    }

    // 8. Target Google Drive Folder ID (from cloud_export.target_folder_id or gdrive_folder_id)
    const resolvedFolderId = String(
      cloudExportObj?.target_folder_id ||
        cloudExportObj?.gdrive_folder_id ||
        cloudExportObj?.folder_id ||
        raw.target_folder_id ||
        raw.gdrive_folder_id ||
        ''
    ).trim();
    if (resolvedFolderId) {
      setGdriveFolderId(resolvedFolderId);
      localStorage.setItem('ac_gdrive_folder_id', resolvedFolderId);
    }

    // 9. Bound top-level filenames if explicitly provided
    if (typeof raw.video_filename === 'string') {
      setExpectedVideoFilename(raw.video_filename.trim());
    }
    if (typeof raw.audio_filename === 'string') {
      setExpectedAudioFilename(raw.audio_filename.trim());
    }

    setImportedManifestName(sourceLabel);
    showToast(
      `JSON-манифест «${sourceLabel}» (${rawSlots ? `${rawSlots.length} слотов` : 'конфиг'}) успешно применен!`,
      'success'
    );
  };

  // Import JSON Manifest from file input
  const handleImportManifestFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = String(ev.target?.result || '');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
          showToast('Некорректный формат JSON-манифеста!', 'error');
          return;
        }
        applyManifestObject(parsed as Record<string, unknown>, file.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast('Ошибка чтения JSON: ' + msg, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Export current Loop settings to JSON file
  const handleExportManifestFile = () => {
    const jsonString = JSON.stringify(currentManifest, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const baseName = importedManifestName
      ? importedManifestName.replace(/\.json$/i, '')
      : `project_manifest_${videoCodec}_${videoFps}fps_${loopResolution}`;
    const exportFileName = `${baseName}.json`;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Манифест ${exportFileName} экспортирован!`, 'success');
  };

  // Прикрепление локального видеофайла напрямую к конкретному слоту
  const handleAttachSlotFile = (slotIdx: number, file: File | null) => {
    if (!file) return;
    setLoopMedia(file);
    setUploadedLoopAssets(prev => ({
      ...prev,
      [file.name]: file
    }));
    updateTimelineSlotField(slotIdx, 'file_name', file.name);
    showToast(`К слоту #${slotIdx + 1} прикреплен локальный файл «${file.name}»`, 'success');
  };

  // Прикрепление локального видеофайла напрямую к вставке внутри слота
  const handleAttachInsertFile = (slotIdx: number, insIdx: number, file: File | null) => {
    if (!file) return;
    setUploadedLoopAssets(prev => ({
      ...prev,
      [file.name]: file
    }));
    updateSlotInsert(slotIdx, insIdx, { file_name: file.name });
    showToast(
      `К вставке E${insIdx + 1} (слот #${slotIdx + 1}) прикреплен файл «${file.name}»`,
      'success'
    );
  };

  // Прямой и чистый запуск облачной сборки (без выгрузки файлов в GitHub Releases)
  const startLoopRender = async () => {
    const githubToken = ghToken.trim();
    if (!githubToken) {
      showToast('Настройте подключение к GitHub (Personal Access Token)!', 'error');
      openConfigModal();
      return;
    }
    if (loopHours < 3 || loopHours > 10) {
      showToast('Длительность лупа должна быть строго от 3 до 10 часов!', 'error');
      return;
    }

    const scaleFlag = getScaleFilter(loopResolution);
    const crfVal = getCrfValue(bitratePreset);
    const manifestBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(currentManifest))));

    try {
      const response = await fetch(
        'https://api.github.com/repos/ZermeXX/aetherflow-render/actions/workflows/render_loop.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              release_tag: 'none',
              manifest_payload: manifestBase64
            }
          })
        }
      );

      if (response.status === 204) {
        showStatusBar(
          'Сборка успешно запущена в GitHub Actions!',
          `release_tag: none | manifest_payload (Base64, ${manifestBase64.length} байт) | Хронометраж: ${calculatedProjectDurationSec}s | CRF ${crfVal} | ${scaleFlag}`,
          'ZermeXX/aetherflow-render'
        );
        appendTerminalLog(
          '[00:00] ✅ Сборка успешно запущена в GitHub Actions!',
          'success'
        );
        showToast('Сборка успешно запущена в GitHub Actions!', 'success');
      } else {
        const errText = await response.text().catch(() => '');
        const exactError = errText.trim() || response.statusText || `HTTP ${response.status}`;
        setRenderStatus(prev => ({
          ...prev,
          visible: true,
          status: 'failure',
          title: `❌ Ошибка запуска GitHub Actions (${response.status})`,
          stepLabel: exactError
        }));
        appendTerminalLog(
          `[00:00] ❌ Ошибка GitHub API (${response.status}): ${exactError}`,
          'error'
        );
        showToast(`Ошибка GitHub API (${response.status}): ${exactError}`, 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRenderStatus(prev => ({
        ...prev,
        visible: true,
        status: 'failure',
        title: '❌ Сетевой сбой при вызове GitHub API',
        stepLabel: msg
      }));
      appendTerminalLog(`[00:00] ❌ Сбой запуска сборки: ${msg}`, 'error');
      showToast('Сбой запуска облачной сборки: ' + msg, 'error');
    }
  };

  // Thumbnail Canvas Rendering
  const renderThumbnailCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 1280, 720);

    // Background
    if (thumbImg) {
      ctx.drawImage(thumbImg, 0, 0, 1280, 720);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#334155';
      ctx.font = '24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Загрузите изображение для предпросмотра', 640, 360);
    }

    // Bottom gradient overlay
    const grad = ctx.createLinearGradient(0, 400, 0, 720);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 400, 1280, 320);

    // Cinematic badge
    if (thumbBadge !== 'none') {
      const badgeX = 1280 - 180;
      const badgeY = 30;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, 150, 42, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      let bText = '4K ULTRA HD';
      if (thumbBadge === 'ambience') bText = 'AMBIENCE 60FPS';
      if (thumbBadge === '10h') bText = '10 HOURS LOOP';
      ctx.fillText(bText, badgeX + 75, badgeY + 26);
    }

    // Title text
    if (thumbTitle) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px "Bebas Neue", sans-serif';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 12;
      ctx.fillText(thumbTitle.toUpperCase(), 50, 660);
      ctx.shadowBlur = 0;
    }
  }, [thumbImg, thumbBadge, thumbTitle]);

  useEffect(() => {
    if (activeTab === 'thumb') {
      renderThumbnailCanvas();
    }
  }, [activeTab, renderThumbnailCanvas]);

  const loadThumbBaseImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        const img = new Image();
        img.onload = () => {
          setThumbImg(img);
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const downloadThumbnail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'thumbnail_4k.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  // =========================================
  // VERBAFLOW ENGINE: REWRITE & COMPLIANCE
  // =========================================
  const runVerbaFlowRewrite = useCallback(() => {
    const raw = sourceText.trim();
    if (!raw) {
      showToast('Введите исходный текст или заметку для переработки!', 'error');
      return;
    }

    // Extract key sentences / subject from source text
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
    const coreSubject =
      sentences[0]?.replace(/[.!?]+$/, '') || 'Засекреченный архивный объект';
    const detailOne =
      sentences[1]?.replace(/[.!?]+$/, '') ||
      'Приборы зафиксировали аномалию, которую невозможно объяснить классической физикой';
    const detailTwo =
      sentences.slice(2).join(' ') ||
      'Свидетельства очевидцев указывают на то, что ключевая улика все еще скрыта на месте событий.';

    // Build 15-sec Hook based on MysteryType
    const hookByMystery: Record<MysteryType, string> = {
      mystery: `[00:00–00:15 • ХУК-ТАЙНА] Все официальные отчеты утверждали одно: «${coreSubject}». Но никто не смог объяснить деталь, обнаруженную на 14-й секунде архивной пленки — именно там скрыто то, ради чего территорию закрыли на полвека...`,
      question: `[00:00–00:15 • ХУК-ВОПРОС] Что заставило опытных специалистов бросить оборудование за одну ночь? Если «${coreSubject}» — всего лишь совпадение, то почему датчики продолжали передавать сигнал из пустого бункера?`,
      epicenter: `[00:00–00:15 • В ЭПИЦЕНТР СОБЫТИЯ] 03:17 ночи. Красный индикатор зашкаливает. На столе остается включенный магнитофон: «${coreSubject}». Через двенадцать минут связь обрывается, но запись продолжается...`,
      myth: `[00:00–00:15 • РАЗРУШЕНИЕ МИФА] Десятилетиями эту историю списывали на обычную природную случайность. Но рассекреченный протокол доказывает обратное: «${coreSubject}» стал лишь прикрытием для куда более масштабного эксперимента.`
    };

    // Tone modifiers
    const toneConfig: Record<
      ToneOfVoice,
      { badge: string; leadIn: string; transition: string; closer: string }
    > = {
      doc: {
        badge: '🎬 Документальный жанр',
        leadIn: 'Хроника событий восстанавливается по крупицам из уцелевших журналов дежурств.',
        transition: 'Однако в этой стройной картине обнаруживается критическое несоответствие.',
        closer: 'И пока архивы остаются закрытыми, финальная точка в этом досье не поставлена.'
      },
      storyteller: {
        badge: '🎙️ Живой рассказчик (YouTube)',
        leadIn: 'Только представьте себе эту картину: вы открываете старый кейс, а внутри — то, чего там быть просто не может.',
        transition: 'И вот тут начинается самое интересное — деталь, которую упустили почти все.',
        closer: 'Напишите в комментариях, какой из двух сценариев кажется вам реальным.'
      },
      truecrime: {
        badge: '🕵️ Расследование / Тру-крайм',
        leadIn: 'Улика №1 в материалах дела противоречит первичным показаниям.',
        transition: 'Сопоставим временные метки: между последним выходом на связь и оцеплением прошло ровно 40 минут.',
        closer: 'Следствие закрыло дело, но главная нестыковка так и осталась без ответа.'
      },
      scipop: {
        badge: '🧠 Научпоп / Аналитика',
        leadIn: 'Если отбросить конспирологию и взглянуть на сухие данные телеметрии, возникает парадокс.',
        transition: 'С точки зрения акустики и геофизики, подобный резонанс требует колоссального источника энергии.',
        closer: 'Именно этот физический феномен и делает данный случай уникальным для современной науки.'
      },
      dynamic: {
        badge: '🔥 Динамичный / Энергичный',
        leadIn: 'Никаких долгих вступлений — сразу к фактам, от которых бегут мурашки.',
        transition: 'Думаете, на этом всё закончилось? Как бы не так! Вторая фаза началась мгновенно.',
        closer: 'Это меняет абсолютно всё, что мы знали об этой истории раньше!'
      },
      neutral: {
        badge: '⚖️ Нейтральный / Строгий',
        leadIn: 'Зафиксированные документальные сведения позволяют выделить три ключевых этапа инцидента.',
        transition: 'При анализе вторичных источников выявляется ряд объективных противоречий.',
        closer: 'Совокупность приведенных фактов оставляет вопрос открытым для дальнейшей экспертизы.'
      }
    };

    const selectedHook = hookByMystery[mysteryType];
    const tone = toneConfig[toneOfVoice];

    const packOf5Hooks = [
      `1. [ТАЙНА 0–15с]: ${hookByMystery.mystery}`,
      `2. [ПРОВОКАЦИЯ 0–15с]: ${hookByMystery.question}`,
      `3. [ЭПИЦЕНТР 0–15с]: ${hookByMystery.epicenter}`,
      `4. [МИФ 0–15с]: ${hookByMystery.myth}`,
      `5. [КОНТРАСТ 0–15с]: На бумаге объект числился полностью заброшенным. На практике — внутри каждую ночь фиксировался импульс: «${coreSubject}».`
    ];

    setGeneratedHook15s(selectedHook);

    if (verbaMode === '15sec_rewrite') {
      setGeneratedHookPack([]);
      setGeneratedScript(
        `=== БЛОК 1: ЗАВЯЗКА И КОНТЕКСТ (${tone.badge}) ===\n` +
          `${tone.leadIn}\n` +
          `${coreSubject}. ${detailOne}.\n\n` +
          `=== БЛОК 2: ПЕТЛЯ УДЕРЖАНИЯ (ОТКРЫТЫЙ ВОПРОС) ===\n` +
          `${tone.transition} Но прежде чем мы разберем содержимое найденного носителя, обратите внимание на странную закономерность в датах...\n\n` +
          `=== БЛОК 3: КУЛЬМИНАЦИЯ И АНАЛИЗ ФАКТОВ ===\n` +
          `${detailTwo}\n\n` +
          `=== ФИНАЛ ===\n` +
          `${tone.closer}`
      );
    } else if (verbaMode === 'pack5_script') {
      setGeneratedHookPack(packOf5Hooks);
      setGeneratedScript(
        `=== ПОЛНЫЙ СЦЕНАРИЙ РОЛИКА (${tone.badge}) ===\n\n` +
          `[СЦЕНА 1 • 00:15–01:10 | Визуал: Медленный наезд Ken Burns на архивный кадр]\n` +
          `${tone.leadIn} ${coreSubject}.\n\n` +
          `[СЦЕНА 2 • 01:10–02:30 | Визуал: Крупный план приборов и карты локации]\n` +
          `${detailOne}. ${tone.transition}\n\n` +
          `[СЦЕНА 3 • 02:30–04:00 | Визуал: Сравнение официальной версии и скрытых улик]\n` +
          `${detailTwo}\n\n` +
          `[СЦЕНА 4 • ФИНАЛ | Визуал: Затемнение под низкий эмбиенс]\n` +
          `${tone.closer}`
      );
    } else if (verbaMode === 'doc_loops') {
      setGeneratedHookPack([]);
      setGeneratedScript(
        `=== ДОКУМЕНТАЛЬНЫЙ СЦЕНАРИЙ С ПЕТЛЯМИ ИНТРИГИ (${tone.badge}) ===\n\n` +
          `[ГЛАВА I. ИСХОДНЫЙ ИМПУЛЬС]\n` +
          `${tone.leadIn} ${coreSubject}.\n` +
          `🪝 ПЕТЛЯ ИНТРИГИ #1: Тогда никто не придал значения короткому сбою питания, но через 18 минут именно он станет ключом к разгадке...\n\n` +
          `[ГЛАВА II. СКРЫТЫЙ ФАКТОР]\n` +
          `${detailOne}. ${tone.transition}\n` +
          `🪝 ПЕТЛЯ ИНТРИГИ #2: Однако главная аномалия скрывалась не в самом сигнале, а в том, откуда именно он транслировался...\n\n` +
          `[ГЛАВА III. РАЗВЯЗКА АРХИВА]\n` +
          `${detailTwo}\n` +
          `🪝 ПЕТЛЯ ИНТРИГИ #3 (ФИНАЛЬНЫЙ ТВИСТ): ${tone.closer}`
      );
    } else {
      // shorts_1sec
      setGeneratedHookPack([]);
      setGeneratedScript(
        `=== SHORTS / REELS СЦЕНАРИЙ (УДЕРЖАНИЕ С 1-Й СЕКУНДЫ • ДО 60 СЕК) ===\n\n` +
          `[00:00–00:03 • СТОП-КАДР]: Стоп! Эту запись пытались стереть трижды.\n` +
          `[00:03–00:15 • ИНТРИГА]: ${coreSubject}.\n` +
          `[00:15–00:35 • РАЗВИТИЕ (Смена кадров каждые 2.5 сек)]: ${detailOne}.\n` +
          `[00:35–00:52 • КУЛЬМИНАЦИЯ]: ${detailTwo}\n` +
          `[00:52–00:60 • ЗАКОЛЬЦОВКА (LOOP END)]: ${tone.closer} А начинается всё с того, что...`
      );
    }

    showToast('Текст успешно переработан движком VerbaFlow!', 'success');
  }, [sourceText, mysteryType, toneOfVoice, verbaMode, showToast]);

  // Run initial generation on first load so the workspace is immediately populated
  useEffect(() => {
    if (!generatedScript && sourceText) {
      runVerbaFlowRewrite();
    }
  }, []);

  // YouTube Compliance Check
  const runYouTubeComplianceCheck = () => {
    const combinedText = `${sourceText}\n${generatedHook15s}\n${generatedScript}`;
    const foundIssues: ComplianceIssue[] = [];

    COMPLIANCE_DICTIONARY.forEach(entry => {
      const matches = combinedText.match(entry.pattern);
      if (matches && matches.length > 0) {
        const uniqueMatches = Array.from(new Set(matches.map(m => m.toLowerCase())));
        foundIssues.push({
          word: uniqueMatches.join(', '),
          category: entry.category,
          risk: entry.risk,
          replacements: entry.replacements
        });
      }
    });

    const score = Math.max(
      10,
      100 -
        foundIssues.reduce(
          (acc, item) => acc + (item.risk === 'high' ? 22 : 12),
          0
        )
    );

    setComplianceReport({
      checked: true,
      issues: foundIssues,
      score
    });

    if (foundIssues.length === 0) {
      showToast('YouTube Compliance: Триггерных слов не обнаружено (100% Safe)', 'success');
    } else {
      showToast(
        `Обнаружено ${foundIssues.length} триггерных групп. Доступны безопасные синонимы!`,
        'info'
      );
    }
  };

  // Replace trigger word with safe synonym across source & generated script
  const applySafeSynonym = (issueWord: string, replacement: string) => {
    const words = issueWord.split(',').map(w => w.trim()).filter(Boolean);
    let updatedSource = sourceText;
    let updatedHook = generatedHook15s;
    let updatedScript = generatedScript;

    words.forEach(w => {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      updatedSource = updatedSource.replace(regex, replacement);
      updatedHook = updatedHook.replace(regex, replacement);
      updatedScript = updatedScript.replace(regex, replacement);
    });

    setSourceText(updatedSource);
    setGeneratedHook15s(updatedHook);
    setGeneratedScript(updatedScript);
    setComplianceReport(prev =>
      prev
        ? {
            ...prev,
            issues: prev.issues.filter(i => i.word !== issueWord),
            score: Math.min(100, prev.score + 18)
          }
        : null
    );
    showToast(`Заменено на безопасный синоним: «${replacement}»`, 'success');
  };

  // Copy all generated content
  const handleCopyAllVerbaFlow = () => {
    const packBlock =
      generatedHookPack.length > 0
        ? `=== ПАК ИЗ 5 ХУКОВ (15 СЕК) ===\n${generatedHookPack.join('\n')}\n\n`
        : '';
    const fullOutput = `${generatedHook15s}\n\n${packBlock}${generatedScript}`.trim();
    if (!fullOutput) {
      showToast('Сначала сгенерируйте сценарий!', 'error');
      return;
    }
    navigator.clipboard.writeText(fullOutput);
    setCopiedAll(true);
    showToast('Полный сценарий и 15-сек хук скопированы в буфер обмена!', 'success');
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Transfer generated script to Combine Montage Studio
  const handleTransferToCombine = () => {
    const fullOutput = `${generatedHook15s}\n\n${generatedScript}`.trim();
    if (!fullOutput) {
      showToast('Сначала сгенерируйте сценарий для трансфера!', 'error');
      return;
    }

    // Split script into visual scene blocks for the timeline
    const paragraphs = generatedScript
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean);

    const scriptScenes: SceneItem[] = [
      {
        id: 'hook-scene-' + Date.now(),
        name: '01_HOOK_15SEC.mp4',
        url: '',
        type: 'script_block',
        duration: 15,
        subtitle: generatedHook15s.slice(0, 90) + '...'
      },
      ...paragraphs.map((p, idx) => ({
        id: `scene-block-${idx}-${Date.now()}`,
        name: `0${idx + 2}_SCENE_BLOCK.mp4`,
        url: '',
        type: 'script_block' as const,
        duration: 12,
        subtitle: p.replace(/^===.*===\n?/, '').slice(0, 90) + '...'
      }))
    ];

    setScenes(prev => [...prev, ...scriptScenes]);
    setTransferredScript(fullOutput);
    setActiveTab('combine');
    showToast(
      `Сценарий перенесен в сборочный цех (${scriptScenes.length} сценарных блоков добавлено в ленту)!`,
      'success'
    );
  };

  const isGhConnected = Boolean(ghToken && ghRepo);
  const isGdriveConfigured = Boolean(gdriveFolderId);
  const estimatedGb = estimateLoopSizeGb();

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-amber-500/30 bg-[#0b0f17] text-[#e2e8f0]">
      {/* ШАПКА ПРИЛОЖЕНИЯ (Header & Navbar с цветными акцентными иконками) */}
      <header className="bg-[#090d16]/95 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 shadow-lg shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
            <Layers className="w-6 h-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-slate-100 flex items-center gap-2">
              AETHER<span className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]">COMBINE</span>
              <span className="text-[10px] bg-amber-500/15 border border-amber-400/40 text-amber-300 font-semibold px-2 py-0.5 rounded shadow-sm shadow-amber-500/10">
                PRO 4K • ARGON
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Автономный облачный видеокомбайн &amp; универсальный парсер N-слотов (GitHub Actions → Google Drive)
            </p>
          </div>
        </div>

        {/* Верхнее навигационное меню с цветными акцентами */}
        <nav className="flex flex-wrap items-center gap-1 bg-[#0f172a] p-1.5 rounded-xl border border-slate-800/90 shadow-inner">
          {/* 1. Повествовательный монтаж (8–16 мин / 100+ сцен): кинематографичный фиолетово-синий акцент (#818cf8 / text-indigo-400) */}
          <button
            onClick={() => setActiveTab('combine')}
            id="tab-combine"
            className={`group tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'combine'
                ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/50 shadow-[0_0_15px_rgba(129,140,248,0.28)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
            }`}
          >
            <Clapperboard
              className={`w-4 h-4 text-indigo-400 transition-transform duration-200 group-hover:scale-110 ${
                activeTab === 'combine'
                  ? 'drop-shadow-[0_0_8px_rgba(129,140,248,0.85)]'
                  : 'drop-shadow-[0_0_4px_rgba(129,140,248,0.45)]'
              }`}
            />
            <span>Повествовательный монтаж (8–16 мин / 100+ сцен)</span>
          </button>

          {/* 2. Многочасовой Луп (N-Слотов): яркий янтарно-оранжевый (#fbbf24 / text-amber-400 с эффектом свечения) */}
          <button
            onClick={() => setActiveTab('loop')}
            id="tab-loop"
            className={`group tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'loop'
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/60 shadow-[0_0_18px_rgba(251,191,36,0.35)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
            }`}
          >
            <Repeat
              className={`w-4 h-4 text-amber-400 transition-transform duration-200 group-hover:scale-110 ${
                activeTab === 'loop'
                  ? 'drop-shadow-[0_0_10px_rgba(251,191,36,0.95)]'
                  : 'drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]'
              }`}
            />
            <span>Многочасовой Луп (N-Слотов)</span>
          </button>

          {/* 3. Студия 4K Превью: неоновый изумрудно-бирюзовый (#34d399 / text-emerald-400) */}
          <button
            onClick={() => setActiveTab('thumb')}
            id="tab-thumb"
            className={`group tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'thumb'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
            }`}
          >
            <ImageIcon
              className={`w-4 h-4 text-emerald-400 transition-transform duration-200 group-hover:scale-110 ${
                activeTab === 'thumb'
                  ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                  : 'drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]'
              }`}
            />
            <span>Студия 4K Превью</span>
          </button>

          {/* 4. Вирусный Текст & Хуки: яркий электрический жёлтый / молния (#fde047 / text-yellow-300) */}
          <button
            onClick={() => setActiveTab('hooks')}
            id="tab-hooks"
            className={`group tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'hooks'
                ? 'bg-yellow-400/20 text-yellow-100 border border-yellow-300/60 shadow-[0_0_16px_rgba(253,224,71,0.32)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
            }`}
          >
            <Zap
              className={`w-4 h-4 text-yellow-300 fill-yellow-300/25 transition-transform duration-200 group-hover:scale-110 ${
                activeTab === 'hooks'
                  ? 'drop-shadow-[0_0_9px_rgba(253,224,71,0.95)]'
                  : 'drop-shadow-[0_0_5px_rgba(253,224,71,0.55)]'
              }`}
            />
            <span>Вирусный Текст &amp; Хуки</span>
          </button>
        </nav>

        {/* Информационная строка статуса GitHub («ZermeXX/aetherflow-render») и «GDrive Ready» */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={openConfigModal}
            className="group flex items-center gap-2.5 bg-[#0f172a] hover:bg-slate-800/90 border border-slate-700/90 hover:border-purple-400/50 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-200 transition-all duration-200 cursor-pointer shadow-md"
          >
            <span className="relative flex items-center justify-center w-5 h-5 rounded-md bg-gradient-to-br from-amber-400/20 via-orange-500/20 to-purple-500/25 border border-amber-400/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]">
              <Github className="w-3.5 h-3.5 text-amber-400 group-hover:text-purple-300 transition-colors drop-shadow-[0_0_6px_rgba(251,191,36,0.75)]" />
            </span>
            <span
              id="gh-status-indicator"
              className={`w-2 h-2 rounded-full ${
                isGhConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
              }`}
            />
            <span
              id="gh-status-text"
              className="font-mono text-[11px] bg-gradient-to-r from-amber-300 via-orange-200 to-purple-300 bg-clip-text text-transparent font-semibold"
            >
              {ghRepo || 'ZermeXX/aetherflow-render'}
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <HardDrive
                className={`w-4 h-4 ${
                  isGdriveConfigured
                    ? 'text-emerald-400 drop-shadow-[0_0_7px_rgba(52,211,153,0.8)]'
                    : 'text-emerald-400/75 drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]'
                }`}
              />
              <span className="text-[11px] font-semibold text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.35)]">
                GDrive Ready
              </span>
            </span>
          </button>
        </div>
      </header>

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* =========================================
            ЦЕХ 1: КОМБАЙН МОНТАЖА (60+ СЦЕН) — ПОВЕСТВОВАТЕЛЬНЫЙ ТАЙМЛАЙН & МАСТЕР-АУДИО
           ========================================= */}
        <section
          id="view-combine"
          className={`studio-view space-y-6 ${activeTab === 'combine' ? '' : 'hidden'}`}
        >
          <MontageCombineView
            ghToken={ghToken}
            ghRepo={ghRepo}
            ghBranch={ghBranch}
            gdriveFolderId={gdriveFolderId}
            onGdriveFolderIdChange={newFolder => {
              setGdriveFolderId(newFolder);
              localStorage.setItem('ac_gdrive_folder_id', newFolder);
            }}
            driveUser={driveUser}
            driveToken={driveToken}
            onDriveAuthChange={(u, t) => {
              setDriveUser(u);
              setDriveToken(t);
            }}
            transferredScript={transferredScript}
            onClearTransferredScript={() => setTransferredScript('')}
            onOpenConfigModal={openConfigModal}
            onStartRenderStatus={showStatusBar}
            onNotify={showToast}
            encodeManifestBase64={encodeManifestBase64}
            terminalStatus={terminalRunnerStatus}
            terminalSeconds={renderStatus.seconds}
            terminalLogs={terminalLogs}
            terminalRunUrl={renderStatus.runUrl}
            onClearTerminalLogs={clearTerminalLogs}
          />
        </section>

        {/* =========================================
            ЦЕХ 2: СБОРЩИК ПО СПЕЦИФИКАЦИИ «МЕТЕЛЬ: 3:00:00» (H.265 24FPS • АСИММЕТРИЧНЫЕ INSERTS[] • LOUDNORM -16 LUFS)
           ========================================= */}
        <section
          id="view-loop"
          className={`studio-view space-y-6 ${activeTab === 'loop' ? '' : 'hidden'}`}
        >
          <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Repeat className="text-amber-500 w-5 h-5" /> Цех многочасовых лупов — Спецификация «Метель: 3:00:00» (Omni 1.2 Flash)
                </h2>
                <p className="text-xs text-slate-400">
                  Экспорт <code className="text-amber-400">{videoCodec}</code> {videoFps} fps • AAC {audioBitrateKbps} kbps • Стыки актов 90с (0:30, 1:00, 1:40, 2:00, 2:40) • Петли 10с (шов {internalLoopCrossfadeSec.toFixed(1)}с) • Асимметричные <code className="text-emerald-400">inserts[]</code> (E1, E2, E3) • <code className="text-sky-400">loudnorm=I={audioMastering.integrated_lufs}:TP={audioMastering.true_peak_dbtp}:LRA={audioMastering.lra}</code>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] bg-sky-500/10 border border-sky-500/30 text-sky-300 px-3 py-1 rounded-lg font-semibold font-mono">
                  {videoCodec === 'libx265' ? 'H.265 (libx265)' : 'H.264'} • {videoFps}fps • AAC {audioBitrateKbps}k
                </span>
                <span className="text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1 rounded-lg font-semibold">
                  Актов: {timelineSlots.length} • Вставок: {totalInsertsCount} • Чистый хронометраж: {calculatedProjectDurationSec}s (3:00:00)
                </span>
                <span className="text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-lg font-semibold">
                  Direct GDrive Stream
                </span>
              </div>
            </div>

            {/* МОДУЛЬ ИМПОРТА И ЭКСПОРТА JSON-МАНИФЕСТА + ЭТАЛОН «МЕТЕЛЬ: 3:00:00» */}
            <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-amber-500" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      JSON-манифест сборки &amp; Профиль «Метель: 3:00:00» (Универсальный парсер N-Слотов)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Парсит любое число слотов <code className="text-amber-300">timeline_slots</code> (1–50+), кривые <code className="text-amber-300">transition_in / transition_out</code> и мастеринг <code className="text-emerald-300">audio_mastering</code>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={manifestInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleImportManifestFile}
                  />
                  <button
                    type="button"
                    onClick={applyBlizzard3HSpecPreset}
                    className="bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 font-bold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/10"
                  >
                    ❄️ [ Спецификация «Метель: 3:00:00» ]
                  </button>
                  <button
                    type="button"
                    onClick={() => manifestInputRef.current?.click()}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10"
                  >
                    <FolderUp className="w-3.5 h-3.5" /> [ 📄 Импортировать JSON-рецепт сборки ]
                  </button>
                  <button
                    type="button"
                    onClick={handleExportManifestFile}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" /> [ 💾 Экспортировать в JSON ]
                  </button>
                  <button
                    type="button"
                    onClick={() => generateNSlotsPreset(10)}
                    className="bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-300 px-3 py-2 rounded-xl text-[11px] font-medium transition cursor-pointer"
                    title="Сгенерировать 10 слотов с динамическими массивами inserts: []"
                  >
                    Пресет 10 слотов (N-сцен)
                  </button>
                </div>
              </div>

              {/* Сводка ключевых точек спецификации «Метель: 3:00:00» */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-[11px]">
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2">
                  <span className="text-amber-400 font-bold block">1. Кодек H.265 &amp; Стыки актов (90 сек):</span>
                  <span className="text-slate-300">
                    <code>libx265</code> 24 fps, AAC 320 kbps (Omni 1.2 Flash). Переходы между актами (0:30, 1:00, 1:40, 2:00, 2:40) — crossfade 90с; внутри слота — петля 10с со швом 1.0с.
                  </span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2">
                  <span className="text-emerald-400 font-bold block">2. Асимметричные вставки E1 / E2 / E3:</span>
                  <span className="text-slate-300">
                    <strong>E1</strong> (1:02 / 3720с): in 1.5с / out 1.5с • <strong>E2</strong> (1:50 / 6600с): in 1.5с / out 3.0с • <strong>E3</strong> (2:56 / 10560с): in 1.5с, <u>БЕЗ fade out</u> + опц. 2с черный экран.
                  </span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2">
                  <span className="text-sky-400 font-bold block">3. Мастеринг звука и лимитер E3:</span>
                  <span className="text-slate-300">
                    Фильтр <code>loudnorm=I=-16:TP=-3:LRA=11</code> (-18..-14 LUFS, TP &le; -3 dBTP). Треск E3: мягкая атака (soft attack) с пиком не выше <strong>+6 дБ</strong> поверх фона.
                  </span>
                </div>
              </div>

              {/* Подсветка ожидаемого файла из манифеста (video_filename) */}
              {expectedVideoFilename && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-xs ${
                    isAssetMatched(expectedVideoFilename)
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {isAssetMatched(expectedVideoFilename) ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span>
                      {isAssetMatched(expectedVideoFilename)
                        ? `Файл манифеста подтвержден: ${expectedVideoFilename} загружен в зону дропа`
                        : `«Ожидается файл: ${expectedVideoFilename} — загрузите его в зону дропа»`}
                    </span>
                  </div>
                  {importedManifestName && (
                    <span className="text-[10px] font-mono bg-slate-900/90 px-2 py-0.5 rounded border border-slate-700 text-slate-400">
                      Манифест: {importedManifestName}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ЕДИНЫЙ РАБОЧИЙ БЛОК ЗАГРУЗКИ ВИДЕО В GOOGLE DRIVE + АВТОЗАПОЛНЕНИЕ СЛОТОВ ТАЙМЛАЙНА */}
            <GoogleDriveDirectUploader
              targetFolderId={gdriveFolderId}
              onTargetFolderIdChange={newFolder => {
                setGdriveFolderId(newFolder);
                localStorage.setItem('ac_gdrive_folder_id', newFolder);
              }}
              driveUser={driveUser}
              driveToken={driveToken}
              onAuthChange={(u, t) => {
                setDriveUser(u);
                setDriveToken(t);
              }}
              onFilesSelected={handleLoopFilesSelected}
              onNotify={showToast}
              accentColor="amber"
              title="1. Единая зона загрузки исходных видеоклипов в Google Drive (Resumable Upload)"
              subtitle="Перетащите исходные видеоклипы сюда или выберите файлы — их имена сразу заполнят слоты таймлайна, а сами файлы физически выгрузятся в папку Google Drive с прогресс-барами (0–100%)"
            />

            {/* 2. КОМПАКТНАЯ ПАНЕЛЬ НАСТРОЕК ЗВУКА: НАТИВНЫЙ ЗВУК OMNI / CONTINUOUS_BED (БЕЗ ПСЕВДО-ДРОПЗОНЫ) */}
            <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Headphones className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wider block">
                      2. Нативный звук Omni / continuous_bed (Аудио-фильтр манифеста)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Управляет микшированием звуковой дорожки в <code className="text-amber-300 font-mono">filter_complex</code> (<code className="text-emerald-400 font-mono">acrossfade=d={actCrossfadeSec}</code> + <code className="text-sky-400 font-mono">loudnorm=I={audioMastering.integrated_lufs}:TP={audioMastering.true_peak_dbtp}:LRA={audioMastering.lra}</code>)
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={continuousBed.enabled}
                    onChange={e =>
                      setContinuousBed(prev => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="accent-amber-500 w-4 h-4"
                  />
                  <span>Включить непрерывную звуковую подложку (amix)</span>
                </label>
              </div>

              {continuousBed.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Имя аудиофайла подложки в Google Drive (continuous_bed.file_name):
                    </label>
                    <input
                      type="text"
                      value={continuousBed.file_name}
                      onChange={e =>
                        setContinuousBed(prev => ({ ...prev, file_name: e.target.value }))
                      }
                      placeholder="Напр.: ambient_bed.wav (оставьте пустым для нативного звука клипов)"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Вес нативного звука (veo_weight):
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      max={2.0}
                      step={0.05}
                      value={continuousBed.veo_audio_weight}
                      onChange={e =>
                        setContinuousBed(prev => ({
                          ...prev,
                          veo_audio_weight: Math.max(0.1, Number(e.target.value) || 0.85)
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Вес подложки (bed_weight):
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      max={2.0}
                      step={0.05}
                      value={continuousBed.bed_audio_weight}
                      onChange={e =>
                        setContinuousBed(prev => ({
                          ...prev,
                          bed_audio_weight: Math.max(0.1, Number(e.target.value) || 0.55)
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-sky-300 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* БЛОК ПАРАМЕТРОВ СТЫКОВ АКТОВ (90 СЕК), ШВА ПЕТЛИ (1.0 СЕК), ЧЕРНОГО ЭКРАНА (2 СЕК) И НОРМАЛИЗАЦИИ LOUDNORM */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Стыки актов 90с + Внутренний шов 10с исходника (1.0с) + Финальный черный экран 2с */}
              <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Стыки актов (90 сек) &amp; Бесшовная петля 10с исходников (1.0 сек)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Точки стыков: 0:30 • 1:00 • 1:40 • 2:00 • 2:40
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Crossfade между актами (сек):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      step={5}
                      value={actCrossfadeSec}
                      onChange={e => {
                        const val = Math.max(1, Number(e.target.value) || 90);
                        setActCrossfadeSec(val);
                        setTimelineSlots(prev =>
                          prev.map((s, idx) =>
                            idx === prev.length - 1
                              ? s
                              : {
                                  ...s,
                                  slot_transition_out: {
                                    ...s.slot_transition_out,
                                    duration_sec: val
                                  }
                                }
                          )
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-400 font-bold outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Шов петли 10с исходника (сек):
                    </label>
                    <input
                      type="number"
                      min={0.2}
                      max={4.0}
                      step={0.1}
                      value={internalLoopCrossfadeSec}
                      onChange={e => {
                        const val = Math.max(0.2, Math.min(4.0, Number(e.target.value) || 1.0));
                        setInternalLoopCrossfadeSec(val);
                        setTimelineSlots(prev =>
                          prev.map(s => ({ ...s, internal_loop_crossfade_sec: val }))
                        );
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 font-bold outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Черный экран в финале (сек):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={finalBlackScreenEnabled}
                        onChange={e => setFinalBlackScreenEnabled(e.target.checked)}
                        className="accent-amber-500 w-4 h-4"
                        title="Добавить финальный черный экран после затухания трещины"
                      />
                      <input
                        type="number"
                        min={0.5}
                        max={10}
                        step={0.5}
                        disabled={!finalBlackScreenEnabled}
                        value={finalBlackScreenSec}
                        onChange={e =>
                          setFinalBlackScreenSec(Math.max(0.5, Number(e.target.value) || 2.0))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Нормализация звука loudnorm=I=-16:TP=-3:LRA=11 и лимитер треска E3 (+6 дБ) */}
              <div className="bg-[#0b0f17] border border-sky-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                    Нормализация звука (Loudnorm) &amp; Лимитер треска E3
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-sky-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioMastering.loudnorm_enabled}
                      onChange={e =>
                        setAudioMastering(prev => ({
                          ...prev,
                          loudnorm_enabled: e.target.checked
                        }))
                      }
                      className="accent-sky-400"
                    />
                    <span className="font-mono">
                      loudnorm=I={audioMastering.integrated_lufs}:TP={audioMastering.true_peak_dbtp}:LRA={audioMastering.lra}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Target LUFS (-18..-14):
                    </label>
                    <input
                      type="number"
                      min={-18}
                      max={-14}
                      step={0.5}
                      value={audioMastering.integrated_lufs}
                      onChange={e =>
                        setAudioMastering(prev => ({
                          ...prev,
                          integrated_lufs: Math.max(-18, Math.min(-14, Number(e.target.value) || -16))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-sky-300 font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      True-Peak (&le; -3 dBTP):
                    </label>
                    <input
                      type="number"
                      min={-9}
                      max={-3}
                      step={0.5}
                      value={audioMastering.true_peak_dbtp}
                      onChange={e =>
                        setAudioMastering(prev => ({
                          ...prev,
                          true_peak_dbtp: Math.min(-3, Number(e.target.value) || -3)
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-sky-300 font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      LRA (Loudness Range):
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={20}
                      step={1}
                      value={audioMastering.lra}
                      onChange={e =>
                        setAudioMastering(prev => ({
                          ...prev,
                          lra: Math.max(5, Math.min(20, Number(e.target.value) || 11))
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">
                      Пик E3 над фоном (дБ):
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={audioMastering.e3_soft_attack_compressor}
                        onChange={e =>
                          setAudioMastering(prev => ({
                            ...prev,
                            e3_soft_attack_compressor: e.target.checked
                          }))
                        }
                        className="accent-emerald-500"
                        title="Мягкая компрессия по атаке (soft attack) для треска E3"
                      />
                      <input
                        type="number"
                        min={1}
                        max={6}
                        step={0.5}
                        value={audioMastering.e3_max_peak_over_bed_db}
                        onChange={e =>
                          setAudioMastering(prev => ({
                            ...prev,
                            e3_max_peak_over_bed_db: Math.min(6, Math.max(1, Number(e.target.value) || 6))
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-emerald-400 font-bold outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* КОНСТРУКТОР АКТОВ И СЛОТОВ (TIMELINE_SLOTS: 1..50+ СЦЕН) И АСИММЕТРИЧНЫХ ВСТАВОК (INSERTS: []) */}
            <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-amber-500" /> Архитектура таймлайна: Слоты актов (<code className="text-amber-400">timeline_slots: [{timelineSlots.length}]</code>) &amp; Асимметричные вставки <code className="text-emerald-400">inserts: []</code>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Сумма <code className="text-slate-300">slot_duration_sec</code> за вычетом 5 кроссфейдов по {actCrossfadeSec}с ={' '}
                    <strong className="text-amber-400">{calculatedProjectDurationSec} сек</strong> (
                    {(calculatedProjectDurationSec / 3600).toFixed(2)} ч / 3:00:00)
                    {finalBlackScreenEnabled ? ` + ${finalBlackScreenSec.toFixed(1)}с черный экран в финале` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={addTimelineSlot}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    + Добавить слот (#{timelineSlots.length + 1})
                  </button>
                  <button
                    type="button"
                    onClick={applyBlizzard3HSpecPreset}
                    className="bg-slate-900 hover:bg-slate-800 border border-sky-500/40 text-sky-300 px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Сбросить к «Метель: 3:00:00» (6 актов)
                  </button>
                </div>
              </div>

              {/* Список слотов (1..N) */}
              <div className="space-y-4 max-h-[580px] overflow-y-auto custom-scroll pr-1">
                {timelineSlots.map((slot, sIdx) => {
                  const isLastSlot = sIdx === timelineSlots.length - 1;
                  const slotMatched = isAssetMatched(slot.file_name, slot.asset_id);
                  const seamSec = slot.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec;
                  const effStep = Math.max(1, slot.source_clip_duration_sec - seamSec);
                  const loopIterations = Math.max(1, Math.ceil(slot.slot_duration_sec / effStep));

                  return (
                    <div
                      key={slot.slot_id + '-' + sIdx}
                      className="bg-[#111622] border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-3"
                    >
                      {/* Заголовок слота и основные параметры */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded">
                            #{slot.slot_index} • {slot.slot_id}
                          </span>
                          {slot.act_timecode && (
                            <span className="text-[10px] font-mono bg-sky-500/15 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded">
                              {slot.act_timecode}
                            </span>
                          )}
                          <input
                            type="text"
                            value={slot.act_title ?? slot.title}
                            placeholder="Название акта / слота"
                            onChange={e =>
                              updateTimelineSlotField(sIdx, 'title', e.target.value)
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-100 w-64 sm:w-80 outline-none focus:border-amber-500"
                          />
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              slotMatched
                                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {slotMatched
                              ? '✓ Ассет в дропзоне'
                              : slot.file_name
                              ? `Ожидается: ${slot.file_name}`
                              : 'Имя файла не задано'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-400">
                            Петля: {loopIterations}× по {slot.source_clip_duration_sec}с (шов {seamSec.toFixed(1)}с)
                          </span>
                          <button
                            type="button"
                            onClick={() => removeTimelineSlot(sIdx)}
                            className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-950/30 border border-rose-500/30 cursor-pointer"
                          >
                            Удалить слот
                          </button>
                        </div>
                      </div>

                      {/* Параметры слота: file_name, source_clip_duration_sec (10с), internal_loop_crossfade_sec (1.0с), slot_duration_sec, slot_transition_out (90с) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Базовый файл (file_name):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={slot.file_name}
                              placeholder="Из JSON или прикрепите 📎"
                              onChange={e =>
                                updateTimelineSlotField(sIdx, 'file_name', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-300 outline-none focus:border-amber-500"
                            />
                            <label
                              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 px-2 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer shrink-0"
                              title="Прикрепить локальный видеофайл к слоту"
                            >
                              📎
                              <input
                                type="file"
                                accept="video/*,image/*"
                                className="hidden"
                                onChange={e =>
                                  handleAttachSlotFile(sIdx, e.target.files?.[0] || null)
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Исходник (сек) / Шов петли (сек):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={2}
                              max={600}
                              value={slot.source_clip_duration_sec}
                              onChange={e =>
                                updateTimelineSlotField(
                                  sIdx,
                                  'source_clip_duration_sec',
                                  Math.max(2, Number(e.target.value) || 10)
                                )
                              }
                              className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 outline-none"
                              title="Длительность исходного клипа (сек)"
                            />
                            <input
                              type="number"
                              min={0.2}
                              max={4.0}
                              step={0.1}
                              value={slot.internal_loop_crossfade_sec ?? internalLoopCrossfadeSec}
                              onChange={e =>
                                updateTimelineSlotField(
                                  sIdx,
                                  'internal_loop_crossfade_sec',
                                  Math.max(0.2, Number(e.target.value) || 1.0)
                                )
                              }
                              className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-emerald-400 outline-none"
                              title="Внутренний шов video+audio crossfade (сек)"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            ID ассета (asset_id):
                          </label>
                          <input
                            type="text"
                            value={slot.asset_id}
                            onChange={e =>
                              updateTimelineSlotField(sIdx, 'asset_id', e.target.value)
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Длительность слота (сек):
                          </label>
                          <input
                            type="number"
                            min={10}
                            step={30}
                            value={slot.slot_duration_sec}
                            onChange={e =>
                              updateTimelineSlotField(
                                sIdx,
                                'slot_duration_sec',
                                Math.max(10, Number(e.target.value) || 1800)
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-400 font-bold outline-none focus:border-amber-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-slate-400 uppercase block mb-1">
                            Стык акта (slot_transition_out):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={slot.slot_transition_out.type}
                              onChange={e => {
                                const newType = e.target.value as SlotTransitionOut['type'];
                                updateTimelineSlotField(sIdx, 'slot_transition_out', {
                                  type: newType,
                                  duration_sec:
                                    newType === 'none'
                                      ? 0
                                      : slot.slot_transition_out.duration_sec || actCrossfadeSec
                                });
                              }}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                            >
                              <option value="xfade">xfade (crossfade)</option>
                              <option value="dissolve">xfade (dissolve)</option>
                              <option value="none">none (конец акта)</option>
                            </select>
                            {slot.slot_transition_out.type !== 'none' && (
                              <input
                                type="number"
                                min={0.5}
                                max={180}
                                step={1}
                                value={slot.slot_transition_out.duration_sec}
                                onChange={e =>
                                  updateTimelineSlotField(sIdx, 'slot_transition_out', {
                                    ...slot.slot_transition_out,
                                    duration_sec: Math.max(0.5, Number(e.target.value) || 90.0)
                                  })
                                }
                                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-xs font-mono text-amber-400 text-center outline-none"
                                title="Длительность межактового crossfade (сек)"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ДИНАМИЧЕСКИЙ МАССИВ АСИММЕТРИЧНЫХ ВСТАВОК (inserts: []) ВНУТРИ СЛОТА */}
                      <div className="bg-[#0b0f17] border border-slate-800/90 rounded-xl p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-amber-400 uppercase">
                              Асимметричные вставки <code className="font-mono">inserts: [{slot.inserts.length}]</code>
                            </span>
                            {slot.inserts.length === 0 ? (
                              <span className="text-[10px] bg-slate-900 border border-slate-700 text-slate-400 px-2 py-0.5 rounded">
                                Пустой массив [] → Чистый фоновый луп 10с без оверлеев
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded">
                                Индивидуальные кривые fade_in / fade_out ({slot.inserts.map(i => i.insert_id).join(', ')})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => addInsertToSlot(sIdx)}
                              className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            >
                              + Добавить вставку E{slot.inserts.length + 1}
                            </button>
                            {slot.inserts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => clearSlotInserts(sIdx)}
                                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer"
                              >
                                Очистить (inserts: [])
                              </button>
                            )}
                          </div>
                        </div>

                        {slot.inserts.length > 0 && (
                          <div className="grid grid-cols-1 gap-2.5">
                            {slot.inserts.map((ins, insIdx) => {
                              const insMatched = isAssetMatched(ins.file_name, ins.asset_id);
                              const isNoFadeOut = Boolean(
                                ins.hold_until_end || ins.transition_out?.type === 'none'
                              );
                              return (
                                <div
                                  key={ins.insert_id + '-' + insIdx}
                                  className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2 text-[11px]"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded text-[10px]">
                                        {ins.insert_id}
                                      </span>
                                      {ins.timecode_label && (
                                        <span className="text-[10px] font-mono bg-sky-500/15 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded">
                                          {ins.timecode_label}
                                        </span>
                                      )}
                                      <span className="text-slate-400 font-mono text-[10px]">
                                        Локальный триггер: +{ins.trigger_at_sec}s • in {ins.transition_in.duration_sec}s /{' '}
                                        {isNoFadeOut
                                          ? 'БЕЗ fade out (до конца хронометража)'
                                          : `out ${ins.transition_out.duration_sec}s`}
                                      </span>
                                      {ins.audio_soft_compressor && (
                                        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                                          Soft-Attack Limiter &le; +{ins.max_peak_over_bed_db ?? 6} dB
                                        </span>
                                      )}
                                      {insMatched && (
                                        <span className="text-[9px] text-emerald-400 font-mono">
                                          ✓ Файл найден
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeInsertFromSlot(sIdx, insIdx)}
                                      className="text-rose-400 hover:text-rose-300 text-[10px] cursor-pointer"
                                    >
                                      ✕ Удалить
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                                    <div className="col-span-2">
                                      <label className="text-[9px] text-slate-500 block">
                                        Файл клипа вставки:
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={ins.file_name}
                                          placeholder="Из JSON или прикрепите 📎"
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              file_name: e.target.value
                                            })
                                          }
                                          className="w-full bg-[#0b0f17] border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 outline-none focus:border-amber-500"
                                        />
                                        <label
                                          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 px-1.5 py-1 rounded text-[10px] cursor-pointer shrink-0"
                                          title="Прикрепить локальный файл вставки"
                                        >
                                          📎
                                          <input
                                            type="file"
                                            accept="video/*,image/*"
                                            className="hidden"
                                            onChange={e =>
                                              handleAttachInsertFile(
                                                sIdx,
                                                insIdx,
                                                e.target.files?.[0] || null
                                              )
                                            }
                                          />
                                        </label>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-[9px] text-slate-500 block">
                                        trigger_at_sec (в слоте):
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        step={10}
                                        value={ins.trigger_at_sec}
                                        onChange={e =>
                                          updateSlotInsert(sIdx, insIdx, {
                                            trigger_at_sec: Math.max(
                                              0,
                                              Number(e.target.value) || 0
                                            )
                                          })
                                        }
                                        className="w-full bg-[#0b0f17] border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-amber-400 outline-none focus:border-amber-500"
                                      />
                                    </div>

                                    <div>
                                      <label className="text-[9px] text-slate-500 block">
                                        fade_in (сек / тип):
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0.1}
                                          max={10}
                                          step={0.5}
                                          value={ins.transition_in.duration_sec}
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              transition_in: {
                                                ...ins.transition_in,
                                                duration_sec: Math.max(
                                                  0.1,
                                                  Number(e.target.value) || 1.5
                                                )
                                              }
                                            })
                                          }
                                          className="w-12 bg-[#0b0f17] border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-emerald-400 outline-none"
                                        />
                                        <select
                                          value={ins.transition_in.type}
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              transition_in: {
                                                ...ins.transition_in,
                                                type: e.target.value as 'dissolve' | 'fade'
                                              }
                                            })
                                          }
                                          className="flex-1 bg-[#0b0f17] border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-200 outline-none"
                                        >
                                          <option value="dissolve">dissolve</option>
                                          <option value="fade">fade</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-[9px] text-slate-500 block">
                                        fade_out (режим / сек):
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <select
                                          value={ins.transition_out?.type || 'dissolve'}
                                          onChange={e => {
                                            const nextType = e.target.value as
                                              | 'dissolve'
                                              | 'fade'
                                              | 'none';
                                            updateSlotInsert(sIdx, insIdx, {
                                              hold_until_end: nextType === 'none',
                                              transition_out: {
                                                type: nextType,
                                                duration_sec:
                                                  nextType === 'none'
                                                    ? 0
                                                    : ins.transition_out?.duration_sec || 1.5
                                              }
                                            });
                                          }}
                                          className="flex-1 bg-[#0b0f17] border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-200 outline-none"
                                        >
                                          <option value="dissolve">dissolve</option>
                                          <option value="fade">fade</option>
                                          <option value="none">БЕЗ fade out</option>
                                        </select>
                                        {ins.transition_out?.type !== 'none' && (
                                          <input
                                            type="number"
                                            min={0.1}
                                            max={15}
                                            step={0.5}
                                            value={ins.transition_out?.duration_sec ?? 1.5}
                                            onChange={e =>
                                              updateSlotInsert(sIdx, insIdx, {
                                                hold_until_end: false,
                                                transition_out: {
                                                  type: ins.transition_out?.type || 'dissolve',
                                                  duration_sec: Math.max(
                                                    0.1,
                                                    Number(e.target.value) || 1.5
                                                  )
                                                }
                                              })
                                            }
                                            className="w-12 bg-[#0b0f17] border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-amber-400 outline-none"
                                          />
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex flex-col justify-end">
                                      <label className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer py-1">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(ins.audio_soft_compressor)}
                                          onChange={e =>
                                            updateSlotInsert(sIdx, insIdx, {
                                              audio_soft_compressor: e.target.checked,
                                              max_peak_over_bed_db: 6
                                            })
                                          }
                                          className="accent-emerald-500"
                                        />
                                        <span>Soft-Attack +6dB</span>
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {isLastSlot && slot.slot_transition_out.type === 'none' && (
                        <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Финальный акт имеет{' '}
                          <code>slot_transition_out.type === &quot;none&quot;</code> — вставка E3 держится без fade_out до конца хронометража
                          {finalBlackScreenEnabled
                            ? `, затем затухает в ${finalBlackScreenSec.toFixed(1)}-секундный черный экран.`
                            : '.'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. ПРЕСЕТЫ ДЛИТЕЛЬНОСТИ (СТРОГО 3-10 ЧАСОВ) + ПОЛЕ ТОЧНОГО ВВОДА */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase">
                  3. Быстрая синхронизация длительности проекта по слотам (от 3 до 10 часов)
                </label>
                <span className="text-xs text-amber-400 font-mono">
                  Расчетная сумма слотов с вычетом переходов: {calculatedProjectDurationSec} сек
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                {[
                  { hours: 3, label: '3 Часа (Метель 3:00:00)' },
                  { hours: 5, label: '5 Часов' },
                  { hours: 8, label: '8 Часов' },
                  { hours: 10, label: '10 Часов' }
                ].map(item => (
                  <button
                    key={item.hours}
                    onClick={() =>
                      item.hours === 3 ? applyBlizzard3HSpecPreset() : syncSlotsToTargetHours(item.hours)
                    }
                    className={`loop-h-btn py-3.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      loopHours === item.hours
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-lg shadow-amber-500/10'
                        : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-amber-500/60'
                    }`}
                  >
                    [ {item.label} ]
                  </button>
                ))}

                {/* Поле точного ввода часов (от 3 до 10) */}
                <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">Точно (3–10ч):</span>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    step={1}
                    value={loopHours}
                    onChange={e => handleExactLoopHoursChange(e.target.value)}
                    className="w-16 bg-[#0b0f17] border border-amber-500/40 rounded-lg px-2 py-1 text-center text-xs font-bold text-amber-400 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* 4. АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ FFmpeg FILTER_COMPLEX (ЖИВОЙ ГРАФ «МЕТЕЛЬ: 3:00:00») */}
            <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    4. Граф FFmpeg <code className="text-amber-400">filter_complex</code> ({videoCodec} {videoFps}fps • AAC {audioBitrateKbps}k • loudnorm I={audioMastering.integrated_lufs})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${ffmpegPreview.filterLines.join(';\n')}\n# Кодек: ${ffmpegPreview.encodingFlags}`
                      );
                      showToast('Граф FFmpeg filter_complex скопирован в буфер обмена!', 'success');
                    }}
                    className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Копировать filter_complex
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFilterComplexPreview(prev => !prev)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showFilterComplexPreview ? 'Свернуть' : 'Развернуть'}
                  </button>
                </div>
              </div>

              {showFilterComplexPreview && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400">
                    Входные потоки (<code className="text-amber-300">{ffmpegPreview.inputsArgs.length} входов</code>): 10-сек петли со швом {internalLoopCrossfadeSec.toFixed(1)}с + асимметричные вставки E1/E2/E3 + 90с кроссфейды актов + <code className="text-sky-300">loudnorm</code>:
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-mono text-emerald-300/90 overflow-x-auto max-h-60 custom-scroll leading-relaxed">
                    {`# Входы FFmpeg:\n${ffmpegPreview.inputsArgs.join(' \\\n  ')}\n\n# filter_complex:\n${ffmpegPreview.filterLines.join(';\n')}\n\n# Кодирование и маппинг:\n-map "[${ffmpegPreview.finalVideoMap}]" -map "[${ffmpegPreview.finalAudioMap}]" ${ffmpegPreview.encodingFlags} -t ${calculatedProjectDurationSec + (finalBlackScreenEnabled ? finalBlackScreenSec : 0)}`}
                  </pre>
                </div>
              )}
            </div>

            {/* 5. ПАРАМЕТРЫ КОДИРОВАНИЯ H.265 24FPS AAC 320K + КАЛЬКУЛЯТОР И GOOGLE DRIVE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
              <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-500" /> 5. Параметры кодирования и кодек H.265
                  </span>
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                    {videoCodec} • {videoFps}fps • AAC {audioBitrateKbps}k • CRF {getCrfValue(bitratePreset)}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Кодек, FPS и Битрейт аудио */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Видеокодек:
                      </label>
                      <select
                        value={videoCodec}
                        onChange={e => setVideoCodec(e.target.value as 'libx265' | 'libx264')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-amber-300 font-mono outline-none focus:border-amber-500"
                      >
                        <option value="libx265">H.265 (libx265 • HEVC)</option>
                        <option value="libx264">H.264 (libx264 • AVC)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Частота кадров (FPS):
                      </label>
                      <select
                        value={videoFps}
                        onChange={e => setVideoFps(Number(e.target.value) as 24 | 30 | 60)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-200 font-mono outline-none focus:border-amber-500"
                      >
                        <option value={24}>24 fps (Киностандарт)</option>
                        <option value={30}>30 fps</option>
                        <option value={60}>60 fps</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Аудио (Omni 1.2 Flash):
                      </label>
                      <select
                        value={audioBitrateKbps}
                        onChange={e =>
                          setAudioBitrateKbps(Number(e.target.value) as 320 | 256 | 192)
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-emerald-300 font-mono outline-none focus:border-amber-500"
                      >
                        <option value={320}>AAC 320 kbps (Master)</option>
                        <option value={256}>AAC 256 kbps</option>
                        <option value={192}>AAC 192 kbps</option>
                      </select>
                    </div>
                  </div>

                  {/* Выпадающий список разрешения */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1">
                      Выпадающий список разрешения:
                    </label>
                    <select
                      value={loopResolution}
                      onChange={e =>
                        setLoopResolution(e.target.value as '1080p' | '2k' | '4k')
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    >
                      <option value="1080p">
                        [ 1080p Full HD (1920x1080) ] — быстрый рендер, меньший объем диска
                      </option>
                      <option value="2k">
                        [ 2K Quad HD (2560x1440) ] — компромисс для стабильного битрейта YouTube
                      </option>
                      <option value="4k">
                        [ 4K Ultra HD (3840x2160) ] — максимальная четкость и кинематографичный апскейл
                      </option>
                    </select>
                  </div>

                  {/* Управление битрейтом и сжатием */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1">
                      Селектор пресетов битрейта и сжатия:
                    </label>
                    <select
                      value={bitratePreset}
                      onChange={e =>
                        setBitratePreset(e.target.value as 'standard' | 'cinema' | 'eco')
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    >
                      <option value="standard">
                        «YouTube Standard» (CRF 23, ~12–18 Mbps для 4K) — оптимальный баланс качества и скорости
                      </option>
                      <option value="cinema">
                        «Master Cinema Pro» (CRF 18, ~35–50 Mbps для 4K) — кристальное студийное качество
                      </option>
                      <option value="eco">
                        «Эконом» (CRF 26, ~8–10 Mbps) — для быстрой выгрузки на диск при слабом канале
                      </option>
                    </select>
                  </div>
                </div>

                {/* ДИНАМИЧЕСКИЙ КАЛЬКУЛЯТОР ИТОГОВОГО ВЕСА */}
                <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-slate-900 border border-amber-500/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-amber-400 block">
                      Динамический калькулятор итогового веса ({videoCodec.toUpperCase()} {videoFps}fps):
                    </span>
                    <span className="text-sm font-bold text-slate-100">
                      «{getResolutionLabel(loopResolution)} • {getPresetShortLabel(bitratePreset)} •{' '}
                      {loopHours} {loopHours >= 5 ? 'часов' : 'часа'} ~ {estimatedGb} ГБ»
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-amber-300 bg-slate-950/80 px-2.5 py-1 rounded border border-amber-500/30">
                    CRF {getCrfValue(bitratePreset)} • AAC {audioBitrateKbps}k
                  </span>
                </div>

                {/* Быстрое поле ID папки Google Drive прямо в цехе */}
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                      <CloudUpload className="w-3.5 h-3.5" /> Целевая папка Google Drive (GDRIVE_FOLDER_ID):
                    </label>
                    <button
                      onClick={openConfigModal}
                      className="text-[11px] text-slate-400 hover:text-amber-400 underline cursor-pointer"
                    >
                      Настроить Service Account JSON
                    </button>
                  </div>
                  <input
                    type="text"
                    value={gdriveFolderId}
                    onChange={e => {
                      setGdriveFolderId(e.target.value);
                      localStorage.setItem('ac_gdrive_folder_id', e.target.value);
                    }}
                    placeholder="Напр.: 1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Правая карточка: Сводка сценария и кнопка запуска облачной сборки */}
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                      Двухрежимная передача в GitHub Actions (manifest_payload Base64)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      При нажатии <strong>«🚀 Запустить облачную сборку»</strong> весь манифест (<code className="font-mono text-amber-300">{videoCodec} {videoFps}fps</code>, слоты <code className="font-mono text-amber-300">timeline_slots[]</code>, асимметричные <code className="font-mono text-amber-300">inserts[]</code>, <code className="font-mono text-sky-300">loudnorm</code>) кодируется в UTF-8 Base64 и передается в облачный раннер FFmpeg, а ход выполнения отображается в студийном терминале ниже.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-500/20 text-[11px] text-slate-400">
                  <span>
                    Актов: <code className="text-amber-400">{timelineSlots.length}</code>, Вставок:{' '}
                    <code className="text-emerald-400">{totalInsertsCount}</code> | Хронометраж:{' '}
                    <code className="text-sky-300">{formatTime(calculatedProjectDurationSec)}</code>
                  </span>
                  <button
                    onClick={() => {
                      openConfigModal();
                      setShowYamlPreview(true);
                    }}
                    className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    Код Python + FFmpeg YAML →
                  </button>
                </div>

                <div className="pt-2 border-t border-amber-500/20 flex flex-col gap-2">
                  <button
                    onClick={startLoopRender}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-amber-500/20 transition cursor-pointer text-xs"
                  >
                    <InfinityIcon className="w-4 h-4" />{' '}
                    {`🚀 Запустить облачную сборку (${videoCodec.toUpperCase()} ${videoFps}fps • ${getResolutionLabel(
                      loopResolution
                    )} ~ ${estimatedGb} ГБ)`}
                  </button>
                </div>
              </div>
            </div>

            {/* СТУДИЙНЫЙ ПСЕВДОТЕРМИНАЛ В РЕАЛЬНОМ ВРЕМЕНИ (на месте бывшего блока JSON-манифеста) */}
            <LiveTerminal
              status={terminalRunnerStatus}
              elapsedSeconds={renderStatus.seconds}
              logs={terminalLogs}
              runUrl={renderStatus.runUrl}
              onClearLogs={clearTerminalLogs}
              onCopyLogs={() => showToast('Лог терминала скопирован в буфер обмена', 'info')}
            />
          </div>
        </section>

        {/* =========================================
            ЦЕХ 3: СТУДИЯ 4K ПРЕВЬЮ
           ========================================= */}
        <section
          id="view-thumb"
          className={`studio-view space-y-6 ${activeTab === 'thumb' ? '' : 'hidden'}`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Панель управления */}
            <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
                <Sparkles className="text-amber-500 w-5 h-5" /> Настройка Обложки
              </h2>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase block">
                  Исходное изображение
                </label>
                <input
                  type="file"
                  id="thumb-image-input"
                  accept="image/*"
                  onChange={loadThumbBaseImage}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-amber-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase block">
                  Заголовок обложки (CTR Hook)
                </label>
                <textarea
                  id="thumb-title"
                  rows={2}
                  value={thumbTitle}
                  onChange={e => setThumbTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 focus:border-amber-500 outline-none"
                  placeholder="ТАЙНА РАСКРЫТА СПУСТЯ 50 ЛЕТ..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase block">
                  Стиль кинематографичного бейджа
                </label>
                <select
                  id="thumb-badge"
                  value={thumbBadge}
                  onChange={e => setThumbBadge(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="4k_gold">4K ULTRA HD • DUAL SLATE GOLD</option>
                  <option value="ambience">AMBIENCE • 60FPS CINEMATIC</option>
                  <option value="10h">10 HOURS LOOP • RELAX AUDIO</option>
                  <option value="none">Без бейджа</option>
                </select>
              </div>

              <button
                onClick={renderThumbnailCanvas}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Обновить холст
              </button>
              <button
                onClick={downloadThumbnail}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Скачать обложку (1280x720)
              </button>
            </div>

            {/* Холст предпросмотра */}
            <div className="lg:col-span-2 bg-[#111622] border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center">
              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black shadow-2xl">
                <canvas
                  ref={canvasRef}
                  id="thumb-canvas"
                  width={1280}
                  height={720}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================
            ЦЕХ 4: МОДУЛЬ УДЕРЖАНИЯ VERBAFLOW ENGINE
           ========================================= */}
        <section
          id="view-hooks"
          className={`studio-view space-y-6 ${activeTab === 'hooks' ? '' : 'hidden'}`}
        >
          <div className="bg-[#111622] border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Zap className="text-amber-500 w-5 h-5" /> 🪝 Вирусный Текст &amp; Хуки — Движок VerbaFlow
                </h2>
                <p className="text-xs text-slate-400">
                  Глубокая сценарная переработка текста, конструирование 15-секундных хуков с загадкой, петли удержания и проверка YouTube-монетизации
                </p>
              </div>
              <span className="text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-lg font-semibold">
                VERBAFLOW RETENTION ENGINE v2.4
              </span>
            </div>

            {/* 1) СЕЛЕКТОРЫ РЕЖИМА И ФОРМАТА (РАДИОКНОПКИ) */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                1. Селектор режима и формата (VerbaFlow Mode)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    id: '15sec_rewrite' as VerbaMode,
                    label: '[ 15-сек Хук с загадкой + Глубокая переделка текста ]',
                    desc: 'Выделенный интригующий старт на 15 секунд + полная структурная перезапись исходника'
                  },
                  {
                    id: 'pack5_script' as VerbaMode,
                    label: '[ Пак из 5 хуков (15 сек) + Полный сценарий ]',
                    desc: '5 вариантов первых 15 секунд под разные триггеры + раскадрованный мастер-сценарий'
                  },
                  {
                    id: 'doc_loops' as VerbaMode,
                    label: '[ Документальный сценарий с удержанием (петли интриги в каждом блоке) ]',
                    desc: 'Открытые вопросы и микро-клиффхэнгеры между главами для максимального Average View Duration'
                  },
                  {
                    id: 'shorts_1sec' as VerbaMode,
                    label: '[ Shorts / Reels (Удержание с 1-й секунды) ]',
                    desc: 'Сверхплотный темп со стоп-фразой на 1-й секунде и бесшовной закольцовкой финала'
                  }
                ].map(option => {
                  const selected = verbaMode === option.id;
                  return (
                    <label
                      key={option.id}
                      onClick={() => setVerbaMode(option.id)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                        selected
                          ? 'bg-amber-500/10 border-amber-500 text-slate-100 shadow-md shadow-amber-500/5'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="verbaflow-mode"
                        checked={selected}
                        onChange={() => setVerbaMode(option.id)}
                        className="mt-1 accent-amber-500"
                      />
                      <div>
                        <div className="text-xs font-bold text-amber-400">
                          {option.label}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {option.desc}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 2) ВЫПАДАЮЩИЕ СПИСКИ ТОЧНОЙ НАСТРОЙКИ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase block">
                  ТИП ЗАГАДКИ В НАЧАЛЕ
                </label>
                <select
                  value={mysteryType}
                  onChange={e => setMysteryType(e.target.value as MysteryType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="mystery">Тайна и необъяснимый факт</option>
                  <option value="question">Провокационный вопрос</option>
                  <option value="epicenter">Сразу в эпицентр события</option>
                  <option value="myth">Разрушение мифа</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase block">
                  ТОНАЛЬНОСТЬ (TONE OF VOICE)
                </label>
                <select
                  value={toneOfVoice}
                  onChange={e => setToneOfVoice(e.target.value as ToneOfVoice)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="doc">🎬 Документальный жанр</option>
                  <option value="storyteller">🎙️ Живой рассказчик (YouTube)</option>
                  <option value="truecrime">🕵️ Расследование / Тру-крайм</option>
                  <option value="scipop">🧠 Научпоп / Аналитика</option>
                  <option value="dynamic">🔥 Динамичный / Энергичный</option>
                  <option value="neutral">⚖️ Нейтральный / Строгий</option>
                </select>
              </div>
            </div>

            {/* 3) РАБОЧАЯ ЗОНА ТЕКСТА — КНОПКИ ДЕЙСТВИЯ */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={runVerbaFlowRewrite}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3 rounded-xl shadow-lg shadow-amber-500/20 transition text-xs flex items-center gap-2 cursor-pointer"
              >
                <Wand2 className="w-4 h-4" /> [ ⚡ ПЕРЕДЕЛАТЬ ТЕКСТ ]
              </button>

              <button
                onClick={runYouTubeComplianceCheck}
                className="bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-400 font-bold px-5 py-3 rounded-xl transition text-xs flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" /> [ 🛡️ YouTube Compliance Check ]
              </button>
            </div>

            {/* Панель результатов YouTube Compliance Check */}
            {complianceReport && (
              <div
                className={`rounded-xl border p-4 space-y-3 ${
                  complianceReport.issues.length === 0
                    ? 'bg-emerald-950/30 border-emerald-500/40'
                    : 'bg-amber-950/20 border-amber-500/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {complianceReport.issues.length === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-xs font-bold text-slate-100">
                      YouTube Monetization &amp; Ad-Safety Check: Индекс безопасности{' '}
                      <span
                        className={
                          complianceReport.score >= 85
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }
                      >
                        {complianceReport.score}/100
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => setComplianceReport(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Скрыть отчет
                  </button>
                </div>

                {complianceReport.issues.length === 0 ? (
                  <p className="text-xs text-emerald-300">
                    Триггерных слов и стоп-факторов демонетизации не найдено. Сценарий безопасен для зеленого значка монетизации YouTube.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-300">
                      Найдены слова-триггеры алгоритмов YouTube. Нажмите на безопасный синоним для мгновенной автозамены в тексте:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {complianceReport.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0b0f17] border border-slate-800 rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-400">
                              ⚠️ «{issue.word}»
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                              {issue.category}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {issue.replacements.map((rep, rIdx) => (
                              <button
                                key={rIdx}
                                onClick={() => applySafeSynonym(issue.word, rep)}
                                className="text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-2 py-1 rounded transition cursor-pointer"
                              >
                                Заменить на «{rep}»
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ДВУХКОЛОНОЧНАЯ РАБОЧАЯ ЗОНА: ИСХОДНЫЙ ТЕКСТ И ГОТОВЫЙ СЦЕНАРИЙ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Поле «Исходный текст» со счетчиком символов и слов */}
              <div className="space-y-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 uppercase">
                    Исходный текст / Черновик / Заметка
                  </label>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                    Слов: <strong className="text-amber-400">{wordCount}</strong> | Символов:{' '}
                    <strong className="text-amber-400">{charCount}</strong>
                  </span>
                </div>
                <textarea
                  rows={14}
                  value={sourceText}
                  onChange={e => setSourceText(e.target.value)}
                  placeholder="Вставьте сырой текст статьи, заметку, архивную сводку или черновик сценария (можно со словами-триггерами для проверки YouTube Compliance)..."
                  className="w-full flex-1 bg-[#0b0f17] border border-slate-800 focus:border-amber-500 rounded-xl p-4 text-xs text-slate-200 leading-relaxed outline-none custom-scroll"
                />
              </div>

              {/* Поле «Готовый сценарий» с визуально выделенной плашкой первого 15-секундного хука */}
              <div className="space-y-3 flex flex-col">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-400 uppercase">
                    Готовый сценарий с удержанием
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Формат: {verbaMode === 'shorts_1sec' ? 'Shorts 60s' : 'Retention Script'}
                  </span>
                </div>

                {/* Визуально выделенная плашка первого 15-секундного хука */}
                <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-slate-900 border-2 border-amber-500/50 rounded-xl p-4 space-y-1.5 shadow-lg shadow-amber-500/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded">
                      🔥 ПЕРВЫЕ 15 СЕКУНД (ЗОЛОТОЙ ХУК УДЕРЖАНИЯ)
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedHook15s);
                        showToast('15-секундный хук скопирован!', 'success');
                      }}
                      className="text-amber-400 hover:text-amber-300 text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> Копировать хук
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-slate-100 leading-relaxed">
                    {generatedHook15s ||
                      'Нажмите «[ ⚡ ПЕРЕДЕЛАТЬ ТЕКСТ ]» для генерации 15-секундного хука...'}
                  </p>
                </div>

                {/* Если выбран режим Пак из 5 хуков — показываем все 5 вариантов */}
                {generatedHookPack.length > 0 && (
                  <div className="bg-[#0b0f17] border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">
                      Альтернативные варианты из пака (5 хуков):
                    </span>
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scroll pr-1">
                      {generatedHookPack.map((h, i) => (
                        <div
                          key={i}
                          onClick={() => setGeneratedHook15s(h)}
                          className="text-[11px] text-slate-300 hover:text-amber-300 bg-slate-900/70 p-2 rounded border border-slate-800 cursor-pointer transition"
                        >
                          {h}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Основное поле готового сценария */}
                <textarea
                  rows={9}
                  value={generatedScript}
                  onChange={e => setGeneratedScript(e.target.value)}
                  placeholder="Здесь появится готовый переработанный сценарий с петлями интриги..."
                  className="w-full flex-1 bg-[#0b0f17] border border-slate-800 focus:border-amber-500 rounded-xl p-4 text-xs text-slate-200 leading-relaxed outline-none custom-scroll"
                />

                {/* Кнопки трансфера */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                  <button
                    onClick={handleCopyAllVerbaFlow}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
                  >
                    {copiedAll ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-amber-400" />
                    )}
                    [ 📋 Копировать всё ]
                  </button>
                  <button
                    onClick={handleTransferToCombine}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-md shadow-amber-500/10 cursor-pointer"
                  >
                    <Clapperboard className="w-4 h-4" /> [ 🎬 В сборочный цех монтажа ]
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* СТАТУС БАР ОБЛАЧНОГО РЕНДЕРА (НИЖНЯЯ ПЛАШКА С POLLING GITHUB ACTIONS) */}
        {renderStatus.visible && (
          <div
            id="render-status-bar"
            className={`bg-[#0f172a] border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl transition-all duration-300 ${
              renderStatus.status === 'success'
                ? 'border-emerald-400/60 shadow-[0_0_25px_rgba(52,211,153,0.18)]'
                : renderStatus.status === 'failure'
                ? 'border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.18)]'
                : 'border-amber-400/50 shadow-[0_0_25px_rgba(251,191,36,0.14)]'
            }`}
          >
            <div className="flex items-center gap-3.5">
              {/* Цветовой индикатор состояния: янтарно-индиговый пульс при рендере, зеленый при успехе, красный при сбое */}
              <div className="relative flex items-center justify-center w-4 h-4">
                {renderStatus.status === 'running' && (
                  <>
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-gradient-to-tr from-amber-400 to-indigo-400 shadow-[0_0_10px_#fbbf24]" />
                  </>
                )}
                {renderStatus.status === 'success' && (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
                )}
                {renderStatus.status === 'failure' && (
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 shadow-[0_0_12px_#f43f5e]" />
                )}
              </div>

              <div className="space-y-0.5">
                <p
                  className={`text-xs font-bold ${
                    renderStatus.status === 'success'
                      ? 'text-emerald-300'
                      : renderStatus.status === 'failure'
                      ? 'text-rose-300'
                      : 'text-slate-100'
                  }`}
                  id="render-status-title"
                >
                  {renderStatus.title}
                </p>
                <p
                  className={`text-xs font-medium ${
                    renderStatus.status === 'success'
                      ? 'text-emerald-400/90'
                      : renderStatus.status === 'failure'
                      ? 'text-rose-400/90'
                      : 'text-amber-300'
                  }`}
                  id="render-status-step"
                >
                  {renderStatus.stepLabel}
                </p>
                <p className="text-[11px] text-slate-400" id="render-status-desc">
                  {renderStatus.desc}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Быстрый переключатель шагов для предпросмотра/тестирования и ручного обновления */}
              {renderStatus.status === 'running' && (
                <div className="hidden xl:flex items-center gap-1 bg-[#090d16] px-2 py-1 rounded-lg border border-slate-800 text-[10px] text-slate-400">
                  <button
                    type="button"
                    onClick={() =>
                      setRenderStatus(prev => ({
                        ...prev,
                        stepLabel: 'Шаг: Скачивание клипов из Google Drive...'
                      }))
                    }
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                      renderStatus.stepLabel.includes('Скачивание')
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40'
                        : 'hover:text-slate-200'
                    }`}
                  >
                    1. Скачивание
                  </button>
                  <span>→</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRenderStatus(prev => ({
                        ...prev,
                        stepLabel: 'Шаг: Рендеринг и сборка таймлайна в FFmpeg...'
                      }))
                    }
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                      renderStatus.stepLabel.includes('FFmpeg')
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        : 'hover:text-slate-200'
                    }`}
                  >
                    2. FFmpeg
                  </button>
                  <span>→</span>
                  <button
                    type="button"
                    onClick={() =>
                      setRenderStatus(prev => ({
                        ...prev,
                        stepLabel: 'Шаг: Выгрузка готового 4K мастера в Google Drive...'
                      }))
                    }
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                      renderStatus.stepLabel.includes('Выгрузка')
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'hover:text-slate-200'
                    }`}
                  >
                    3. Выгрузка GDrive
                  </button>
                </div>
              )}

              <span
                id="render-timer"
                className={`text-xs font-mono px-3 py-1.5 rounded-lg border ${
                  renderStatus.status === 'success'
                    ? 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40'
                    : renderStatus.status === 'failure'
                    ? 'text-rose-300 bg-rose-950/40 border-rose-500/40'
                    : 'text-amber-300 bg-[#090d16] border-slate-800'
                }`}
              >
                {formatTime(renderStatus.seconds)}
              </span>

              <a
                id="gh-run-link"
                href={renderStatus.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-indigo-300 hover:text-amber-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
              >
                Смотреть лог в GitHub <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              </a>
            </div>
          </div>
        )}
      </main>

      {/* =========================================
          МОДАЛКА НАСТРОЕК GITHUB ACTIONS & GOOGLE DRIVE
         ========================================= */}
      {isConfigOpen && (
        <div
          id="gh-modal"
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-[#111622] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Github className="text-amber-500 w-5 h-5" /> Подключение GitHub Раннера &amp; Прямая выгрузка в Google Drive
              </h3>
              <button
                onClick={closeConfigModal}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Секция 1: GitHub Actions */}
              <div className="space-y-3 bg-[#0b0f17] p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                  <Github className="w-4 h-4" /> 1. Параметры GitHub Actions
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    GitHub Personal Access Token (PAT):
                  </label>
                  <input
                    type="password"
                    id="gh-token"
                    value={modalToken}
                    onChange={e => setModalToken(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    placeholder="ghp_xxxxxxxxxxxx"
                  />
                  <span className="text-[10px] text-slate-500">
                    Требуются права: `repo` и `workflow`.
                  </span>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Репозиторий (username/repo):
                  </label>
                  <input
                    type="text"
                    id="gh-repo"
                    value={modalRepo}
                    onChange={e => setModalRepo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                    placeholder="myusername/aether-render"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Ветка:</label>
                  <input
                    type="text"
                    id="gh-branch"
                    value={modalBranch}
                    onChange={e => setModalBranch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Секция 2: Интеграция Google Drive для тяжелых лупов */}
              <div className="space-y-3 bg-[#0b0f17] p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" /> 2. Выгрузка в Google Drive (Rclone)
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    GDRIVE_FOLDER_ID (ID целевой папки на Google Диске):
                  </label>
                  <input
                    type="text"
                    id="gdrive-folder-id"
                    value={modalGdriveFolderId}
                    onChange={e => setModalGdriveFolderId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-amber-500 font-mono"
                    placeholder="1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv"
                  />
                  <span className="text-[10px] text-slate-500">
                    Передается в `inputs.gdrive_folder_id` для обхода лимита 2 ГБ.
                  </span>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    GDRIVE_SA_KEY (JSON ключ Service Account / Rclone Config):
                  </label>
                  <textarea
                    id="gdrive-sa-key"
                    rows={4}
                    value={modalGdriveSaKey}
                    onChange={e => setModalGdriveSaKey(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-[11px] text-slate-200 outline-none focus:border-amber-500 font-mono custom-scroll"
                    placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
                  />
                  <span className="text-[10px] text-slate-500">
                    Сохраните этот JSON также в GitHub Secrets как `GDRIVE_SERVICE_ACCOUNT_JSON`.
                  </span>
                </div>
              </div>
            </div>

            {/* Переключатель предпросмотра YAML кода */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowYamlPreview(prev => !prev)}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  {showYamlPreview
                    ? '▼ Скрыть шаблон .github/workflows/render_loop.yml'
                    : '▶ Показать код .github/workflows/render_loop.yml (FFmpeg + Rclone Google Drive)'}
                </button>
                <button
                  onClick={copyWorkflowTemplate}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> Копировать YAML
                </button>
              </div>

              {showYamlPreview && (
                <pre className="bg-[#0b0f17] border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-56 custom-scroll">
                  {WORKFLOW_LOOP_YAML}
                </pre>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-3">
              <button
                onClick={saveGitHubConfig}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Сохранить конфигурацию
              </button>
              <button
                onClick={copyWorkflowTemplate}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-4 h-4" /> Код workflow YAML
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ВСПЛЫВАЮЩИЕ УВЕДОМЛЕНИЯ (TOASTS) */}
      {toasts.length > 0 && (
        <div className="fixed bottom-14 right-6 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-medium shadow-xl backdrop-blur-md transition ${
                t.type === 'error'
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                  : t.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                  : 'bg-[#111622]/95 border-amber-500/40 text-slate-200'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="border-t border-slate-800/60 bg-[#0b0f17] py-3 px-6 text-center text-xs text-slate-500">
        AetherCombine Studio • Автономный облачный конвейер 4K продакшна (GitHub Actions FFmpeg + Rclone Google Drive)
      </footer>
    </div>
  );
}


