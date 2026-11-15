/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // ==========================================================================
  // 1. POST /api/gemini/seo — Генерация YouTube SEO упаковки (строго US English)
  // ==========================================================================
  app.post('/api/gemini/seo', async (req, res) => {
    try {
      const { scriptText, tone, chaptersInput } = req.body as {
        scriptText?: string;
        tone?: string;
        chaptersInput?: Array<{ timecode: string; label: string }>;
      };

      const ai = getGenAIClient();
      const chapterContext = Array.isArray(chaptersInput) && chaptersInput.length > 0
        ? chaptersInput.map(c => `${c.timecode} - ${c.label}`).join('\n')
        : '00:00:00 - Act I: The Anomaly\n00:30:00 - Act II: Deepening Mystery\n01:00:00 - Act III: The Final Evidence';

      const prompt = `You are an elite YouTube SEO & Viral Packaging Strategist.
Generate a complete YouTube metadata package STRICTLY IN NATURAL US ENGLISH based on the following script/context and tone.

Tone style: ${tone || 'Dark Mystery'}
Source Script / Topic Context:
${(scriptText || 'In 1974, a classified high-altitude Alpine weather station recorded an unexplained acoustic signal before being evacuated in 24 hours.').slice(0, 3500)}

Timeline Scenes / Chapters structure:
${chapterContext}

Requirements:
1. "titles": Provide exactly 3 contrasting A/B clickable titles in US English:
   - Variant 1 (Intrigue / Mystery)
   - Variant 2 (Contradiction / Shocking Paradox)
   - Variant 3 (Cinematic Drama / High Stakes)
   CRITICAL: Every title MUST be under 60 characters (strictly <= 58 chars).
2. "description": A dense, high-converting SEO description in natural US English ( strictly 150 to 200 words) packed with high-volume search keywords.
3. "chapters": Clickable YouTube timestamps (format "00:00:00 - Title in US English") matching the provided timeline structure.
4. "tags": 30 relevant YouTube search tags as a single comma-separated string in US English, total length strictly under 490 characters.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    title: { type: Type.STRING }
                  },
                  required: ['type', 'title']
                }
              },
              description: { type: Type.STRING },
              chapters: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              tags: { type: Type.STRING }
            },
            required: ['titles', 'description', 'chapters', 'tags']
          }
        }
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ ok: true, data: parsed });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ==========================================================================
  // 2. POST /api/gemini/verbaflow — Интеллектуальный цех VerbaFlow (Рерайт, Хуки, Сцены)
  // ==========================================================================
  app.post('/api/gemini/verbaflow', async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY not configured on server; using local fallback'
        });
        return;
      }

      const { action, text, tone, mode, preserveFacts, numbersToWords, hookStyle, language } = req.body as {
        action?: 'rewrite' | 'hooks' | 'scenes';
        text?: string;
        tone?: string;
        mode?: string;
        preserveFacts?: boolean;
        numbersToWords?: boolean;
        hookStyle?: string;
        language?: 'ru' | 'en';
      };

      const targetLang = language === 'en' ? 'en' : 'ru';
      const cleanText = (text || '').trim().slice(0, 6000);
      if (!cleanText) {
        res.status(400).json({ ok: false, error: 'Empty text payload' });
        return;
      }

      const ai = getGenAIClient();

      if (action === 'rewrite') {
        const prompt =
          targetLang === 'en'
            ? `You are a veteran US documentary and YouTube script editor. Rewrite the input text into natural, compelling US English ready for voiceover.
Eliminate all AI clichés ("in today's world", "it is no secret that", "plays a crucial role", "it is worth noting", "in conclusion") and filler words ("as is well known", "basically", "at the end of the day").
Vary sentence length for high human burstiness.

Parameters:
- Tone: ${tone || 'doc'}
- Rewrite mode: ${mode || 'humanize'}
- Preserve 100% of facts (names, dates, context numbers): ${preserveFacts ? 'YES, keep every fact intact' : 'Dramatize dates if helpful'}
- Convert all numbers, years, and percentages into natural US English words (e.g. 1978 -> nineteen seventy-eight): ${numbersToWords ? 'YES, spell out every number and year' : 'NO, digits allowed'}

Source text:
${cleanText}`
            : `Ты опытный шеф-редактор документальных и YouTube-сценариев. Переработай исходный текст на естественном русском языке, полностью убирая ИИ-штампы («в современном мире», «не секрет, что», «играет ключевую роль», «стоит отметить», «важно понимать», «таким образом») и вводный балласт («на сегодняшний день», «как известно», «безусловно», «на самом деле»).
Чередуй длину предложений для высокой ритмики (Burstiness). Восстанови букву «ё».

Параметры:
- Тональность: ${tone || 'doc'}
- Режим переработки: ${mode || 'humanize'}
- Сохранить 100% фактов (имена, даты, цифры контекста): ${preserveFacts ? 'ДА, строго сохранить все факты' : 'Допускается драматизация дат'}
- Перевести все числа в слова прописью: ${numbersToWords ? 'ДА, без единой цифры' : 'НЕТ, можно оставлять числа'}

Исходный текст:
${cleanText}`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                rewrittenText: { type: Type.STRING }
              },
              required: ['rewrittenText']
            }
          }
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        res.json({ ok: true, data: parsed });
        return;
      }

      if (action === 'hooks') {
        const prompt =
          targetLang === 'en'
            ? `You are a YouTube retention scriptwriter. Based on the input text, generate STRICTLY IN NATURAL US ENGLISH:
1) A pack of 5 high-retention 12-15 second hooks following these exact archetypes: paradox, in_media_res, clue, question, contrast. No greetings or dry openings.
2) A rewritten main script body in natural US English with tone "${tone || 'doc'}" (${hookStyle || '15sec_rewrite'}), ready to attach right after the hook.

Input text:
${cleanText}`
            : `Ты сценарист удержания внимания для YouTube. На основе текста создай:
1) Пак из 5 цепляющих 12-15 секундных хуков на русском языке строго по архетипам: paradox (парадокс), in_media_res (In Media Res), clue (улика), question (вопрос), contrast (контраст). Без приветствий и скучных дат.
2) Переделанный основной сценарий в тональности "${tone || 'doc'}" (${hookStyle || '15sec_rewrite'}), готовый для присоединения к хуку.

Текст:
${cleanText}`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hooks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      archetype: { type: Type.STRING },
                      archetypeLabel: { type: Type.STRING },
                      durationSec: { type: Type.INTEGER },
                      visualCue: { type: Type.STRING },
                      hookText: { type: Type.STRING }
                    },
                    required: ['archetype', 'archetypeLabel', 'durationSec', 'visualCue', 'hookText']
                  }
                },
                rewrittenBody: { type: Type.STRING }
              },
              required: ['hooks', 'rewrittenBody']
            }
          }
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        res.json({ ok: true, data: parsed });
        return;
      }

      if (action === 'scenes') {
        const prompt = `Break the script into frame-by-frame scenes for video generation (Kling / Veo / Sora) and sound design.
Script narration language for "scriptLine": ${targetLang === 'en' ? 'Natural US English' : 'Russian'}.
Calculate each scene's "durationSec" proportional to the word count of "scriptLine" (words / 2.2 seconds, minimum 2.5 seconds).
Alternate camera movements ("cameraMove") across "zoom_in", "zoom_out", "pan_left", "pan_right" so two consecutive scenes NEVER share the same camera movement.

Tone: ${tone || 'doc'}
Script:
${cleanText}`;

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sceneIndex: { type: Type.INTEGER },
                      startTime: { type: Type.STRING },
                      timecodeRange: { type: Type.STRING },
                      durationSec: { type: Type.NUMBER },
                      cameraMove: { type: Type.STRING },
                      scriptLine: { type: Type.STRING },
                      promptEn: { type: Type.STRING },
                      promptRu: { type: Type.STRING },
                      sfx: { type: Type.STRING }
                    },
                    required: [
                      'sceneIndex',
                      'startTime',
                      'timecodeRange',
                      'durationSec',
                      'scriptLine',
                      'promptEn',
                      'promptRu',
                      'sfx'
                    ]
                  }
                }
              },
              required: ['scenes']
            }
          }
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        res.json({ ok: true, data: parsed });
        return;
      }

      res.status(400).json({ ok: false, error: 'Unsupported action' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ==========================================================================
  // 3. GET /api/proxy-image — CORS-безопасный прокси для AI Horde R2/CDN картинок
  // ==========================================================================
  app.get('/api/proxy-image', async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ ok: false, error: 'Missing url query parameter' });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).json({ ok: false, error: 'Invalid URL' });
        return;
      }

      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        res.status(400).json({ ok: false, error: 'Unsupported URL protocol' });
        return;
      }

      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        res.status(403).json({ ok: false, error: 'Blocked internal host' });
        return;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: {
          Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!upstream.ok) {
        res.status(upstream.status).json({
          ok: false,
          error: `Upstream image fetch failed (${upstream.status})`
        });
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/webp';
      if (!contentType.toLowerCase().startsWith('image/')) {
        res.status(415).json({ ok: false, error: 'Upstream response is not an image' });
        return;
      }

      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).json({ ok: false, error: msg });
    }
  });

  // ==========================================================================
  // 5. POST /api/cloudflare/flux — Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)
  // ==========================================================================
  app.post('/api/cloudflare/flux', async (req, res) => {
    try {
      const { accountId, apiToken, prompt, count } = req.body as {
        accountId?: string;
        apiToken?: string;
        prompt?: string;
        count?: number;
      };

      const cleanAccountId = (accountId || '').trim();
      const cleanApiToken = (apiToken || '').trim();
      const cleanPrompt = (prompt || '').trim();

      if (!cleanAccountId || !cleanApiToken) {
        res.status(400).json({
          ok: false,
          error: 'Укажите Cloudflare Account ID и API Token.'
        });
        return;
      }

      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(cleanAccountId)) {
        res.status(400).json({
          ok: false,
          error: 'Некорректный формат Cloudflare Account ID.'
        });
        return;
      }

      if (!cleanPrompt) {
        res.status(400).json({ ok: false, error: 'Prompt text is required' });
        return;
      }

      const requestedCount = Math.min(Math.max(Number(count) || 4, 1), 4);
      const angleCues = [
        'Wide cinematic 16:9 establishing shot, crisp foreground subject, dramatic lighting.',
        'Low-angle intense close-up focal point, rich chiaroscuro shadows, clean left negative space.',
        'Rule-of-thirds atmospheric documentary framing, volumetric mist, sharp focal silhouette.',
        'High-contrast moody backlight composition, glowing rim light, ultra-detailed texture.'
      ];

      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cleanAccountId)}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

      const images = await Promise.all(
        Array.from({ length: requestedCount }, async (_, idx) => {
          const seed = Math.floor(Math.random() * 2147483646) + 1;
          const variantPrompt = `${cleanPrompt}. ${angleCues[idx % angleCues.length]}`.slice(0, 1900);

          const cfResp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cleanApiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              prompt: variantPrompt,
              steps: 4,
              seed
            }),
            signal: AbortSignal.timeout(45000)
          });

          const ctype = (cfResp.headers.get('content-type') || '').toLowerCase();

          if (ctype.startsWith('image/')) {
            if (!cfResp.ok) {
              throw new Error(`Cloudflare API error (${cfResp.status})`);
            }
            const buf = Buffer.from(await cfResp.arrayBuffer());
            return `data:${ctype.split(';')[0]};base64,${buf.toString('base64')}`;
          }

          const json = (await cfResp.json().catch(() => ({}))) as {
            success?: boolean;
            errors?: Array<{ code?: number; message?: string }>;
            result?: { image?: string };
          };

          if (!cfResp.ok || json.success === false || !json.result?.image) {
            const cfErrMsg =
              json.errors?.[0]?.message ||
              `Cloudflare Workers AI HTTP ${cfResp.status}`;
            const err = new Error(cfErrMsg) as Error & { status?: number };
            err.status = cfResp.status;
            throw err;
          }

          const rawImg = json.result.image;
          return rawImg.startsWith('data:image/')
            ? rawImg
            : `data:image/jpeg;base64,${rawImg}`;
        })
      );

      res.json({
        ok: true,
        modelUsed: '@cf/black-forest-labs/flux-1-schnell',
        images
      });
    } catch (error) {
      const errObj = error as { status?: number };
      const msg = error instanceof Error ? error.message : String(error);
      const status =
        errObj?.status && errObj.status >= 400 && errObj.status < 600
          ? errObj.status
          : 500;
      res.status(status).json({
        ok: false,
        statusCode: status,
        error: msg
      });
    }
  });

  // ==========================================================================
  // VITE MIDDLEWARE / STATIC SERVING
  // ==========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AetherCombine Studio Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
