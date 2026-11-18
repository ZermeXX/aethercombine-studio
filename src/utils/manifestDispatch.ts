/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GITHUB_DISPATCH_JSON_LIMIT = 62000;

export interface SerializedDispatchJson {
  payload: string;
  finalLength: number;
  exceedsLimit: boolean;
}

/**
 * Чистая минифицированная JSON-сериализация рабочего манифеста для GitHub Actions workflow_dispatch:
 * - JSON.stringify(compactManifest) строго без пробелов и отступов;
 * - без кодирования в Base64 / gzip;
 * - проверка лимита 62 000 символов перед отправкой.
 */
export function serializeCompactDispatchJson(
  compactManifest: unknown,
  limit: number = GITHUB_DISPATCH_JSON_LIMIT
): SerializedDispatchJson {
  const payload = JSON.stringify(compactManifest);
  return {
    payload,
    finalLength: payload.length,
    exceedsLimit: payload.length > limit
  };
}
