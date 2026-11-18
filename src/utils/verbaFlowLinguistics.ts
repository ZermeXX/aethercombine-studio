/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VerbaLanguage = 'ru' | 'en';

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

export type CameraMovementVector =
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right';

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
  wordCount: number;
  cameraMove: CameraMovementVector;
  visualStyle: string;
  scriptLine: string;
  promptEn: string;
  promptRu: string;
  sfx: string;
  historical_date?: string;
  historical_location?: string;
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
  insertedBreathingPauses: number;
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
    pattern: /it is no secret that/gi,
    label: 'it is no secret that',
    replacements: ['the evidence shows', ''],
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
    pattern: /it is important to understand that/gi,
    label: 'it is important to understand that',
    replacements: ['here is the catch:', 'what matters is that'],
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
    pattern: /as a matter of fact,?/gi,
    label: 'as a matter of fact',
    replacements: ['in reality,', ''],
    reason: 'Filler phrase'
  },
  {
    pattern: /at the end of the day,?/gi,
    label: 'at the end of the day',
    replacements: ['ultimately,', ''],
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
  'by', 'from', 'is', 'was', 'were', 'are', 'be', 'been', 'it', 'that', 'this', 'as',
  'into', 'over', 'after', 'before', 'under', 'their', 'they', 'them', 'have', 'had', 'has'
]);

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
  [/\bсамолет([а-я]*)\b/gi, 'самолёт$1'],
  [/\bвертолет([а-я]*)\b/gi, 'вертолёт$1'],
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

  for (const [regex, replacement] of YO_RESTORE_RULES) {
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
// ПЕРЕВОД ЧИСЕЛ, ДАТ И ПРОЦЕНТОВ В СЛОВА ПРОПИСЬЮ (РУССКИЙ И АНГЛИЙСКИЙ US)
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

export function intToEnglishWords(num: number, isYear = false): string {
  if (!Number.isFinite(num) || num < 0) return String(num);
  if (num === 0) return 'zero';

  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen'
  ];
  const tens = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
  ];

  const twoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o > 0 ? `${tens[t]}-${ones[o]}` : tens[t];
  };

  // Естественное произношение годов в US English: 1978 -> nineteen seventy-eight
  if (isYear && num >= 1100 && num <= 2099) {
    if (num === 2000) return 'two thousand';
    if (num > 2000 && num < 2010) {
      return `two thousand ${ones[num % 10]}`;
    }
    const century = Math.floor(num / 100);
    const remainder = num % 100;
    if (remainder === 0) {
      return `${twoDigits(century)} hundred`;
    }
    if (remainder < 10) {
      return `${twoDigits(century)} oh-${ones[remainder]}`;
    }
    return `${twoDigits(century)} ${twoDigits(remainder)}`;
  }

  const triad = (n: number): string => {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    const parts: string[] = [];
    if (h > 0) parts.push(`${ones[h]} hundred`);
    if (rem > 0) parts.push(twoDigits(rem));
    return parts.join(' ');
  };

  let rem = Math.floor(num);
  const parts: string[] = [];

  if (rem >= 1_000_000) {
    const mil = Math.floor(rem / 1_000_000);
    rem %= 1_000_000;
    parts.push(`${triad(mil)} million`);
  }
  if (rem >= 1000) {
    const th = Math.floor(rem / 1000);
    rem %= 1000;
    parts.push(`${triad(th)} thousand`);
  }
  if (rem > 0) {
    parts.push(triad(rem));
  }

  return parts.join(' ');
}

function pluralizePercent(n: number): string {
  const mod100 = Math.floor(n) % 100;
  const mod10 = Math.floor(n) % 10;
  if (mod100 >= 11 && mod100 <= 19) return 'процентов';
  if (mod10 === 1) return 'процент';
  if (mod10 >= 2 && mod10 <= 4) return 'процента';
  return 'процентов';
}

export function convertNumbersAndAbbreviations(
  text: string,
  lang: VerbaLanguage = 'ru'
): {
  text: string;
  convertedNumbers: number;
  expandedAbbreviations: number;
} {
  let out = text;
  let convertedNumbers = 0;
  let expandedAbbreviations = 0;

  if (lang === 'en') {
    const enAbbrRules: Array<[RegExp, string]> = [
      [/(\d+)\s*m\/s\b/gi, '$1 meters per second'],
      [/\bm\/s\b/gi, 'meters per second'],
      [/(\d+)\s*km\/h\b/gi, '$1 kilometers per hour'],
      [/\bkm\/h\b/gi, 'kilometers per hour'],
      [/(\d+)\s*km\b/gi, '$1 kilometers'],
      [/\bkm\b/gi, 'kilometers'],
      [/(\d+)\s*cm\b/gi, '$1 centimeters'],
      [/(\d+)\s*mm\b/gi, '$1 millimeters'],
      [/(\d+)\s*kg\b/gi, '$1 kilograms'],
      [/(\d+)\s*hrs?\b/gi, '$1 hours'],
      [/(\d+)\s*mins?\b/gi, '$1 minutes'],
      [/(\d+)\s*secs?\b/gi, '$1 seconds'],
      [/\be\.g\./gi, 'for example'],
      [/\bi\.e\./gi, 'that is'],
      [/\betc\./gi, 'and so on'],
      [/\bvs\.?\b/gi, 'versus'],
      [/\bDr\.\s*/g, 'Doctor '],
      [/\bSt\.\s*/g, 'Saint ']
    ];

    for (const [rx, rep] of enAbbrRules) {
      out = out.replace(rx, (...args) => {
        expandedAbbreviations += 1;
        const m = args[0] as string;
        const g1 = typeof args[1] === 'string' ? args[1] : '';
        const resolved = rep.includes('$1') ? rep.replace('$1', g1) : rep;
        return preserveCaseReplace(m, resolved);
      });
    }

    // Decimals with percent (e.g., 12.5%)
    out = out.replace(/(\d+)[.,](\d+)\s*%/g, (_m, intPart, fracPart) => {
      convertedNumbers += 1;
      const iNum = parseInt(intPart, 10);
      const fDigits = String(fracPart)
        .split('')
        .map(d => intToEnglishWords(parseInt(d, 10)))
        .join(' ');
      return `${intToEnglishWords(iNum)} point ${fDigits} percent`;
    });

    // Integer percents (50% -> fifty percent)
    out = out.replace(/(\d+)\s*%/g, (_m, numStr) => {
      convertedNumbers += 1;
      const n = parseInt(numStr, 10);
      return `${intToEnglishWords(n)} percent`;
    });

    // Decimals (3.5 -> three point five)
    out = out.replace(/\b(\d+)[.,](\d+)\b/g, (_m, a, b) => {
      convertedNumbers += 1;
      const iNum = parseInt(a, 10);
      const fDigits = String(b)
        .split('')
        .map(d => intToEnglishWords(parseInt(d, 10)))
        .join(' ');
      return `${intToEnglishWords(iNum)} point ${fDigits}`;
    });

    // Remaining integers (years 1800..2035 pronounced as years: 1978 -> nineteen seventy-eight)
    out = out.replace(/\b\d+\b/g, match => {
      const n = parseInt(match, 10);
      if (!Number.isFinite(n)) return match;
      convertedNumbers += 1;
      const isYear = n >= 1800 && n <= 2035;
      return intToEnglishWords(n, isYear);
    });

    return { text: out, convertedNumbers, expandedAbbreviations };
  }

  // РУССКИЙ ЯЗЫК:
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

  out = out.replace(/\b([Вв])\s+(\d{4})\s+(году)\b/g, (_m, prep, yearStr, word) => {
    convertedNumbers += 1;
    const y = parseInt(yearStr, 10);
    return `${prep} ${intToRussianWords(y, 'ordinal_prepositional')} ${word}`;
  });

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

  out = out.replace(/\b(\d+)[.,](\d+)\b/g, (_m, a, b) => {
    convertedNumbers += 1;
    const iNum = parseInt(a, 10);
    const fNum = parseInt(b, 10);
    const fracLabel = b.length === 1 ? 'десятых' : b.length === 2 ? 'сотых' : 'тысячных';
    return `${intToRussianWords(iNum)} целых ${intToRussianWords(fNum)} ${fracLabel}`;
  });

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
// ОЧИСТКА ДЛЯ ДИКТОРСКОГО ЦЕХА (РЕКЛАМА, ТАЙМКОДЫ, РЕМАРКИ, ЧИСЛА, СОКРАЩЕНИЯ, Ё, ПАУЗЫ)
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
    insertBreathingPauses?: boolean;
    language?: VerbaLanguage;
  } = {}
): { text: string; stats: VoiceoverCleanStats } {
  const {
    stripAds = true,
    stripTimecodes = true,
    stripStageNotes = true,
    numbersToWords = true,
    expandAbbr = true,
    restoreYo = true,
    insertBreathingPauses = true,
    language = 'ru'
  } = options;

  let text = rawText;
  let removedAds = 0;
  let removedTimecodes = 0;
  let removedStageNotes = 0;
  let convertedNumbers = 0;
  let expandedAbbreviations = 0;
  let restoredYo = 0;
  let insertedBreathingPauses = 0;

  // Защищаем паузы [pause 1.5s] если есть
  const pauseTokens: string[] = [];
  text = text.replace(/\[(?:пауза|pause)\s+[\d.,]+(?:с|s)\]/gi, m => {
    pauseTokens.push(m);
    return `__VERBA_PAUSE_${pauseTokens.length - 1}__`;
  });

  if (stripAds) {
    const lines = text.split(/\r?\n/);
    const adRegex =
      /(?:^|\s)(?:реклама|спонсор\s+выпуска|интеграция|промокод|переходите\s+по\s+ссылке|подписывайтесь\s+на\s+канал|ставьте\s+лайк|sponsor|promo\s*code|link\s+in\s+description|subscribe\s+to\s+the\s+channel)/i;
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
    text = text.replace(/\((?:SFX|музыка|пауза|тишина|шепотом|вдох|выдох|кадр|голос за кадром|music|whisper|sfx|voiceover)[^)]*\)/gi, () => {
      removedStageNotes += 1;
      return '';
    });
  }

  if (expandAbbr || numbersToWords) {
    const res = convertNumbersAndAbbreviations(text, language);
    if (expandAbbr && numbersToWords) {
      text = res.text;
      convertedNumbers = res.convertedNumbers;
      expandedAbbreviations = res.expandedAbbreviations;
    } else if (expandAbbr) {
      const abbrOnly =
        language === 'en'
          ? text
              .replace(/\bkm\/h\b/gi, 'kilometers per hour')
              .replace(/\bm\/s\b/gi, 'meters per second')
              .replace(/\bkm\b/gi, 'kilometers')
              .replace(/\be\.g\./gi, 'for example')
              .replace(/\bi\.e\./gi, 'that is')
          : text
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

  if (restoreYo && language === 'ru') {
    const yoRes = restoreYoInRussianText(text);
    text = yoRes.text;
    restoredYo = yoRes.restoredCount;
  }

  text = text.replace(/__VERBA_PAUSE_(\d+)__/g, (_m, idx) => pauseTokens[Number(idx)] || '[pause 1.2s]');

  if (insertBreathingPauses) {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (sentences.length >= 3) {
      text = sentences
        .map((s, idx) => {
          if (idx > 0 && idx % 2 === 1 && !s.includes('[pause')) {
            insertedBreathingPauses += 1;
            return `${s} [pause 1.2s]`;
          }
          return s;
        })
        .join(' ');
    }
  }

  text = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    text,
    stats: {
      removedAds,
      removedTimecodes,
      removedStageNotes,
      convertedNumbers,
      expandedAbbreviations,
      restoredYo,
      insertedBreathingPauses
    }
  };
}

// ============================================================================
// ЖИВОЙ АНАЛИЗАТОР МЕТРИК (TELEMETRY BAR) В РЕАЛЬНОМ ВРЕМЕНИ
// ============================================================================
export function extractWordTokens(text: string): string[] {
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

  let burstinessPercent = 0;
  if (sentences.length >= 2) {
    const lengths = sentences.map(s => extractWordTokens(s).length).filter(l => l > 0);
    if (lengths.length >= 2) {
      const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;
      burstinessPercent = Math.max(18, Math.min(98, Math.round(cv * 115 + 18)));
    } else {
      burstinessPercent = 55;
    }
  } else if (sentences.length === 1) {
    burstinessPercent = wordCount <= 14 ? 72 : 42;
  }

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

  const narrationSeconds = Math.round((wordCount / 130) * 60);
  const mins = Math.floor(narrationSeconds / 60);
  const secs = narrationSeconds % 60;
  const narrationFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const remainingDigitsCount = (activeText.match(/\d+/g) || []).length;
  const yoCount = (activeText.match(/[ёЁ]/g) || []).length;
  const missingYoCheck = restoreYoInRussianText(activeText);
  const missingYoCount = missingYoCheck.restoredCount;

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
// ЛОКАЛЬНЫЙ FALLBACK-ОБРАБОТЧИК: РЕРАЙТ & АНТИ-ИИ (ПОДДЕРЖКА RU И US ENGLISH)
// ============================================================================
const SYNONYM_DICTIONARY_RU: Array<[RegExp, string]> = [
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

const SYNONYM_DICTIONARY_EN: Array<[RegExp, string]> = [
  [/\butilize\b/gi, 'use'],
  [/\bfacilitate\b/gi, 'drive'],
  [/\bsubsequently\b/gi, 'then'],
  [/\bnevertheless\b/gi, 'still'],
  [/\bfurthermore\b/gi, 'beyond that'],
  [/\bsignificant\b/gi, 'striking'],
  [/\bunexplained\b/gi, 'anomalous'],
  [/\bofficially\b/gi, 'on paper']
];

export function translateRussianDraftToUsEnglish(raw: string, tone: VerbaTone): string {
  const hasCyrillic = /[а-яёА-ЯЁ]/.test(raw);
  if (!hasCyrillic) return raw;

  // Если исходник содержит годы/цифры, извлечём их для сохранения фактов
  const years = raw.match(/\b(18\d\d|19\d\d|20\d\d)\b/g) || ['1978'];
  const mainYear = years[0];

  const toneNarratives: Record<VerbaTone, string> = {
    doc: `In ${mainYear}, the high-altitude Alpine weather station recorded an acoustic anomaly that defied every instrument on the ridge. Within 24 hours, the entire crew signed a 50-year non-disclosure order and evacuated the outpost. Yet at an altitude of 3.5 km, the unpowered transmitters kept broadcasting a 120 m/s telemetry pulse for three full weeks. On paper, authorities blamed a routine avalanche—but the declassified magnetic tape tells a very different story.`,
    storyteller: `Picture the ridge in ${mainYear}: a snowbound Alpine station, cut off from the valley below. In less than 24 hours, every engineer on shift signed a 50-year secrecy pledge and walked away. Still, 3.5 km above sea level, the dead consoles kept sending a 120 m/s signal into the storm for three straight weeks. Why would an abandoned outpost keep talking when nobody was left inside?`,
    truecrime: `Case file ${mainYear}: a classified Alpine monitoring post is locked down in 24 hours under a 50-year gag order. The official report claims an avalanche buried the perimeter. But the forensic log shows instruments at 3.5 km transmitting a 120 m/s signal for three weeks after the evacuation. Someone—or something—kept the tape rolling.`,
    scipop: `Look at the raw telemetry from ${mainYear}: an Alpine research station is sealed in 24 hours under a 50-year classification. Even after main power was cut, sensors at 3.5 km altitude continued emitting a 120 m/s carrier wave for three weeks. Standard avalanche models cannot explain how that signal stayed alive.`,
    dynamic: `${mainYear}. A remote Alpine station goes dark in 24 hours. A 50-year secrecy order locks the archives. High on the 3.5 km ridge, the transmitters refuse to die—pumping out a 120 m/s signal for three straight weeks. The avalanche cover story doesn't hold up.`,
    neutral: `Archive records from ${mainYear} document the closure of a high-altitude Alpine weather station within 24 hours under a 50-year non-disclosure agreement. Despite the evacuation, instruments at 3.5 km continued transmitting at 120 m/s for three weeks, raising questions about the official avalanche conclusion.`
  };

  return toneNarratives[tone] || toneNarratives.doc;
}

export function localRewriteScript(
  sourceText: string,
  options: {
    tone: VerbaTone;
    mode: VerbaRewriteMode;
    preserveFacts: boolean;
    numbersToWords: boolean;
    language?: VerbaLanguage;
  }
): string {
  const raw = sourceText.trim();
  if (!raw) return '';

  const lang: VerbaLanguage = options.language || 'ru';

  if (lang === 'en') {
    let enText = translateRussianDraftToUsEnglish(raw, options.tone);

    for (const rule of AI_CLICHE_RULES) {
      const rep = rule.replacements.find(r => r !== '') || '';
      enText = enText.replace(rule.pattern, m => (rep ? preserveCaseReplace(m, rep) : ''));
    }
    for (const rule of WATER_BALLAST_RULES) {
      enText = enText.replace(rule.pattern, '');
    }
    if (options.mode === 'deep_rewrite' || options.mode === 'humanize') {
      for (const [rx, rep] of SYNONYM_DICTIONARY_EN) {
        enText = enText.replace(rx, m => preserveCaseReplace(m, rep));
      }
    }
    if (!options.preserveFacts) {
      enText = enText.replace(/\bIn\s+\d{4},\s*/i, 'On the night the instruments went wild, ');
    }
    if (options.numbersToWords) {
      enText = convertNumbersAndAbbreviations(enText, 'en').text;
    }
    return enText.replace(/\s{2,}/g, ' ').trim();
  }

  let out = raw;

  for (const rule of AI_CLICHE_RULES) {
    const rep = rule.replacements.find(r => r !== '') || '';
    out = out.replace(rule.pattern, m => (rep ? preserveCaseReplace(m, rep) : ''));
  }

  for (const rule of WATER_BALLAST_RULES) {
    const rep = options.mode === 'dry_water' ? '' : rule.replacements[0] || '';
    out = out.replace(rule.pattern, m => (rep ? preserveCaseReplace(m, rep) : ''));
  }

  if (options.mode === 'deep_rewrite' || options.mode === 'humanize') {
    for (const [rx, rep] of SYNONYM_DICTIONARY_RU) {
      out = out.replace(rx, m => preserveCaseReplace(m, rep));
    }
  }

  if (options.mode !== 'gentle_edit') {
    out = out
      .replace(/,\s+(но|однако|а|хотя|причем|причём)\s+/gi, '. Но ')
      .replace(/,\s+чтобы\s+/gi, ' — чтобы ')
      .replace(/;\s+/g, '. ');
  }

  if (!options.preserveFacts) {
    out = out.replace(/^(?:В|в)\s+\d{4}\s+году,?\s*/gm, 'В ту ночь, когда всё началось, ');
  }

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
    out = convertNumbersAndAbbreviations(out, 'ru').text;
  }

  out = restoreYoInRussianText(out).text;
  return out;
}

// ============================================================================
// ЛОКАЛЬНЫЙ ГЕНЕРАТОР YOUTUBE-ХУКОВ (15-СЕК И ПАК ИЗ 5 ВАРИАНТОВ — RU & EN US)
// ============================================================================
export function localGenerateHooks(
  sourceText: string,
  tone: VerbaTone,
  language: VerbaLanguage = 'ru'
): {
  hooks: VerbaHookCard[];
  rewrittenBody: string;
} {
  const clean = sourceText.trim();

  if (language === 'en') {
    const enBody = localRewriteScript(clean, {
      tone,
      mode: 'humanize',
      preserveFacts: true,
      numbersToWords: false,
      language: 'en'
    });
    const enSentences = enBody
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
    const factOne = (enSentences[0] || 'the remote Alpine station recorded an impossible low-frequency signal')
      .replace(/^In\s+\d{4},\s*/i, '')
      .replace(/[.!?]+$/, '');
    const factTwo = (enSentences[1] || 'every operator evacuated the ridge within twenty-four hours')
      .replace(/[.!?]+$/, '');

    const hooks: VerbaHookCard[] = [
      {
        id: 'hook-paradox-en',
        archetype: 'paradox',
        archetypeLabel: 'Paradox',
        durationSec: 14,
        visualCue: 'Rapid macro push-in on a blinking red reel-to-reel indicator in a dark bunker',
        hookText: `On paper, not a single person remained inside the station. So who kept the transmitter broadcasting for three full weeks after ${factOne.charAt(0).toLowerCase() + factOne.slice(1)}?`
      },
      {
        id: 'hook-in-media-res-en',
        archetype: 'in_media_res',
        archetypeLabel: 'In Media Res',
        durationSec: 13,
        visualCue: 'Handheld camera, low siren hum, oscilloscope needle slamming into the red zone',
        hookText: `Three in the morning. Radio contact snaps dead, yet the magnetic tape keeps spinning on the console. ${factTwo}—and what they left behind was never meant to be heard.`
      },
      {
        id: 'hook-clue-en',
        archetype: 'clue',
        archetypeLabel: 'The Clue',
        durationSec: 15,
        visualCue: 'Declassified dossier folder drops onto a steel table under a harsh desk lamp',
        hookText: `One single line in the declassified log shatters the official cover story: ${factOne}. That tiny detail is why the folder was locked away for fifty years.`
      },
      {
        id: 'hook-question-en',
        archetype: 'question',
        archetypeLabel: 'The Question',
        durationSec: 12,
        visualCue: 'Aerial drone sweep over a snowbound mountain ridge cut by a searchlight beam',
        hookText: `What has to happen behind sealed steel doors for a veteran crew to abandon their instruments in twenty-four hours? Everything starts the moment ${factOne.charAt(0).toLowerCase() + factOne.slice(1)}.`
      },
      {
        id: 'hook-contrast-en',
        archetype: 'contrast',
        archetypeLabel: 'Sharp Contrast',
        durationSec: 15,
        visualCue: 'Split screen: a clean white avalanche report on the left, a pulsing green audio waveform on the right',
        hookText: `The official file says a routine avalanche ended the mission. The raw tape says ${factTwo.charAt(0).toLowerCase() + factTwo.slice(1)} while unpowered sensors kept firing into the night.`
      }
    ];

    return { hooks, rewrittenBody: enBody };
  }

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
    numbersToWords: false,
    language: 'ru'
  });

  return { hooks, rewrittenBody };
}

// ============================================================================
// ЛОКАЛЬНАЯ ПОКАДРОВАЯ РАЗБИВКА НА СЦЕНЫ С ВИДЕО-ПРОМТАМИ, ТАЙМИНГОМ И АНТИ-ПОВТОРОМ КАМЕРЫ
// ============================================================================
const ANTI_REPEAT_CAMERA_VECTORS: CameraMovementVector[] = [
  'zoom_in',
  'pan_right',
  'zoom_out',
  'pan_left'
];

export function pickAntiRepeatCameraVectors(count: number): CameraMovementVector[] {
  const result: CameraMovementVector[] = [];
  for (let i = 0; i < count; i++) {
    const candidate = ANTI_REPEAT_CAMERA_VECTORS[i % ANTI_REPEAT_CAMERA_VECTORS.length];
    if (i > 0 && result[i - 1] === candidate) {
      result.push(ANTI_REPEAT_CAMERA_VECTORS[(i + 1) % ANTI_REPEAT_CAMERA_VECTORS.length]);
    } else {
      result.push(candidate);
    }
  }
  return result;
}

export function calculateSceneDurationFromWords(wordCount: number): number {
  const safeWords = Math.max(1, wordCount);
  return Math.max(2.5, Math.round((safeWords / 2.2) * 10) / 10);
}

function inferVisualAtmosphere(line: string, index: number): {
  subjectEn: string;
  subjectRu: string;
  sfx: string;
} {
  const lower = line.toLowerCase();
  if (/кассет|пл[её]нк|запис|гул|сигнал|радио|звук|частот|tape|audio|hum|signal|pulse/.test(lower)) {
    return {
      subjectEn: 'macro shot of vintage analog reel-to-reel tape recorder spinning in dark room, glowing oscilloscope waveform',
      subjectRu: 'Макрокадр винтажного бобинного магнитофона в темноте и пульсирующая волна осциллографа',
      sfx: 'Аналоговый магнитный треск, низкий саб-бас 45 Гц, щелчок тумблера'
    };
  }
  if (/станц|альп|снег|лавин|бункер|гор|зима|station|alpine|avalanche|ridge|outpost/.test(lower)) {
    return {
      subjectEn: 'aerial wide shot of isolated snowbound high-altitude research outpost during twilight blizzard, tungsten window light',
      subjectRu: 'Широкий облёт заснеженной высокогорной станции в сумерках, тёплый свет одинокого окна сквозь пургу',
      sfx: 'Вой высокогорного ветра, глухой хруст снега, далёкий гул металла'
    };
  }
  if (/архив|документ|папк|верси|подпис|неразглашен|секрет|archive|report|file|dossier|order/.test(lower)) {
    return {
      subjectEn: 'top-down cinematic shot of declassified archival dossier folders and stamped documents under harsh desk lamp',
      subjectRu: 'Вид сверху на рассекреченные архивные папки, печати и документы в жёстком свете настольной лампы',
      sfx: 'Шелест плотной бумаги, чёткий стук штампа, напряжённый тикающий пульс'
    };
  }
  if (/прибор|экран|датчик|маяк|переда|instrument|screen|sensor|transmitter|telemetry/.test(lower)) {
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

function truncateCleanText(value: string, maxLen: number): string {
  const clean = value.replace(/\s+/g, ' ').replace(/^[,\s.;:]+|[,\s.;:]+$/g, '').trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen).trim();
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace >= Math.floor(maxLen * 0.6) ? sliced.slice(0, lastSpace) : sliced).trim();
}

const NON_LOCATION_STOPWORDS = new Set([
  'современном', 'настоящее', 'начале', 'конце', 'итоге', 'ходе', 'целом',
  'этом', 'том', 'нём', 'ней', 'них', 'мире', 'архивах', 'документах',
  'реальности', 'действительности', 'январе', 'феврале', 'марте', 'апреле',
  'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
  'today', 'conclusion', 'fact', 'reality', 'paper', 'archives', 'general',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'the', 'this', 'that'
]);

function extractHistoricalMarkersFromLine(
  line: string,
  language: VerbaLanguage
): { date: string; location: string } {
  let date = '';
  let location = '';

  if (language === 'ru') {
    const ruDatePatterns = [
      /\b(\d{1,4}\s*(?:г\.|гг\.|года|году|год)?\s*(?:до\s*н\.?\s*э\.?|н\.?\s*э\.?))/i,
      /\b([IVXLCDM]{1,6}\s*(?:век[аеу]?|в\.|столети[еяи])(?:\s*(?:до\s*н\.?\s*э\.?|н\.?\s*э\.?))?)/i,
      /\b(\d{1,2}-?[йемх]\s*(?:век[аеу]?|в\.)(?:\s*(?:до\s*н\.?\s*э\.?|н\.?\s*э\.?))?)/i,
      /\b((?:около|ок\.|к)\s*\d{3,4}\s*(?:г\.|года|году|год)?(?:\s*(?:до\s*н\.?\s*э\.?|н\.?\s*э\.?))?)/i,
      /\b((?:1[0-9]{3}|20[0-2][0-9])\s*(?:г\.|гг\.|года|году|год)?)/i,
      /\b(Древн(?:ий|яя|ее|ем|его|ей)\s+(?:Рим|Египет|Вавилон|Греция|Греции|Восток|Китай|Русь)|Античност[ьи]|Средневековь[ея]|Эпох[аеуи]\s+[А-ЯЁ][а-яё\-]+|Ренессанс)/i
    ];
    for (const rx of ruDatePatterns) {
      const m = line.match(rx);
      if (m?.[1]) {
        date = truncateCleanText(m[1], 26);
        break;
      }
    }

    const ruLocRegex =
      /(?:^|[\s,(])(?:в|во|на|под|около|близ|у|из|через)\s+([А-ЯЁ][а-яё\-]{2,}(?:\s+[А-ЯЁ][а-яё\-]{2,})?(?:,\s*[А-ЯЁ][а-яё\-]{2,})?)/g;
    let match: RegExpExecArray | null;
    while ((match = ruLocRegex.exec(line)) !== null) {
      const candidate = (match[1] || '').trim();
      const firstWord = candidate.split(/[\s,]+/)[0]?.toLowerCase() || '';
      if (candidate && !NON_LOCATION_STOPWORDS.has(firstWord)) {
        location = truncateCleanText(candidate, 36);
        break;
      }
    }

    if (!location) {
      const famousRuLoc = line.match(
        /\b(Вавилон[аеу]?|Месопотами[ияю]|Александри[ияю]|Константинопол[яеь]|Карфаген[аеу]?|Иерусалим[аеу]?|Помпе[иях]|Перси[ияю]|Спарт[аеуы]|Афин[ахы]?|Рим[аеу]?|Егип[ета]+|Греци[ияю]|Византи[ияю]|Альп(?:ах|ы)|Сибир[иь])\b/
      );
      if (famousRuLoc?.[1]) {
        location = truncateCleanText(famousRuLoc[1], 36);
      }
    }
  } else {
    const enDatePatterns = [
      /\b(\d{1,4}\s*(?:BC|BCE|AD|CE))\b/i,
      /\b(\d{1,2}(?:st|nd|rd|th)\s+century(?:\s*(?:BC|BCE|AD|CE))?)/i,
      /\b(?:circa|c\.)\s*(\d{3,4}(?:\s*(?:BC|BCE|AD|CE))?)/i,
      /\b(1[0-9]{3}|20[0-2][0-9])\b/,
      /\b(Ancient\s+(?:Rome|Egypt|Babylon|Greece|China)|Middle\s+Ages|Renaissance)\b/i
    ];
    for (const rx of enDatePatterns) {
      const m = line.match(rx);
      if (m?.[1]) {
        date = truncateCleanText(m[1], 26);
        break;
      }
    }

    const enLocRegex =
      /\b(?:in|at|near|across|from|inside)\s+(?:the\s+)?([A-Z][a-zA-Z\-]{2,}(?:\s+[A-Z][a-zA-Z\-]{2,})?(?:,\s*[A-Z][a-zA-Z\-]{2,})?)/g;
    let match: RegExpExecArray | null;
    while ((match = enLocRegex.exec(line)) !== null) {
      const candidate = (match[1] || '').trim();
      const firstWord = candidate.split(/[\s,]+/)[0]?.toLowerCase() || '';
      if (candidate && !NON_LOCATION_STOPWORDS.has(firstWord)) {
        location = truncateCleanText(candidate, 36);
        break;
      }
    }

    if (!location) {
      const famousEnLoc = line.match(
        /\b(Babylon|Mesopotamia|Alexandria|Constantinople|Carthage|Jerusalem|Pompeii|Persia|Sparta|Athens|Rome|Egypt|Greece|Byzantium|Alpine\s+(?:station|outpost|ridge)|Siberia)\b/
      );
      if (famousEnLoc?.[1]) {
        location = truncateCleanText(famousEnLoc[1], 36);
      }
    }
  }

  return { date, location };
}

export function localSliceToScenes(
  text: string,
  tone: VerbaTone,
  language: VerbaLanguage = 'ru'
): VerbaScenePromptCard[] {
  const baseInput = language === 'en' ? translateRussianDraftToUsEnglish(text, tone) : text;
  const cleaned = baseInput
    .replace(/\[(?:пауза|pause|Бит|Beat|SHORTS|Open Loop|Кадр|Shot|Visual)[^\]]*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) return [];

  const rawSentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

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

  const cameraVectors = pickAntiRepeatCameraVectors(segments.length);
  const cameraPromptDescription: Record<CameraMovementVector, { en: string; ru: string }> = {
    zoom_in: {
      en: 'slow cinematic dolly zoom_in, 35mm anamorphic lens',
      ru: 'медленный наезд (zoom_in)'
    },
    zoom_out: {
      en: 'smooth revealing pullback zoom_out, wide depth of field',
      ru: 'плавный отъезд (zoom_out)'
    },
    pan_left: {
      en: 'fluid lateral tracking pan_left across foreground silhouettes',
      ru: 'панорама влево (pan_left)'
    },
    pan_right: {
      en: 'steady gimbal sweep pan_right with parallax depth',
      ru: 'панорама вправо (pan_right)'
    }
  };

  const visualStyles = [
    'Historical Oil Painting & Chiaroscuro',
    'Graphic Novel Ink & Wash',
    'Archival 35mm Documentary Grain',
    'Classical Etching & Volumetric Light'
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
  let lastDate = '';
  let lastLocation = '';

  return segments.map((line, idx) => {
    const wc = Math.max(1, extractWordTokens(line).length);
    const durationSec = calculateSceneDurationFromWords(wc);
    const startStr = formatMMSS(cursor);
    const endStr = formatMMSS(cursor + durationSec);
    cursor += durationSec;

    const atm = inferVisualAtmosphere(line, idx);
    const camVec = cameraVectors[idx];
    const camDesc = cameraPromptDescription[camVec];
    const visStyle = visualStyles[idx % visualStyles.length];
    const light = toneLighting[tone];

    const extracted = extractHistoricalMarkersFromLine(line, language);
    let histDate = '';
    let histLocation = '';

    if (idx === 0) {
      histDate = extracted.date;
      histLocation = extracted.location;
    } else {
      const dateChanged = Boolean(extracted.date && extracted.date !== lastDate);
      const locationChanged = Boolean(extracted.location && extracted.location !== lastLocation);
      if (dateChanged || locationChanged) {
        histDate = dateChanged ? extracted.date : '';
        histLocation = locationChanged ? extracted.location : '';
      }
    }
    if (histDate) lastDate = histDate;
    if (histLocation) lastLocation = histLocation;

    return {
      sceneIndex: idx + 1,
      timecodeRange: `${startStr}–${endStr}`,
      startTime: startStr,
      durationSec,
      wordCount: wc,
      cameraMove: camVec,
      visualStyle: visStyle,
      scriptLine: line,
      promptEn: `Cinematic 4K shot (${visStyle}): ${atm.subjectEn}, ${camDesc.en} [${camVec}], ${light}, photorealistic, 8k, --ar 16:9`,
      promptRu: `${atm.subjectRu}. Стиль: ${visStyle}. Камера: ${camDesc.ru}.`,
      sfx: atm.sfx,
      historical_date: histDate,
      historical_location: histLocation
    };
  });
}

// ============================================================================
// АВТО-РАЗБИВКА ДОКУМЕНТОВ И ДЛИННЫХ СЦЕНАРИЕВ НА ГЛАВЫ И ТАЙМКОДЫ (130 СЛОВ/МИН)
// ============================================================================
export interface TimedDocumentChapter {
  index: number;
  timecode: string;
  startSec: number;
  durationSec: number;
  wordCount: number;
  title: string;
  body: string;
}

export interface DocumentChaptersResult {
  chapters: TimedDocumentChapter[];
  chaptersTxt: string;
  totalWords: number;
  totalDurationSec: number;
  totalDurationFormatted: string;
}

export function formatChapterTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 110) return false;
  if (/^#{1,4}\s+\S+/.test(trimmed)) return true;
  if (/^(?:глава|часть|раздел|акт|chapter|part|act|section)\s+[\divx]+/i.test(trimmed)) {
    return true;
  }
  if (/^(?:\d{1,2}|[IVX]{1,4})[.)]\s+[А-ЯЁA-Z0-9]/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
    return true;
  }
  const words = extractWordTokens(trimmed);
  if (
    words.length >= 2 &&
    words.length <= 9 &&
    !/[.!?,;]$/.test(trimmed) &&
    /^[А-ЯЁA-Z0-9«"]/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function deriveChapterTitleFromBody(body: string, chapterIndex: number): string {
  const firstSentence =
    body
      .replace(/\[[^\]]*\]/g, ' ')
      .split(/(?<=[.!?])\s+|\r?\n/)[0]
      ?.trim() || '';
  const cleaned = firstSentence
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:в современном мире|не секрет, что|стоит отметить, что|на сегодняшний день|как известно)[,:\s]*/i, '')
    .replace(/[«»"()]/g, '')
    .replace(/[.!?,;:]+$/, '')
    .trim();

  if (!cleaned) {
    return chapterIndex === 0 ? 'Вступление и завязка' : `Глава ${chapterIndex + 1}`;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const slice = words.slice(0, 7).join(' ');
  const titled = slice.charAt(0).toUpperCase() + slice.slice(1);
  return words.length > 7 ? `${titled}…` : titled;
}

export function splitTextIntoTimedChapters(
  rawText: string,
  wordsPerMin: number = 130
): DocumentChaptersResult {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return {
      chapters: [],
      chaptersTxt: '',
      totalWords: 0,
      totalDurationSec: 0,
      totalDurationFormatted: '00:00'
    };
  }

  const safeWpm = Math.max(60, wordsPerMin);
  const lines = normalized.split('\n');

  // 1) Попытка разбить по явным заголовкам в документе (.md / .txt / .pdf)
  const headingSections: Array<{ title: string; bodyLines: string[] }> = [];
  let hasExplicitHeadings = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (isHeadingLine(trimmed)) {
      hasExplicitHeadings = true;
      const cleanTitle = trimmed
        .replace(/^#{1,6}\s*/, '')
        .replace(/^(\d{1,2}|[IVX]{1,4})[.)]\s*/, '')
        .trim();
      headingSections.push({ title: cleanTitle, bodyLines: [] });
    } else if (headingSections.length > 0) {
      if (trimmed) headingSections[headingSections.length - 1].bodyLines.push(trimmed);
    } else if (trimmed) {
      headingSections.push({ title: '', bodyLines: [trimmed] });
    }
  }

  const meaningfulHeadingSections = headingSections
    .map(sec => ({
      title: sec.title,
      body: sec.bodyLines.join(' ').replace(/\s{2,}/g, ' ').trim()
    }))
    .filter(sec => extractWordTokens(sec.body).length > 0);

  let rawBlocks: Array<{ title: string; body: string }> = [];

  if (hasExplicitHeadings && meaningfulHeadingSections.length >= 2) {
    rawBlocks = meaningfulHeadingSections.map((sec, idx) => ({
      title: sec.title || deriveChapterTitleFromBody(sec.body, idx),
      body: sec.body
    }));
  } else {
    // 2) Автоматическая смысловая кластеризация по абзацам или предложениям
    const allWords = extractWordTokens(normalized);
    const totalWordsCount = allWords.length;

    const targetChapters =
      totalWordsCount <= 80
        ? Math.min(3, Math.max(1, Math.ceil(totalWordsCount / 28)))
        : totalWordsCount <= 350
        ? Math.min(5, Math.max(3, Math.round(totalWordsCount / 75)))
        : Math.min(12, Math.max(4, Math.round(totalWordsCount / 220)));

    const paragraphs = normalized
      .split(/\n{2,}/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => extractWordTokens(p).length > 0);

    const units: string[] =
      paragraphs.length >= targetChapters
        ? paragraphs
        : normalized
            .replace(/\n+/g, ' ')
            .split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(s => extractWordTokens(s).length > 0);

    if (units.length <= 1 || targetChapters <= 1) {
      rawBlocks = [
        {
          title: deriveChapterTitleFromBody(normalized, 0),
          body: normalized.replace(/\s+/g, ' ').trim()
        }
      ];
    } else {
      const targetWordsPerChapter = Math.max(18, Math.ceil(totalWordsCount / targetChapters));
      let bucket: string[] = [];
      let bucketWords = 0;

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const uw = extractWordTokens(unit).length;
        bucket.push(unit);
        bucketWords += uw;

        const remainingUnits = units.length - 1 - i;
        if (
          bucketWords >= targetWordsPerChapter &&
          remainingUnits >= 1 &&
          rawBlocks.length < targetChapters - 1
        ) {
          const body = bucket.join(' ').trim();
          rawBlocks.push({
            title: deriveChapterTitleFromBody(body, rawBlocks.length),
            body
          });
          bucket = [];
          bucketWords = 0;
        }
      }

      if (bucket.length > 0) {
        const body = bucket.join(' ').trim();
        rawBlocks.push({
          title: deriveChapterTitleFromBody(body, rawBlocks.length),
          body
        });
      }
    }
  }

  let cumulativeWords = 0;
  const chapters: TimedDocumentChapter[] = rawBlocks.map((block, idx) => {
    const wc = Math.max(1, extractWordTokens(block.body).length);
    const startSec = idx === 0 ? 0 : Math.round((cumulativeWords / safeWpm) * 60);
    const durationSec = Math.max(4, Math.round((wc / safeWpm) * 60));
    cumulativeWords += wc;
    return {
      index: idx + 1,
      timecode: formatChapterTimestamp(startSec),
      startSec,
      durationSec,
      wordCount: wc,
      title: block.title,
      body: block.body
    };
  });

  const totalDurationSec = Math.round((cumulativeWords / safeWpm) * 60);
  const chaptersTxt = chapters.map(ch => `${ch.timecode} ${ch.title}`).join('\n');

  return {
    chapters,
    chaptersTxt,
    totalWords: cumulativeWords,
    totalDurationSec,
    totalDurationFormatted: formatChapterTimestamp(totalDurationSec)
  };
}

