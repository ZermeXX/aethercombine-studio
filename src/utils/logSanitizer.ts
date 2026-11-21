/**
 @license
 SPDX-License-Identifier: Apache-2.0
*/

const MASK = '••••';

/** Оставляет первые и последние `keep` символов, середину скрывает. */
export const maskSecret = (value: string, keep: number = 4): string => {
  const v = String(value ?? '');
  if (!v) return '';
  if (v.length <= keep * 2) return MASK;
  return `${v.slice(0, keep)}${MASK}${v.slice(-keep)}`;
};

const SECRET_STRING_KEYS = [
  'private_key',
  'private_key_id',
  'client_secret',
  'bot_token',
  'telegram_bot_token',
  'api_token',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'id_token',
  'github_token',
  'gh_token',
  'pat',
  'password',
  'secret',
  'sa_key',
  'gdrive_sa_key'
];

const SECRET_OBJECT_KEYS = ['service_account', 'sa_json', 'gdrive_sa_json', 'credentials'];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Маскирует значения-объекты (`"service_account": { … }`) с учётом вложенных скобок. */
const maskJsonObjects = (input: string, keys: string[]): string => {
  let out = input;
  for (const key of keys) {
    const re = new RegExp(`("${escapeRegExp(key)}"\\s*:\\s*)\\{`, 'gi');
    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = re.exec(out)) !== null && guard < 200) {
      guard += 1;
      const start = match.index + match[1].length;
      let depth = 0;
      let end = -1;
      for (let i = start; i < out.length; i += 1) {
        const ch = out[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) break;
      const replacement = `"${MASK}"`;
      out = out.slice(0, start) + replacement + out.slice(end + 1);
      re.lastIndex = start + replacement.length;
    }
  }
  return out;
};

/**
 Маскирует токены и ключи в любом тексте: терминал раннера, «Копировать лог»,
 тексты ошибок, персист джобы и исходящие манифесты.
 Идемпотентна — повторный прогон уже очищенного текста ничего не портит.
*/
export const sanitizeLogText = (text: string): string => {
  let out = String(text ?? '');
  if (!out) return out;

  out = out.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    `${MASK} PRIVATE KEY REMOVED ${MASK}`
  );

  out = maskJsonObjects(out, SECRET_OBJECT_KEYS);

  const jsonFieldRe = new RegExp(
    `("?(?:${SECRET_STRING_KEYS.map(escapeRegExp).join('|')})"?\\s*[:=]\\s*")([^"]*)(")`,
    'gi'
  );
  out = out.replace(jsonFieldRe, (_m, head: string, _val: string, tail: string) => `${head}${MASK}${tail}`);

  const bareFieldRe = new RegExp(
    `\\b((?:${SECRET_STRING_KEYS.map(escapeRegExp).join('|')})\\s*[:=]\\s*)(?!["•])([^\\s,;&"'}\\]]+)`,
    'gi'
  );
  out = out.replace(bareFieldRe, (_m, head: string) => `${head}${MASK}`);

  out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${MASK}`);

  out = out.replace(/\bya29\.[A-Za-z0-9._-]+/g, `ya29.${MASK}`);
  out = out.replace(/\bAIza[0-9A-Za-z_-]{20,}/g, `AIza${MASK}`);
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, `github_pat_${MASK}`);
  out = out.replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, `gh_${MASK}`);
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, `sk-${MASK}`);
  out = out.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, `xox-${MASK}`);

  out = out.replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, `${MASK}:${MASK}`);

  out = out.replace(
    /([?&](?:upload_id|access_token|id_token|token|key|apikey|sig|signature|X-Goog-Signature)=)[^&\s"'<>]+/gi,
    `$1${MASK}`
  );

  out = out.replace(/\btoken\s*=\s*\{[^}]*\}/gi, `token = {${MASK}}`);

  out = out.replace(
    /(https:\/\/www\.googleapis\.com\/upload\/[^\s"'<>]*[?&]upload_id=)[^\s"'<>]+/gi,
    `$1${MASK}`
  );

  return out;
};

/** Пакетная очистка записей терминала перед рендером, копированием или сохранением. */
export const sanitizeLogEntries = <T extends { text: string }>(entries: T[]): T[] =>
  (Array.isArray(entries) ? entries : []).map(entry => ({
    ...entry,
    text: sanitizeLogText(entry?.text ?? '')
  }));
