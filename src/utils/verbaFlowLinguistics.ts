/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VerbaTone =
  | 'doc'
  | 'storyteller'
  | 'truecrime'
  | 'scipop'
  | 'dynamic'
  | 'neutral';

export type VerbaRewriteMode =
  | 'humanize'
  | 'deep_rewrite'
  | 'dry_water'
  | 'gentle_edit';

export type HookArchetype =
  | 'paradox'
  | 'in_media_res'
  | 'clue'
  | 'question'
  | 'contrast';

export interface VerbaHookCard {
  id: string;
  archetype: HookArchetype;
  archetypeLabel: string;
  durationSec: number;
  visualCue: string;
  hookText: string;
}

export interface VerbaScenePromptCard {
  sceneIndex: number;
  timecodeRange: string;
  startTime: string;
  durationSec: number;
  scriptLine: string;
  promptEn: string;
  promptRu: string;
  sfx: string;
}

export interface FlaggedSegment {
  type: 'cliche' | 'water' | 'repeat';
  phrase: string;
  start: number;
  end: number;
  reason: string;
  replacements: string[];
}

export interface VerbaTelemetry {
  wordCount: number;
  charCount: number;
  sentenceCount: number;
  burstinessPercent: number;
  humanityScore: number;
  clichesFound: Array<{ phrase: string; count: number; replacements: string[] }>;
  totalClichesCount: number;
  densityPercent: number;
  waterFound: Array<{ phrase: string; count: number }>;
  totalWaterCount: number;
  uniquenessPercent: number;
  shingleOverlapPercent: number;
  lexicalDiversityPercent: number;
  narrationSeconds: number;
  narrationFormatted: string;
  remainingDigitsCount: number;
  yoCount: number;
  missingYoCount: number;
  repeatWordsCount: number;
}

export interface VoiceoverCleanStats {
  removedAds: number;
  removedTimecodes: number;
  removedStageNotes: number;
  convertedNumbers: number;
  expandedAbbreviations: number;
  restoredYo: number;
}

export interface XrayToken {
  text: string;
  kind: 'normal' | 'cliche' | 'water' | 'repeat';
  reason?: string;
  replacements?: string[];
}

interface PatternReplacementRule {
  pattern: RegExp;
  label: string;
  replacements: string[];
  reason: string;
}

export const AI_CLICHE_RULES: PatternReplacementRule[] = [
  {
    pattern: /в современном мире/gi,
    label: 'в современном мире',
    replacements: ['сегодня', 'прямо сейчас', 'в наши дни'],
    reason: 'Типичный ИИ-штамп для вступления'
  },
  {
    pattern: /не секрет,?\s*что/gi,
    label: 'не секрет, что',
    replacements: ['каждый замечал:', 'факты показывают, что', ''],
    reason: 'Шаблонная связка ИИ'
  },
  {
    pattern: /играет ключевую роль/gi,
    label: 'играет ключевую роль',
    replacements: ['решает исход дела', 'становится главным фактором', 'определяет всё'],
    reason: 'Канцелярский ИИ-штамп'
  },
  {
    pattern: /стоит отметить,?\s*что/gi,
    label: 'стоит отметить, что',
    replacements: ['обратите внимание:', 'при этом', ''],
    reason: 'Вводный ИИ-штамп'
  },
  {
    pattern: /стоит отметить/gi,
    label: 'стоит отметить',
    replacements: ['важно одно:', 'заметьте', ''],
    reason: 'Вводный ИИ-штамп'
  },
  {
    pattern: /важно понимать,?\s*что/gi,
    label: 'важно понимать, что',
    replacements: ['главное здесь —', 'суть в том, что', ''],
    reason: 'Дидактический ИИ-штамп'
  },
  {
    pattern: /важно понимать/gi,
    label: 'важно понимать',
    replacements: ['учтите', 'тут есть нюанс'],
    reason: 'Дидактический ИИ-штамп'
  },
  {
    pattern: /таким образом,?/gi,
    label: 'таким образом',
    replacements: ['в итоге', 'поэтому', 'выходит,'],
    reason: 'Сухой логический штамп'
  },
  {
    pattern: /подводя итог,?/gi,
    label: 'подводя итог',
    replacements: ['если коротко,', 'что в сухом остатке?', 'финал прост:'],
    reason: 'Шаблонная концовка ИИ'
  },
  {
    pattern: /в заключение/gi,
    label: 'в заключение',
    replacements: ['напоследок', 'и последнее'],
    reason: 'Рефератный штамп'
  },
  {
    pattern: /необходимо подчеркнуть,?\s*что/gi,
    label: 'необходимо подчеркнуть, что',
    replacements: ['ключевой момент:', 'главное —'],
    reason: 'Канцелярит и ИИ-штамп'
  },
  {
    pattern: /неотъемлемой частью/gi,
    label: 'неотъемлемой частью',
    replacements: ['основой', 'важным звеном', 'привычной деталью'],
    reason: 'Шаблонная метафора ИИ'
  },
  {
    pattern: /широкий спектр/gi,
    label: 'широкий спектр',
    replacements: ['десятки вариантов', 'масса возможностей', 'целый набор'],
    reason: 'Маркетингово-нейросетевой штамп'
  },
  {
    pattern: /официальная версия гласила,?\s*что/gi,
    label: 'официальная версия гласила, что',
    replacements: ['в отчётах поспешно написали:', 'на бумаге всё списали на то, что'],
    reason: 'Шаблонное изложение'
  },
  {
    pattern: /в рамках расследования/gi,
    label: 'в рамках расследования',
    replacements: ['по ходу дела', 'когда начали копать глубже'],
    reason: 'Канцелярит'
  },
  {
    pattern: /в эпоху цифровизации/gi,
    label: 'в эпоху цифровизации',
    replacements: ['сегодня', 'в мире алгоритмов'],
    reason: 'ИИ-клише'
  },
  {
    pattern: /in today's world/gi,
    label: "in today's world",
    replacements: ['today', 'right now'],
    reason: 'English AI cliché'
  },
  {
    pattern: /plays a crucial role/gi,
    label: 'plays a crucial role',
    replacements: ['drives the outcome', 'changes everything'],
    reason: 'English AI cliché'
  },
  {
    pattern: /it is worth noting that/gi,
    label: 'it is worth noting that',
    replacements: ['notice this:', 'crucially,'],
    reason: 'English AI cliché'
  },
  {
    pattern: /in conclusion,?/gi,
    label: 'in conclusion',
    replacements: ['ultimately,', 'in the end,'],
    reason: 'English AI cliché'
  }
];

export const WATER_BALLAST_RULES: PatternReplacementRule[] = [
  {
    pattern: /на сегодняшний день,?/gi,
    label: 'на сегодняшний день',
    replacements: ['сейчас', ''],
    reason: 'Вводный словесный балласт'
  },
  {
    pattern: /как известно,?/gi,
    label: 'как известно',
    replacements: ['', 'по общему мнению,'],
    reason: 'Вода без новой информации'
  },
  {
    pattern: /безусловно,?/gi,
    label: 'безусловно',
    replacements: ['', 'точно'],
    reason: 'Пустое усилительное слово'
  },
  {
    pattern: /на самом деле,?/gi,
    label: 'на самом деле',
    replacements: ['', 'в реальности'],
    reason: 'Паразитная вводная конструкция'
  },
  {
    pattern: /по сути,?/gi,
    label: 'по сути',
    replacements: [''],
    reason: 'Размывающий вводный оборот'
  },
  {
    pattern: /собственно говоря,?/gi,
    label: 'собственно говоря',
    replacements: [''],
    reason: 'Словесный мусор'
  },
  {
    pattern: /так сказать,?/gi,
    label: 'так сказать',
    replacements: [''],
    reason: 'Неуверенная вводная вставка'
  },
  {
    pattern: /в конечном сч[её]те,?/gi,
    label: 'в конечном счёте',
    replacements: ['в итоге', ''],
    reason: 'Растянутая связка'
  },
  {
    pattern: /очевидно,?\s*что/gi,
    label: 'очевидно, что',
    replacements: [''],
    reason: 'Избыточная оценка'
  },
  {
    pattern: /в принципе,?/gi,
    label: 'в принципе',
    replacements: [''],
    reason: 'Снижение конкретики'
  },
  {
    pattern: /в целом,?/gi,
    label: 'в целом',
    replacements: [''],
    reason: 'Размытое обобщение'
  },
  {
    pattern: /как правило,?/gi,
    label: 'как правило',
    replacements: ['обычно', ''],
    reason: 'Штампованная вводная оговорка'
  },
  {
    pattern: /дело в том,?\s*что/gi,
    label: 'дело в том, что',
    replacements: [''],
    reason: 'Пустой разгон фразы'
  },
  {
    pattern: /согласно официальным данным,?/gi,
    label: 'согласно официальным данным',
    replacements: ['по документам', ''],
    reason: 'Бюрократический балласт'
  },
  {
    pattern: /as is well known,?/gi,
    label: 'as is well known',
    replacements: [''],
    reason: 'Filler phrase'
  },
  {
    pattern: /basically,?/gi,
    label: 'basically',
    replacements: [''],
    reason: 'Filler word'
  }
];

const STOP_WORDS = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'всё',
  'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только',
  'ее', 'её', 'мне', 'было', 'вот', 'от', 'меня', 'еще', 'ещё', 'нет', 'о', 'из', 'ему',
  'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли', 'если', 'уже', 'или', 'ни', 'быть',
  'был', 'него', 'до', 'вас', 'нибудь', 'опять', 'уж', 'вам', 'ведь', 'там', 'потом',
  'себя', 'ничего', 'ей', 'может', 'они', 'тут', 'где', 'есть', 'надо', 'ней', 'для',
  'мы', 'тебя', 'их', 'чем', 'была', 'сам', 'чтоб', 'без', 'будто', 'чего', 'раз',
  'тоже', 'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот', 'того', 'потому', 'этого',
  'какой', 'совсем', 'ним', 'здесь', 'этом', 'один', 'почти', 'мой', 'тем', 'чтобы',
  'нее', 'неё', 'сейчас', 'были', 'куда', 'зачем', 'всех', 'никогда', 'можно', 'при',
  'наконец', 'два', 'об', 'другой', 'хоть', 'после', 'над', 'больше', 'тот', 'через',
  'эти', 'нас', 'про', 'всего', 'них', 'какая', 'много', 'разве', 'три', 'эту', 'моя',
  'впрочем', 'хорошо', 'свою', 'этой', 'перед', 'иногда', 'лучше', 'чуть', 'том',
  'нельзя', 'такой', 'им', 'более', 'всегда', 'конечно', 'всю', 'между',
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'was', 'were', 'are', 'be', 'been', 'it', 'that', 'this', 'as'
]);

// Расширенный словарь восстановления буквы «Ё»
export const YO_RESTORE_RULES: Array<[RegExp, string]> = [
  [/\bеще\b/gi, 'ещё'],
  [/\bвсе\b/gi, 'всё'],
  [/\bее\b/gi, 'её'],
  [/\bтрех\b/gi, 'трёх'],
  [/\bчетырех\b/gi, 'четырёх'],
  [/\bчетверт([а-я]*)\b/gi, 'четвёрт$1'],
  [/\bпленк([а-я]*)\b/gi, 'плёнк$1'],
  [/\bсъемк([а-я]*)\b/gi, 'съёмк$1'],
  [/\bтяжел([а-я]*)\b/gi, 'тяжёл$1'],
  [/\bчерн([а-я]*)\b/gi, 'чёрн$1'],
  [/\bчетк([а-я]*)\b/gi, 'чётк$1'],
  [/\bжестк([а-я]*)\b/gi, 'жёстк$1'],
  [/\bжелт([а-я]*)\b/gi, 'жёлт$1'],
  [/\bзелен([а-я]*)\b/gi, 'зелён$1'],
  [/\bтемн([а-я]*)\b/gi, 'тёмн$1'],
  [/\bтепл([а-я]*)\b/gi, 'тёпл$1'],
  [/\bдалек([а-я]*)\b/gi, 'далёк$1'],
  [/\bнадежн([а-я]*)\b/gi, 'надёжн$1'],
  [/\bсерьезн([а-я]*)\b/gi, 'серьёзн$1'],
  [/\bзасекреченн([а-я]*)\b/gi, 'засекречённ$1'],
  [/\bвключен([а-я]*)\b/gi, 'включён$1'],
  [/\bотключен([а-я]*)\b/gi, 'отключён$1'],
  [/\bобречен([а-я]*)\b/gi, 'обречён$1'],
  [/\bнапряжен([а-я]*)\b/gi, 'напряжён$1'],
  [/\bискажен([а-я]*)\b/gi, 'искажён$1'],
  [/\bподтвержден([а-я]*)\b/gi, 'подтверждён$1'],
  [/\bуничтожен([а-я]*)\b/gi, 'уничтожён$1'],
  [/\bпришел\b/gi, 'пришёл'],
  [/\bушел\b/gi, 'ушёл'],
  [/\bнашел\b/gi, 'нашёл'],
  [/\bпроизошел\b/gi, 'произошёл'],
  [/\bшел\b/gi, 'шёл'],
  [/\bзвезд([а-я]*)\b/gi, 'звёзд$1'],
  [/\bлед\b/gi, 'лёд'],
  [/\bзамерзш([а-я]*)\b/gi, 'замёрзш$1'],
  [/\bсчетчик([а-я]*)\b/gi, 'счётчик$1'],
  [/\bсчет([а-я]*)\b/gi, 'счёт$1'],
  [/\bотчет([а-я]*)\b/gi, 'отчёт$1'],
  [/\bрасчет([а-я]*)\b/gi, 'расчёт$1'],
  [/\bучет([а-я]*)\b/gi, 'учёт$1'],
  [/\bобъем([а-я]*)\b/gi, 'объём$1'],
  [/\bподъем([а-я]*)\b/gi, 'подъём$1'],
  [/\bприем([а-я]*)\b/gi, 'приём$1'],
  [/\bразъем([а-я]*)\b/gi, 'разъём$1'],
  [/\bполет([а-я]*)\b/gi, 'полёт$1'],
  [/\bсамолет([а-я]*)\b/gi, 'самолё$1'],
  [/\bвертолет([а-я]*)\b/gi, 'вертолё$1'],
  [/\bберет\b/gi, 'берёт'],
  [/\bидет\b/gi, 'идёт'],
  [/\bживет\b/gi, 'живёт'],
  [/\bдает\b/gi, 'даёт'],
  [/\bостается\b/gi, 'остаётся'],
  [/\bждет\b/gi, 'ждёт'],
  [/\bведет\b/gi, 'ведёт'],
  [/\bнесет\b/gi, 'несёт'],
  [/\bприведет\b/gi, 'приведёт'],
  [/\bнайдет\b/gi, 'найдёт'],
  [/\bпройдет\b/gi, 'пройдёт'],
  [/\bребен([а-я]*)\b/gi, 'ребён$1'],
  [/\bслез([а-я]*)\b/gi, 'слёз$1'],
  [/\bактер([а-я]*)\b/gi, 'актёр$1'],
  [/\bрежиссер([а-я]*)\b/gi, 'режиссёр$1'],
  [/\bмонтажер([а-я]*)\b/gi, 'монтажёр$1'],
  [/\bманевр([а-я]*)\b/gi, 'манёвр$1'],
  [/\bафер([а-я]*)\b/gi, 'афёр$1'],
  [/\bколес([а-я]*)\b/gi, 'колёс$1'],
  [/\bозер([а-я]*)\b/gi, 'озёр$1'],
  [/\bкостер\b/gi, 'костёр']
];

function preserveCaseReplace(original: string, target: string): string {
  if (!original || !target) return target;
  if (original === original.toUpperCase() && original.length > 1) {
    return target.toUpperCase();
  }
  const first = original[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

export function restoreYoInRussianText(text: string): { text: string; restoredCount: number } {
  let out = text;
  let restoredCount = 0;

  // Фикс опечатки для самолет/вертолет (выше $1 теряло букву т)
  const fixedRules: Array<[RegExp, string]> = YO_RESTORE_RULES.map(([rx, rep]) => {
    if (rep === 'самолё$1') return [rx, 'самолёт$1'];
    if (rep === 'вертолё$1') return [rx, 'вертолёт$1'];
    return [rx, rep];
  });

  for (const [regex, replacement] of fixedRules) {
    out = out.replace(regex, (...args) => {
      const match = args[0] as string;
      const replaced = match.replace(new RegExp(regex.source, 'i'), replacement);
      if (replaced.toLowerCase() !== match.toLowerCase()) {
        restoredCount += 1;
      }
      return preserveCaseReplace(match, replaced);
    });
  }

  return { text: out, restoredCount };
}

// ============================================================================
// ПЕРЕВОД ЧИСЕЛ, ДАТ И ПРОЦЕНТОВ В СЛОВА ПРОПИСЬЮ (РУССКИЙ ЯЗЫК)
// ============================================================================
export type NumberGrammarForm = 'cardinal' | 'ordinal_genitive' | 'ordinal_prepositional' | 'ordinal_nominative';

export function intToRussianWords(
  num: number,
  form: NumberGrammarForm = 'cardinal'
): string {
  if (!Number.isFinite(num) || num < 0) return String(num);
  if (num === 0) return form === 'cardinal' ? 'ноль' : 'нулевого';

  const ones = [
    '', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'
  ];
  const onesFem = [
    '', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'
  ];
  const tens = [
    '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
    'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'
  ];
  const hundreds = [
    '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
    'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'
  ];

  const ordGenOnes = [
    '', 'первого', 'второго', 'третьего', 'четвёртого', 'пятого', 'шестого', 'седьмого',
    'восьмого', 'девятого', 'десятого', 'одиннадцатого', 'двенадцатого', 'тринадцатого',
    'четырнадцатого', 'пятнадцатого', 'шестнадцатого', 'семнадцатого', 'восемнадцатого', 'девятнадцатого'
  ];
  const ordPrepOnes = [
    '', 'первом', 'втором', 'третьем', 'четвёртом', 'пятом', 'шестом', 'седьмом',
    'восьмом', 'девятом', 'десятом', 'одиннадцатом', 'двенадцатом', 'тринадцатом',
    'четырнадцатом', 'пятнадцатом', 'шестнадцатом', 'семнадцатом', 'восемнадцатом', 'девятнадцатом'
  ];
  const ordNomOnes = [
    '', 'первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой',
    'восьмой', 'девятый', 'десятый', 'одиннадцатый', 'двенадцатый', 'тринадцатый',
    'четырнадцатый', 'пятнадцатый', 'шестнадцатый', 'семнадцатый', 'восемнадцатый', 'девятнадцатый'
  ];

  const ordGenTens = [
    '', '', 'двадцатого', 'тридцатого', 'сорокового', 'пятидесятого',
    'шестидесятого', 'семидесятого', 'восьмидесятого', 'девяностого'
  ];
  const ordPrepTens = [
    '', '', 'двадцатом', 'тридцатом', 'сороковом', 'пятидесятом',
    'шестидесятом', 'семидесятом', 'восьмидесятом', 'девяностом'
  ];
  const ordNomTens = [
    '', '', 'двадцатый', 'тридцатый', 'сороковой', 'пятидесятый',
    'шестидесятый', 'семидесятый', 'восьмидесятый', 'девяностый'
  ];

  const ordGenHundreds = [
    '', 'сотого', 'двухсотого', 'трёхсотого', 'четырёхсотого', 'пятисотого',
    'шестисотого', 'семисотого', 'восьмисотого', 'девятисотого'
  ];
  const ordPrepHundreds = [
    '', 'сотом', 'двухсотом', 'трёхсотом', 'четырёхсотом', 'пятисотом',
    'шестисотом', 'семисотом', 'восьмисотом', 'девятисотом'
  ];
  const ordNomHundreds = [
    '', 'сотый', 'двухсотый', 'трёхсотый', 'четырёхсотый', 'пятисотый',
    'шестисотый', 'семисотый', 'восьмисотый', 'девятисотый'
  ];

  function triadToCardinal(n: number, feminine = false): string {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    const out: string[] = [];
    if (h > 0) out.push(hundreds[h]);
    if (rem > 0) {
      if (rem < 20) {
        out.push((feminine ? onesFem : ones)[rem]);
      } else {
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        out.push(tens[t]);
        if (o > 0) out.push((feminine ? onesFem : ones)[o]);
      }
    }
    return out.filter(Boolean).join(' ');
  }

  function pluralize(n: number, forms: [string, string, string]): string {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 19) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }

  let rem = Math.floor(num);
  const parts: string[] = [];

  if (rem >= 1_000_000) {
    const mil = Math.floor(rem / 1_000_000);
    rem %= 1_000_000;
    parts.push(`${triadToCardinal(mil, false)} ${pluralize(mil, ['миллион', 'миллиона', 'миллионов'])}`);
  }

  if (rem >= 1000) {
    const th = Math.floor(rem / 1000);
    rem %= 1000;
    if (rem === 0 && form !== 'cardinal') {
      if (th === 1) {
        parts.push(form === 'ordinal_genitive' ? 'тысячного' : form === 'ordinal_prepositional' ? 'тысячном' : 'тысячный');
      } else if (th === 2) {
        parts.push(form === 'ordinal_genitive' ? 'двухтысячного' : form === 'ordinal_prepositional' ? 'двухтысячном' : 'двухтысячный');
      } else {
        parts.push(`${triadToCardinal(th, true)} ${pluralize(th, ['тысяча', 'тысячи', 'тысяч'])}`);
      }
    } else if (th === 1 && form !== 'cardinal') {
      // «тысяча девятьсот семьдесят восьмого» (традиционная форма для годов)
      parts.push('тысяча');
    } else {
      parts.push(`${triadToCardinal(th, true)} ${pluralize(th, ['тысяча', 'тысячи', 'тысяч'])}`);
    }
  }

  if (rem > 0) {
    if (form === 'cardinal') {
      parts.push(triadToCardinal(rem, false));
    } else {
      const h = Math.floor(rem / 100);
      const lastTwo = rem % 100;
      if (lastTwo === 0) {
        parts.push(
          form === 'ordinal_genitive'
            ? ordGenHundreds[h]
            : form === 'ordinal_prepositional'
            ? ordPrepHundreds[h]
            : ordNomHundreds[h]
        );
      } else {
        if (h > 0) parts.push(hundreds[h]);
        if (lastTwo < 20) {
          parts.push(
            form === 'ordinal_genitive'
              ? ordGenOnes[lastTwo]
              : form === 'ordinal_prepositional'
              ? ordPrepOnes[lastTwo]
              : ordNomOnes[lastTwo]
          );
        } else {
          const t = Math.floor(lastTwo / 10);
          const o = lastTwo % 10;
          if (o === 0) {
            parts.push(
              form === 'ordinal_genitive'
                ? ordGenTens[t]
                : form === 'ordinal_prepositional'
                ? ordPrepTens[t]
                : ordNomTens[t]
            );
          } else {
            parts.push(tens[t]);
            parts.push(
              form === 'ordinal_genitive'
                ? ordGenOnes[o]
                : form === 'ordinal_prepositional'
                ? ordPrepOnes[o]
                : ordNomOnes[o]
            );
          }
        }
      }
    }
  }

  return parts.filter(Boolean).join(' ');
}

function pluralizePercent(n: number): string {
  const mod100 = Math.floor(n) % 100;
  const mod10 = Math.floor(n) % 10;
  if (mod100 >= 11 && mod100 <= 19) return 'процентов';
  if (mod10 === 1) return 'процент';
  if (mod10 >= 2 && mod10 <= 4) return 'процента';
  return 'процентов';
}

export function convertNumbersAndAbbreviations(text: string): {
  text: string;
  convertedNumbers: number;
  expandedAbbreviations: number;
} {
  let out = text;
  let convertedNumbers = 0;
  let expandedAbbreviations = 0;

  // 1. Разворот составных и одиночных сокращений
  const abbrRules: Array<[RegExp, string]> = [
    [/(\d+)\s*м\/с\b/gi, '$1 метров в секунду'],
    [/\bм\/с\b/gi, 'метров в секунду'],
    [/(\d+)\s*км\/ч\b/gi, '$1 километров в час'],
    [/\bкм\/ч\b/gi, 'километров в час'],
    [/(\d+)\s*км\b/gi, '$1 километров'],
    [/\bкм\b/gi, 'километров'],
    [/(\d+)\s*см\b/gi, '$1 сантиметров'],
    [/(\d+)\s*мм\b/gi, '$1 миллиметров'],
    [/(\d+)\s*кг\b/gi, '$1 килограммов'],
    [/(\d+)\s*тыс\.?/gi, '$1 тысяч'],
    [/(\d+)\s*млн\.?/gi, '$1 миллионов'],
    [/(\d+)\s*млрд\.?/gi, '$1 миллиардов'],
    [/(\d+)\s*ч\.(?=\s|$|[,.!?])/gi, '$1 часов'],
    [/(\d+)\s*мин\.(?=\s|$|[,.!?])/gi, '$1 минут'],
    [/(\d+)\s*сек\.(?=\s|$|[,.!?])/gi, '$1 секунд'],
    [/(\d{4})\s*г\.(?=\s|$|[,.!?])/gi, '$1 года'],
    [/(\d{4})\s*гг\./gi, '$1 годов'],
    [/\bт\.?\s*е\./gi, 'то есть'],
    [/\bи\s*т\.?\s*д\./gi, 'и так далее'],
    [/\bи\s*т\.?\s*п\./gi, 'и тому подобное'],
    [/\bи\s*др\./gi, 'и других'],
    [/\bул\.\s*/gi, 'улица '],
    [/\bруб\./gi, 'рублей']
  ];

  for (const [rx, rep] of abbrRules) {
    out = out.replace(rx, (...args) => {
      expandedAbbreviations += 1;
      const m = args[0] as string;
      const g1 = typeof args[1] === 'string' ? args[1] : '';
      const resolved = rep.includes('$1') ? rep.replace('$1', g1) : rep;
      return preserveCaseReplace(m, resolved);
    });
  }

  // 2. Проценты (включая дробные: 12,5% или 50%)
  out = out.replace(/(\d+)[.,](\d+)\s*%/g, (_m, intPart, fracPart) => {
    convertedNumbers += 1;
    const iNum = parseInt(intPart, 10);
    const fNum = parseInt(fracPart, 10);
    const fracUnit = fracPart.length === 1 ? 'десятых' : fracPart.length === 2 ? 'сотых' : 'тысячных';
    return `${intToRussianWords(iNum)} целых ${intToRussianWords(fNum)} ${fracUnit} процента`;
  });

  out = out.replace(/(\d+)\s*%/g, (_m, numStr) => {
    convertedNumbers += 1;
    const n = parseInt(numStr, 10);
    return `${intToRussianWords(n)} ${pluralizePercent(n)}`;
  });

  // 3. Годы в контексте «в 1978 году» (предложный падеж: в тысяча девятьсот семьдесят восьмом году)
  out = out.replace(/\b([Вв])\s+(\d{4})\s+(году)\b/g, (_m, prep, yearStr, word) => {
    convertedNumbers += 1;
    const y = parseInt(yearStr, 10);
    return `${prep} ${intToRussianWords(y, 'ordinal_prepositional')} ${word}`;
  });

  // 4. Годы в родительном падеже «1978 года» или после месяца «12 апреля 1978»
  out = out.replace(
    /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})(?:\s*(года|году))?\b/gi,
    (_m, dayStr, month, yearStr, gWord) => {
      convertedNumbers += 2;
      const d = parseInt(dayStr, 10);
      const y = parseInt(yearStr, 10);
      const suffix = gWord ? ` ${gWord}` : '';
      return `${intToRussianWords(d, 'ordinal_genitive')} ${month} ${intToRussianWords(y, 'ordinal_genitive')}${suffix}`;
    }
  );

  out = out.replace(/\b(\d{4})\s+(года|годов)\b/gi, (_m, yearStr, word) => {
    convertedNumbers += 1;
    const y = parseInt(yearStr, 10);
    return `${intToRussianWords(y, 'ordinal_genitive')} ${word}`;
  });

  // 5. Десятичные дроби (3.5 или 3,5)
  out = out.replace(/\b(\d+)[.,](\d+)\b/g, (_m, a, b) => {
    convertedNumbers += 1;
    const iNum = parseInt(a, 10);
    const fNum = parseInt(b, 10);
    const fracLabel = b.length === 1 ? 'десятых' : b.length === 2 ? 'сотых' : 'тысячных';
    return `${intToRussianWords(iNum)} целых ${intToRussianWords(fNum)} ${fracLabel}`;
  });

  // 6. Оставшиеся целые числа (сохраняем контекст лет 1800–2035 как родительный/порядковый или количественный)
  out = out.replace(/\b\d+\b/g, match => {
    const n = parseInt(match, 10);
    if (!Number.isFinite(n)) return match;
    convertedNumbers += 1;
    if (n >= 1800 && n <= 2035) {
      return intToRussianWords(n, 'ordinal_genitive');
    }
    return intToRussianWords(n, 'cardinal');
  });

  return { text: out, convertedNumbers, expandedAbbreviations };
}

// ============================================================================
// ОЧИСТКА ДЛЯ ДИКТОРСКОГО ЦЕХА (РЕКЛАМА, ТАЙМКОДЫ, РЕМАРКИ, ЧИСЛА, СОКРАЩЕНИЯ, Ё)
// ============================================================================
export function prepareVoiceoverScript(
  rawText: string,
  options: {
    stripAds?: boolean;
    stripTimecodes?: boolean;
    stripStageNotes?: boolean;
    numbersToWords?: boolean;
    expandAbbr?: boolean;
    restoreYo?: boolean;
  } = {}
): { text: string; stats: VoiceoverCleanStats } {
  const {
    stripAds = true,
    stripTimecodes = true,
    stripStageNotes = true,
    numbersToWords = true,
    expandAbbr = true,
    restoreYo = true
  } = options;

  let text = rawText;
  let removedAds = 0;
  let removedTimecodes = 0;
  let removedStageNotes = 0;
  let convertedNumbers = 0;
  let expandedAbbreviations = 0;
  let restoredYo = 0;

  // Защищаем паузы [pause 1.5s] если есть
  const pauseTokens: string[] = [];
  text = text.replace(/\[(?:пауза|pause)\s+[\d.,]+(?:с|s)\]/gi, m => {
    pauseTokens.push(m);
    return `__VERBA_PAUSE_${pauseTokens.length - 1}__`;
  });

  if (stripAds) {
    const lines = text.split(/\r?\n/);
    const adRegex =
      /(?:^|\s)(?:реклама|спонсор\s+выпуска|интеграция|промокод|переходите\s+по\s+ссылке|подписывайтесь\s+на\s+канал|ставьте\s+лайк|sponsor|promo\s*code|link\s+in\s+description)/i;
    const keptLines: string[] = [];
    for (const line of lines) {
      if (adRegex.test(line)) {
        removedAds += 1;
      } else {
        keptLines.push(line);
      }
    }
    text = keptLines.join('\n');
    text = text.replace(/\[(?:Реклама|Ad|Sponsor)[^\]]*\][\s\S]*?(?=\n\n|$)/gi, () => {
      removedAds += 1;
      return '';
    });
  }

  if (stripTimecodes) {
    text = text.replace(/[\[(]?\b\d{1,2}:\d{2}(?::\d{2})?(?:[–-]\d{1,2}:\d{2}(?::\d{2})?)?[\])]?\s*[-—:]?\s*/g, m => {
      if (m.trim()) removedTimecodes += 1;
      return '';
    });
  }

  if (stripStageNotes) {
    text = text.replace(/\[(?:Кадр|Shot|Visual|SFX|Звук|Музыка|Music|Бит|Beat|Open Loop|Scene|Сцена|Overlay|Титр)[^\]]*\]/gi, () => {
      removedStageNotes += 1;
      return '';
    });
    text = text.replace(/\((?:SFX|музыка|пауза|тишина|шепотом|вдох|выдох|кадр|голос за кадром)[^)]*\)/gi, () => {
      removedStageNotes += 1;
      return '';
    });
  }

  if (expandAbbr || numbersToWords) {
    const res = convertNumbersAndAbbreviations(text);
    if (expandAbbr && numbersToWords) {
      text = res.text;
      convertedNumbers = res.convertedNumbers;
      expandedAbbreviations = res.expandedAbbreviations;
    } else if (expandAbbr) {
      // Только сокращения, без цифр — прогоним упрощенно
      const abbrOnly = text
        .replace(/\bкм\/ч\b/gi, 'километров в час')
        .replace(/\bм\/с\b/gi, 'метров в секунду')
        .replace(/\bкм\b/gi, 'километров')
        .replace(/\bтыс\.?/gi, 'тысяч')
        .replace(/\bмлн\.?/gi, 'миллионов')
        .replace(/\bт\.?\s*е\./gi, 'то есть')
        .replace(/\bи\s*т\.?\s*д\./gi, 'и так далее');
      if (abbrOnly !== text) expandedAbbreviations += 1;
      text = abbrOnly;
    } else if (numbersToWords) {
      text = res.text;
      convertedNumbers = res.convertedNumbers;
    }
  }

  if (restoreYo) {
    const yoRes = restoreYoInRussianText(text);
    text = yoRes.text;
    restoredYo = yoRes.restoredCount;
  }

  text = text.replace(/__VERBA_PAUSE_(\d+)__/g, (_m, idx) => pauseTokens[Number(idx)] || '[pause 1.5s]');
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    text,
    stats: {
      removedAds,
      removedTimecodes,
      removedStageNotes,
      convertedNumbers,
      expandedAbbreviations,
      restoredYo
    }
  };
}

// ============================================================================
// ЖИВОЙ АНАЛИЗАТОР МЕТРИК (TELEMETRY BAR) В РЕАЛЬНОМ ВРЕМЕНИ
// ============================================================================
function extractWordTokens(text: string): string[] {
  const cleaned = text.replace(/\[[^\]]*\]/g, ' ');
  return (cleaned.match(/[а-яёa-z0-9-]+/gi) || []).filter(w => /[а-яёa-z0-9]/i.test(w));
}

function build3Grams(words: string[]): Set<string> {
  const set = new Set<string>();
  const norm = words.map(w => w.toLowerCase());
  for (let i = 0; i <= norm.length - 3; i++) {
    set.add(`${norm[i]} ${norm[i + 1]} ${norm[i + 2]}`);
  }
  return set;
}

export function analyzeVerbaTelemetry(activeText: string, sourceText: string): VerbaTelemetry {
  const cleanForAnalysis = activeText.replace(/\[[^\]]*\]/g, ' ').trim();
  const words = extractWordTokens(cleanForAnalysis);
  const wordCount = words.length;
  const charCount = activeText.length;

  const sentences = cleanForAnalysis
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 1);
  const sentenceCount = sentences.length;

  // 1. Burstiness (ритмика предложений: стандартное отклонение длины предложений)
  let burstinessPercent = 0;
  if (sentences.length >= 2) {
    const lengths = sentences.map(s => extractWordTokens(s).length).filter(l => l > 0);
    if (lengths.length >= 2) {
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;
      // Коэффициент вариации cv ~0.45..0.85 дает живую человеческую ритмику
      burstinessPercent = Math.max(18, Math.min(98, Math.round(cv * 115 + 18)));
    } else {
      burstinessPercent = 55;
    }
  } else if (sentences.length === 1) {
    burstinessPercent = wordCount <= 14 ? 72 : 42;
  }

  // Поиск ИИ-штампов
  const clichesFound: Array<{ phrase: string; count: number; replacements: string[] }> = [];
  let totalClichesCount = 0;
  for (const rule of AI_CLICHE_RULES) {
    const matches = activeText.match(rule.pattern);
    if (matches && matches.length > 0) {
      clichesFound.push({
        phrase: rule.label,
        count: matches.length,
        replacements: rule.replacements.filter(Boolean)
      });
      totalClichesCount += matches.length;
    }
  }

  const humanityScore = wordCount === 0
    ? 0
    : Math.max(12, Math.min(99, Math.round(burstinessPercent * 0.72 + 28 - totalClichesCount * 11)));

  // 2. Без воды (Плотность информации и вводный балласт)
  const waterFound: Array<{ phrase: string; count: number }> = [];
  let totalWaterCount = 0;
  for (const rule of WATER_BALLAST_RULES) {
    const matches = activeText.match(rule.pattern);
    if (matches && matches.length > 0) {
      waterFound.push({ phrase: rule.label, count: matches.length });
      totalWaterCount += matches.length;
    }
  }

  const contentWords = words.filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  const contentRatio = wordCount > 0 ? contentWords.length / wordCount : 0;
  const waterPenalty = wordCount > 0 ? (totalWaterCount * 14) : 0;
  const densityPercent = wordCount === 0
    ? 0
    : Math.max(15, Math.min(99, Math.round(contentRatio * 108 - waterPenalty + 12)));

  // 3. Уникальность (сравнение 3-грамм с исходником + лексическое разнообразие)
  const activeLowerWords = words.map(w => w.toLowerCase());
  const uniqueLemmas = new Set(activeLowerWords.map(w => (w.length > 4 ? w.slice(0, 5) : w)));
  const lexicalDiversityPercent = wordCount === 0
    ? 0
    : Math.min(99, Math.round((uniqueLemmas.size / wordCount) * 100));

  const srcWords = extractWordTokens(sourceText);
  let shingleOverlapPercent = 0;
  let uniquenessPercent = 0;
  if (wordCount >= 3 && srcWords.length >= 3) {
    if (activeText.trim() === sourceText.trim()) {
      shingleOverlapPercent = 100;
      uniquenessPercent = Math.max(0, Math.round(lexicalDiversityPercent * 0.15));
    } else {
      const srcGrams = build3Grams(srcWords);
      const actGrams = build3Grams(words);
      let overlap = 0;
      actGrams.forEach(g => {
        if (srcGrams.has(g)) overlap += 1;
      });
      shingleOverlapPercent = actGrams.size > 0 ? Math.round((overlap / actGrams.size) * 100) : 0;
      uniquenessPercent = Math.max(5, Math.min(99, 100 - shingleOverlapPercent));
    }
  } else if (wordCount > 0) {
    uniquenessPercent = lexicalDiversityPercent;
  }

  // 4. Объём и тайминг диктора (строго 130 слов/мин)
  const narrationSeconds = Math.round((wordCount / 130) * 60);
  const mins = Math.floor(narrationSeconds / 60);
  const secs = narrationSeconds % 60;
  const narrationFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const remainingDigitsCount = (activeText.match(/\d+/g) || []).length;
  const yoCount = (activeText.match(/[ёЁ]/g) || []).length;
  const missingYoCheck = restoreYoInRussianText(activeText);
  const missingYoCount = missingYoCheck.restoredCount;

  // Подсчёт частых повторов слов
  const freqMap = new Map<string, number>();
  for (const w of activeLowerWords) {
    if (w.length >= 4 && !STOP_WORDS.has(w)) {
      const stem = w.slice(0, Math.max(4, w.length - 1));
      freqMap.set(stem, (freqMap.get(stem) || 0) + 1);
    }
  }
  let repeatWordsCount = 0;
  freqMap.forEach(count => {
    if (count >= 3) repeatWordsCount += 1;
  });

  return {
    wordCount,
    charCount,
    sentenceCount,
    burstinessPercent,
    humanityScore,
    clichesFound,
    totalClichesCount,
    densityPercent,
    waterFound,
    totalWaterCount,
    uniquenessPercent,
    shingleOverlapPercent,
    lexicalDiversityPercent,
    narrationSeconds,
    narrationFormatted,
    remainingDigitsCount,
    yoCount,
    missingYoCount,
    repeatWordsCount
  };
}

// ============================================================================
// ЦВЕТОВОЙ РЕНТГЕН ТЕКСТА (X-RAY: КРАСНЫЙ - ИИ-ШТАМПЫ, ГОЛУБОЙ - ВОДА, ЯНТАРНЫЙ - ПОВТОРЫ)
// ============================================================================
export function buildXrayTokens(text: string): XrayToken[] {
  if (!text) return [];

  interface MatchSpan {
    start: number;
    end: number;
    kind: 'cliche' | 'water' | 'repeat';
    reason: string;
    replacements: string[];
  }

  const spans: MatchSpan[] = [];

  const collectRules = (rules: PatternReplacementRule[], kind: 'cliche' | 'water') => {
    for (const rule of rules) {
      const rx = new RegExp(rule.pattern.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = rx.exec(text)) !== null) {
        if (m[0].length === 0) break;
        spans.push({
          start: m.index,
          end: m.index + m[0].length,
          kind,
          reason: rule.reason,
          replacements: rule.replacements
        });
      }
    }
  };

  collectRules(AI_CLICHE_RULES, 'cliche');
  collectRules(WATER_BALLAST_RULES, 'water');

  // Поиск частых повторов слов (>= 3 раз в тексте)
  const wordRegex = /[а-яёa-z]{4,}/gi;
  const stemCounts = new Map<string, number>();
  const wordMatches: Array<{ word: string; start: number; end: number; stem: string }> = [];
  let wm: RegExpExecArray | null;
  while ((wm = wordRegex.exec(text)) !== null) {
    const lower = wm[0].toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    const stem = lower.slice(0, Math.max(4, lower.length - 1));
    stemCounts.set(stem, (stemCounts.get(stem) || 0) + 1);
    wordMatches.push({
      word: wm[0],
      start: wm.index,
      end: wm.index + wm[0].length,
      stem
    });
  }

  for (const item of wordMatches) {
    const count = stemCounts.get(item.stem) || 0;
    if (count >= 3) {
      spans.push({
        start: item.start,
        end: item.end,
        kind: 'repeat',
        reason: `Частый повтор основы (${count}× в тексте)`,
        replacements: ['этот факт', 'деталь', 'элемент', '']
      });
    }
  }

  // Сортировка и разрешение пересечений (приоритет: cliche > water > repeat)
  const priority = { cliche: 3, water: 2, repeat: 1 };
  spans.sort((a, b) => a.start - b.start || priority[b.kind] - priority[a.kind]);

  const accepted: MatchSpan[] = [];
  for (const sp of spans) {
    const overlaps = accepted.some(acc => !(sp.end <= acc.start || sp.start >= acc.end));
    if (!overlaps) {
      accepted.push(sp);
    }
  }

  const tokens: XrayToken[] = [];
  let cursor = 0;
  for (const sp of accepted) {
    if (sp.start > cursor) {
      tokens.push({ text: text.slice(cursor, sp.start), kind: 'normal' });
    }
    tokens.push({
      text: text.slice(sp.start, sp.end),
      kind: sp.kind,
      reason: sp.reason,
      replacements: sp.replacements
    });
    cursor = sp.end;
  }
  if (cursor < text.length) {
    tokens.push({ text: text.slice(cursor), kind: 'normal' });
  }

  return tokens;
}

// ============================================================================
// ЛОКАЛЬНЫЙ FALLBACK-ОБРАБОТЧИК: РЕРАЙТ & АНТИ-ИИ
// ============================================================================
const SYNONYM_DICTIONARY: Array<[RegExp, string]> = [
  [/\bосуществлял([а-я]*)\b/gi, 'проводил$1'],
  [/\bявляется\b/gi, 'остаётся'],
  [/\bданный\b/gi, 'этот'],
  [/\bданная\b/gi, 'эта'],
  [/\bданное\b/gi, 'это'],
  [/\bданные\b/gi, 'эти'],
  [/\bнаходился\b/gi, 'стоял'],
  [/\bпроисходило\b/gi, 'творилось'],
  [/\bнеобходимо\b/gi, 'нужно'],
  [/\bимеет место\b/gi, 'случается'],
  [/\bвследствие этого\b/gi, 'из-за этого'],
  [/\bпосле чего\b/gi, 'затем'],
  [/\bсущественно\b/gi, 'резко'],
  [/\bзначительно\b/gi, 'заметно'],
  [/\bдостаточно\b/gi, 'весьма'],
  [/\bчрезвычайно\b/gi, 'предельно'],
  [/\bуникальный\b/gi, 'редкий'],
  [/\bзагадочный\b/gi, 'необъяснимый'],
  [/\bстранного\b/gi, 'аномального'],
  [/\bофициально\b/gi, 'по бумагам'],
  [/\bперсонал\b/gi, 'дежурная смена'],
  [/\bархивах\b/gi, 'закрытых фондах'],
  [/\bнашли\b/gi, 'подняли со дна архива'],
  [/\bзакрыли\b/gi, 'опечатали'],
  [/\bподписал\b/gi, 'скрепил подписью'],
  [/\bпродолжали\b/gi, 'не переставали']
];

export function localRewriteScript(
  sourceText: string,
  options: {
    tone: VerbaTone;
    mode: VerbaRewriteMode;
    preserveFacts: boolean;
    numbersToWords: boolean;
  }
): string {
  const raw = sourceText.trim();
  if (!raw) return '';

  let out = raw;

  // 1. Удаляем или заменяем все ИИ-штампы и вводную воду
  for (const rule of AI_CLICHE_RULES) {
    const rep = rule.replacements.find(r => r !== '') || '';
    out = out.replace(rule.pattern, m => (rep ? preserveCaseReplace(m, rep) : ''));
  }

  for (const rule of WATER_BALLAST_RULES) {
    const rep = options.mode === 'dry_water' ? '' : rule.replacements[0] || '';
    out = out.replace(rule.pattern, m => (rep ? preserveCaseReplace(m, rep) : ''));
  }

  // 2. Синонимизация при глубоком рерайте или очеловечивании
  if (options.mode === 'deep_rewrite' || options.mode === 'humanize') {
    for (const [rx, rep] of SYNONYM_DICTIONARY) {
      out = out.replace(rx, m => preserveCaseReplace(m, rep));
    }
  }

  // 3. Разбиваем слишком длинные предложения для человеческой ритмики (Burstiness)
  if (options.mode !== 'gentle_edit') {
    out = out
      .replace(/,\s+(но|однако|а|хотя|причем|причём)\s+/gi, '. Но ')
      .replace(/,\s+чтобы\s+/gi, ' — чтобы ')
      .replace(/;\s+/g, '. ');
  }

  // 4. Если preserveFacts выключен, сглаживаем сухие даты в начале предложений
  if (!options.preserveFacts) {
    out = out.replace(/^(?:В|в)\s+\d{4}\s+году,?\s*/gm, 'В ту ночь, когда всё началось, ');
  }

  // 5. Тональные интонационные штрихи
  const sentences = out
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (options.mode !== 'dry_water' && sentences.length >= 2) {
    const toneOpeners: Record<VerbaTone, string> = {
      doc: '',
      storyteller: 'Представьте картину: ',
      truecrime: 'Деталь из протокола, от которой холодеет спина: ',
      scipop: 'Если взглянуть на факты без домыслов: ',
      dynamic: 'Всё решилось за считанные минуты. ',
      neutral: ''
    };
    const opener = toneOpeners[options.tone];
    if (opener && !sentences[0].startsWith(opener.trim())) {
      const firstChar = sentences[0][0];
      const loweredFirst =
        options.tone === 'dynamic'
          ? sentences[0]
          : firstChar.toLowerCase() + sentences[0].slice(1);
      sentences[0] = opener + loweredFirst;
    }

    if (options.tone === 'storyteller' || options.tone === 'truecrime') {
      const lastIdx = sentences.length - 1;
      if (!sentences[lastIdx].includes('?')) {
        sentences[lastIdx] = `${sentences[lastIdx]} Но как такое возможно?`;
      }
    }
  }

  out = sentences.join(' ').replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

  if (options.numbersToWords) {
    out = convertNumbersAndAbbreviations(out).text;
  }

  out = restoreYoInRussianText(out).text;
  return out;
}

// ============================================================================
// ЛОКАЛЬНЫЙ ГЕНЕРАТОР YOUTUBE-ХУКОВ (15-СЕК И ПАК ИЗ 5 ВАРИАНТОВ)
// ============================================================================
export function localGenerateHooks(sourceText: string, tone: VerbaTone): {
  hooks: VerbaHookCard[];
  rewrittenBody: string;
} {
  const clean = sourceText.trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const coreFact = (sentences[0] || 'В закрытом архиве нашли запись аномального сигнала')
    .replace(/^(?:В|в)\s+\d{4}\s+году,?\s*/i, '')
    .replace(/[.!?]+$/, '');
  const coreSecond = (sentences[1] || 'Объект опечатали за сутки и засекретили на полвека')
    .replace(/[.!?]+$/, '');

  const hooks: VerbaHookCard[] = [
    {
      id: 'hook-paradox',
      archetype: 'paradox',
      archetypeLabel: 'Парадокс',
      durationSec: 14,
      visualCue: 'Резкий наезд камеры на мигающий красный индикатор магнитофона в темноте',
      hookText: `По документам здесь не осталось ни одного живого человека. Но кто тогда держал сигнал в эфире ещё три недели после того, как ${coreFact.charAt(0).toLowerCase() + coreFact.slice(1)}?`
    },
    {
      id: 'hook-in-media-res',
      archetype: 'in_media_res',
      archetypeLabel: 'In Media Res',
      durationSec: 13,
      visualCue: 'Ручная камера, тревожный гул сирены, стрелка осциллографа бьёт в красную зону',
      hookText: `Три часа ночи. Связь обрывается, а на столе продолжает крутиться бобина с записью. ${coreSecond} — но самое страшное осталось за кадром.`
    },
    {
      id: 'hook-clue',
      archetype: 'clue',
      archetypeLabel: 'Улика',
      durationSec: 15,
      visualCue: 'На стол падает папка с грифом «Совершенно секретно», макросъёмка подписи',
      hookText: `Одна строчка в рассекреченной описи ломает официальную версию целиком: ${coreFact}. И именно из-за этой детали папку спрятали под пятидесятилетний запрет.`
    },
    {
      id: 'hook-question',
      archetype: 'question',
      archetypeLabel: 'Вопрос',
      durationSec: 12,
      visualCue: 'Аэрооблёт заснеженного периметра, луч прожектора режет пургу',
      hookText: `Что должно случиться за закрытыми дверями, чтобы опытная смена бросила аппаратуру за двадцать четыре часа? Ответ начинается с момента, когда ${coreFact.charAt(0).toLowerCase() + coreFact.slice(1)}.`
    },
    {
      id: 'hook-contrast',
      archetype: 'contrast',
      archetypeLabel: 'Контраст',
      durationSec: 15,
      visualCue: 'Сплит-экран: тихий белый лист отчёта слева и пульсирующая зелёная волна звука справа',
      hookText: `На бумаге — обычная лавина и пустой рапорт. В реальности — ${coreSecond.charAt(0).toLowerCase() + coreSecond.slice(1)}, а приборы продолжали работать без единого источника питания.`
    }
  ];

  const rewrittenBody = localRewriteScript(clean, {
    tone,
    mode: 'humanize',
    preserveFacts: true,
    numbersToWords: false
  });

  return { hooks, rewrittenBody };
}

// ============================================================================
// ЛОКАЛЬНАЯ ПОКАДРОВАЯ РАЗБИВКА НА СЦЕНЫ С ВИДЕО-ПРОМТАМИ И SFX
// ============================================================================
function inferVisualAtmosphere(line: string, index: number): {
  subjectEn: string;
  subjectRu: string;
  sfx: string;
} {
  const lower = line.toLowerCase();
  if (/кассет|пл[её]нк|запис|гул|сигнал|радио|звук|частот|tape|audio|hum/.test(lower)) {
    return {
      subjectEn: 'macro shot of vintage analog reel-to-reel tape recorder spinning in dark room, glowing oscilloscope waveform',
      subjectRu: 'Макрокадр винтажного бобинного магнитофона в темноте и пульсирующая волна осциллографа',
      sfx: 'Аналоговый магнитный треск, низкий саб-бас 45 Гц, щелчок тумблера'
    };
  }
  if (/станц|альп|снег|лавин|бункер|гор|зима|station|alpine|avalanche/.test(lower)) {
    return {
      subjectEn: 'aerial wide shot of isolated snowbound high-altitude research outpost during twilight blizzard, tungsten window light',
      subjectRu: 'Широкий облёт заснеженной высокогорной станции в сумерках, тёплый свет одинокого окна сквозь пургу',
      sfx: 'Вой высокогорного ветра, глухой хруст снега, далёкий гул металла'
    };
  }
  if (/архив|документ|папк|верси|подпис|неразглашен|секрет|archive|report|file/.test(lower)) {
    return {
      subjectEn: 'top-down cinematic shot of declassified archival dossier folders and stamped documents under harsh desk lamp',
      subjectRu: 'Вид сверху на рассекреченные архивные папки, печати и документы в жёстком свете настольной лампы',
      sfx: 'Шелест плотной бумаги, чёткий стук штампа, напряжённый тикающий пульс'
    };
  }
  if (/прибор|экран|датчик|маяк|переда|instrument|screen|sensor/.test(lower)) {
    return {
      subjectEn: 'close-up of retro control panel with blinking amber and red indicator lights, dust particles in volumetric beam',
      subjectRu: 'Крупный план приборной панели с мигающими янтарными индикаторами и пылинками в луче света',
      sfx: 'Ритмичный писк телеметрии, электрический фон трансформатора'
    };
  }

  const fallbacks = [
    {
      subjectEn: 'moody cinematic tracking shot through dimly lit concrete corridor, cold cyan rim lighting and drifting fog',
      subjectRu: 'Напряжённый проход камеры по полутёмному бетонному коридору в холодном контровом свете',
      sfx: 'Глубокий эмбиент-дрон, эхо шагов, приглушённый металлический гул'
    },
    {
      subjectEn: 'dramatic silhouette of investigator examining glowing monitor screen in dark command room, shallow depth of field',
      subjectRu: 'Силуэт исследователя перед светящимся монитором в тёмной аппаратной',
      sfx: 'Тихий гул кулеров, лёгкий саспенс-свип на нарастании'
    }
  ];
  return fallbacks[index % fallbacks.length];
}

export function localSliceToScenes(text: string, tone: VerbaTone): VerbaScenePromptCard[] {
  const cleaned = text
    .replace(/\[(?:пауза|pause|Бит|Beat|SHORTS|Open Loop|Кадр|Shot|Visual)[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) return [];

  const rawSentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Группируем слишком короткие фразы (< 4 слов) или разбиваем длинные (> 18 слов)
  const segments: string[] = [];
  for (const sent of rawSentences) {
    const words = sent.split(/\s+/).filter(Boolean);
    if (words.length > 18) {
      const mid = Math.ceil(words.length / 2);
      segments.push(words.slice(0, mid).join(' '));
      segments.push(words.slice(mid).join(' '));
    } else if (words.length < 4 && segments.length > 0) {
      segments[segments.length - 1] = `${segments[segments.length - 1]} ${sent}`;
    } else {
      segments.push(sent);
    }
  }

  const cameraMoves = [
    'slow dolly-in, 35mm anamorphic lens',
    'smooth gimbal orbit, shallow depth of field',
    'locked tripod macro framing, subtle rack focus',
    'low-angle atmospheric push-in, 50mm prime',
    'handheld documentary micro-movement, 24fps'
  ];

  const toneLighting: Record<VerbaTone, string> = {
    doc: 'cinematic documentary lighting, natural contrast, Kodak 2383 color grade',
    storyteller: 'warm tungsten key light with cool slate shadows, atmospheric haze',
    truecrime: 'noir chiaroscuro lighting, flickering fluorescent reflections, high contrast',
    scipop: 'crisp clean studio rim lighting, subtle cyan accent glow, hyper-detailed',
    dynamic: 'high-energy dramatic backlighting, fast shutter crispness, rich color depth',
    neutral: 'balanced overcast natural lighting, sharp architectural geometry'
  };

  const formatMMSS = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  let cursor = 0;
  return segments.map((line, idx) => {
    const wc = extractWordTokens(line).length;
    const durationSec = Math.max(4, Math.min(8, Math.round((wc / 130) * 60) || 5));
    const startStr = formatMMSS(cursor);
    const endStr = formatMMSS(cursor + durationSec);
    cursor += durationSec;

    const atm = inferVisualAtmosphere(line, idx);
    const cam = cameraMoves[idx % cameraMoves.length];
    const light = toneLighting[tone];

    return {
      sceneIndex: idx + 1,
      timecodeRange: `${startStr}–${endStr}`,
      startTime: startStr,
      durationSec,
      scriptLine: line,
      promptEn: `Cinematic 4K shot: ${atm.subjectEn}, ${cam}, ${light}, photorealistic, 8k, --ar 16:9`,
      promptRu: `${atm.subjectRu}. Камера: ${cam.includes('dolly') ? 'медленный наезд' : cam.includes('orbit') ? 'плавный облёт' : cam.includes('macro') ? 'статичное макро с переводом фокуса' : 'атмосферное движение камеры'}.`,
      sfx: atm.sfx
    };
  });
}
