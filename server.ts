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
  // 3. POST /api/imagen/generate — Точный вызов generateImagenBatch (imagen-3.0-generate-002:predict)
  // ==========================================================================
  async function generateImagenBatch(
    promptText: string,
    apiKey: string,
    sampleCount: number = 4
  ): Promise<{ dataUrls: string[]; predictions: Array<{ bytesBase64Encoded: string; mimeType: string }> }> {
    // Эндпоинт Imagen 3 требует метода :predict, а не :generateContent
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    const payload = {
      instances: [{ prompt: promptText }],
      parameters: {
        sampleCount: Number(sampleCount),
        aspectRatio: '16:9',
        outputMimeType: 'image/jpeg'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(`Ошибка Imagen 3 API (${response.status}): ${errorDetails}`);
    }

    const result = (await response.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };

    if (!result.predictions || !result.predictions.length) {
      throw new Error(
        'API не вернул сгенерированные изображения. Проверьте валидность API-ключа и квоту Imagen 3.'
      );
    }

    const validPredictions = result.predictions
      .filter(pred => Boolean(pred?.bytesBase64Encoded))
      .map(pred => ({
        bytesBase64Encoded: pred.bytesBase64Encoded || '',
        mimeType: pred.mimeType || 'image/jpeg'
      }));

    if (!validPredictions.length) {
      throw new Error(
        'API не вернул сгенерированные изображения. Проверьте валидность API-ключа и квоту Imagen 3.'
      );
    }

    // Извлекаем чистый base64 и преобразуем в data-url
    const dataUrls = validPredictions.map(pred => {
      const base64 = pred.bytesBase64Encoded;
      return `data:image/jpeg;base64,${base64}`;
    });

    return { dataUrls, predictions: validPredictions };
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

      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        res.status(500).json({
          ok: false,
          error: 'GEMINI_API_KEY не настроен на сервере.'
        });
        return;
      }

      const { dataUrls, predictions } = await generateImagenBatch(
        promptText.trim(),
        apiKey,
        sampleCount || 4
      );

      res.json({
        ok: true,
        images: dataUrls,
        bytesBase64Encoded: predictions[0].bytesBase64Encoded,
        mimeType: predictions[0].mimeType,
        predictions
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ ok: false, error: msg });
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
