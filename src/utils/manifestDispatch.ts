/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GITHUB_DISPATCH_PAYLOAD_SAFE_LIMIT = 60000;
export const GITHUB_DISPATCH_PAYLOAD_HARD_LIMIT = 64500;

export interface EncodedDispatchPayload {
  payload: string;
  rawJson: string;
  compressed: boolean;
  rawJsonLength: number;
  finalLength: number;
  exceedsLimit: boolean;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

export function encodeUtf8ToBase64(text: string): string {
  try {
    const bytes = new TextEncoder().encode(text);
    return uint8ArrayToBase64(bytes);
  } catch {
    return btoa(unescape(encodeURIComponent(text)));
  }
}

export async function compressTextToGzipBase64(text: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') {
    return null;
  }
  try {
    const stream = new Blob([text], { type: 'application/json' })
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    return `gz:${uint8ArrayToBase64(new Uint8Array(buffer))}`;
  } catch {
    return null;
  }
}

/**
 * Компактная сериализация рабочего манифеста для GitHub Actions workflow_dispatch:
 * 1) JSON.stringify без отступов;
 * 2) При превышении 60 000 символов — автоматическое gzip-сжатие через CompressionStream('gzip') с префиксом `gz:`.
 */
export async function buildCompactDispatchPayload(
  compactManifest: unknown,
  softLimit: number = GITHUB_DISPATCH_PAYLOAD_SAFE_LIMIT
): Promise<EncodedDispatchPayload> {
  const rawJson = JSON.stringify(compactManifest);
  const plainBase64 = encodeUtf8ToBase64(rawJson);

  if (plainBase64.length <= softLimit) {
    return {
      payload: plainBase64,
      rawJson,
      compressed: false,
      rawJsonLength: rawJson.length,
      finalLength: plainBase64.length,
      exceedsLimit: false
    };
  }

  const gzPayload = await compressTextToGzipBase64(rawJson);
  if (gzPayload && gzPayload.length <= GITHUB_DISPATCH_PAYLOAD_HARD_LIMIT) {
    return {
      payload: gzPayload,
      rawJson,
      compressed: true,
      rawJsonLength: rawJson.length,
      finalLength: gzPayload.length,
      exceedsLimit: false
    };
  }

  const bestPayload =
    gzPayload && gzPayload.length < plainBase64.length ? gzPayload : plainBase64;
  return {
    payload: bestPayload,
    rawJson,
    compressed: Boolean(gzPayload && bestPayload.startsWith('gz:')),
    rawJsonLength: rawJson.length,
    finalLength: bestPayload.length,
    exceedsLimit: bestPayload.length > GITHUB_DISPATCH_PAYLOAD_HARD_LIMIT
  };
}
