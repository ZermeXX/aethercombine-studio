/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
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
        model: 'gemini-3.8-flash',
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
  // 2. POST /api/gemini/script — Генерация 3-блочного сценария VerbaFlow (US English)
  // ==========================================================================
  app.post('/api/gemini/script', async (req, res) => {
    try {
      const { sourceText, mysteryType, toneOfVoice, verbaMode } = req.body as {
        sourceText?: string;
        mysteryType?: string;
        toneOfVoice?: string;
        verbaMode?: string;
      };

      const ai = getGenAIClient();
      const prompt = `You are a master YouTube retention scriptwriter. Rewrite the user's raw notes into a high-retention 3-block script STRICTLY IN NATURAL US ENGLISH.
Remove boring encyclopedia dates from the opening hook and turn dry facts into dramatic conflict.

Mystery Hook Type: ${mysteryType || 'mystery'}
Tone of Voice: ${toneOfVoice || 'doc'}
Mode: ${verbaMode || '15sec_rewrite'}
Raw Source Input:
${(sourceText || '').slice(0, 3500)}

Return JSON with:
1. "hook": [HOOK 00:00–00:15] trigger without dates + visual scene marker [Visual: ...] at the start.
2. "bridge": [THE BRIDGE / OPEN LOOP 00:15–00:45] open loop intrigue promising a climax payoff.
3. "body": [BODY SCRIPT] rhythmic short sentences (<= 10 words average) with pause markers [pause 1.5s] and vocal emphasis in *CAPS*.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hook: { type: Type.STRING },
              bridge: { type: Type.STRING },
              body: { type: Type.STRING }
            },
            required: ['hook', 'bridge', 'body']
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
  // 3. POST /api/imagen/generate — Генерация 4 вариантов 16:9 через @google/genai
  //    Основная модель: imagen-4.0-generate-001 (generateImages)
  //    Авто-fallback: gemini-2.5-flash-image (generateContent)
  // ==========================================================================
  async function generateImagen4Batch(
    promptText: string,
    sampleCount: number = 4
  ): Promise<{
    dataUrls: string[];
    predictions: Array<{ bytesBase64Encoded: string; mimeType: string }>;
    modelUsed: string;
  }> {
    const ai = getGenAIClient();
    const requestedCount = Math.min(Math.max(Number(sampleCount) || 4, 1), 4);

    try {
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: promptText,
        config: {
          numberOfImages: requestedCount,
          aspectRatio: '16:9',
          outputMimeType: 'image/jpeg'
        }
      });

      const generated = response.generatedImages ?? [];
      const validPredictions = generated
        .filter(item => Boolean(item?.image?.imageBytes))
        .map(item => ({
          bytesBase64Encoded: item.image?.imageBytes || '',
          mimeType: item.image?.mimeType || 'image/jpeg'
        }));

      if (validPredictions.length > 0) {
        const dataUrls = validPredictions.map(
          pred => `data:${pred.mimeType};base64,${pred.bytesBase64Encoded}`
        );
        return {
          dataUrls,
          predictions: validPredictions,
          modelUsed: 'imagen-4.0-generate-001'
        };
      }

      throw new Error('imagen-4.0-generate-001 returned no generatedImages.');
    } catch (primaryError) {
      console.warn(
        'imagen-4.0-generate-001 unavailable, falling back to gemini-2.5-flash-image:',
        primaryError instanceof Error ? primaryError.message : primaryError
      );

      try {
        const angleCues = [
          'Wide cinematic establishing angle, crisp foreground subject.',
          'Dramatic low-angle close-up, intense chiaroscuro lighting.',
          'Dynamic rule-of-thirds framing with atmospheric depth of field.',
          'High-contrast moody silhouette composition with vibrant rim light.'
        ];

        const fallbackResults = await Promise.all(
          Array.from({ length: requestedCount }, async (_, idx) => {
            const cue = angleCues[idx % angleCues.length];
            const res = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: `${promptText}\n\nComposition variation ${idx + 1}: ${cue}`,
              config: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                  aspectRatio: '16:9'
                }
              }
            });

            const parts = res.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                return {
                  bytesBase64Encoded: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'image/png'
                };
              }
            }
            return null;
          })
        );

        const validFallback = fallbackResults.filter(
          (item): item is { bytesBase64Encoded: string; mimeType: string } => item !== null
        );

        if (!validFallback.length) {
          const primaryMsg =
            primaryError instanceof Error ? primaryError.message : String(primaryError);
          const quotaErr = new Error(
            `Не удалось сгенерировать изображения через imagen-4.0-generate-001 и fallback gemini-2.5-flash-image: ${primaryMsg}`
          ) as Error & { status?: number };
          if (/429|RESOURCE_EXHAUSTED|limit:\s*0|quota/i.test(primaryMsg)) {
            quotaErr.status = 429;
          } else if (/403|PERMISSION_DENIED/i.test(primaryMsg)) {
            quotaErr.status = 403;
          }
          throw quotaErr;
        }

        return {
          dataUrls: validFallback.map(
            item => `data:${item.mimeType};base64,${item.bytesBase64Encoded}`
          ),
          predictions: validFallback,
          modelUsed: 'gemini-2.5-flash-image'
        };
      } catch (fallbackOrPrimaryError) {
        const errObj = fallbackOrPrimaryError as { status?: number; code?: number; message?: string };
        const msg =
          fallbackOrPrimaryError instanceof Error
            ? fallbackOrPrimaryError.message
            : String(fallbackOrPrimaryError);
        const wrapped = new Error(msg) as Error & { status?: number };
        const rawStatus = errObj?.status ?? errObj?.code;
        if (rawStatus === 429 || /429|RESOURCE_EXHAUSTED|limit:\s*0|quota/i.test(msg)) {
          wrapped.status = 429;
        } else if (rawStatus === 403 || /403|PERMISSION_DENIED/i.test(msg)) {
          wrapped.status = 403;
        }
        throw wrapped;
      }
    }
  }

  app.post('/api/imagen/generate', async (req, res) => {
    try {
      const { promptText, sampleCount } = req.body as {
        promptText?: string;
        sampleCount?: number;
      };
      if (!promptText || !promptText.trim()) {
        res.status(400).json({ ok: false, error: 'Prompt text is required' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          ok: false,
          error: 'GEMINI_API_KEY не настроен на сервере.'
        });
        return;
      }

      const { dataUrls, predictions, modelUsed } = await generateImagen4Batch(
        promptText.trim(),
        sampleCount || 4
      );

      res.json({
        ok: true,
        modelUsed,
        images: dataUrls,
        bytesBase64Encoded: predictions[0].bytesBase64Encoded,
        mimeType: predictions[0].mimeType,
        predictions
      });
    } catch (error) {
      const errObj = error as { status?: number; message?: string };
      const msg = error instanceof Error ? error.message : String(error);
      const statusCode =
        errObj?.status === 429 || /429|RESOURCE_EXHAUSTED|limit:\s*0|quota/i.test(msg)
          ? 429
          : errObj?.status === 403 || /403|PERMISSION_DENIED/i.test(msg)
            ? 403
            : 500;
      res.status(statusCode).json({
        ok: false,
        statusCode,
        quotaExhausted: statusCode === 429 || statusCode === 403,
        error: msg
      });
    }
  });

  // ==========================================================================
  // 4. GET /api/proxy-image — CORS-безопасный прокси для AI Horde R2/CDN картинок
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
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AetherCombine Studio Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
