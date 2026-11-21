# Задача: остаточные клиентские баги счётчиков + уборка дубликатов пайплайна

Репозиторий: aethercombine-studio (Vite + React + TS). Менять только перечисленное ниже.

## 1. src/components/YouTubeSeoView.tsx — отрицательный счётчик сцен
Симптом: в блоке «📦 Экспорт пакета релиза (English)» показывается «-179 сцен • 00:00».
- Найти выражение, формирующее это число (скорее всего разность длин массивов или вычитание смещения).
- Источник истины — фактическое число сцен текущего проекта: `narrativeScenes.length`,
  либо `loopSlots.length`, либо распарсенный массив сцен/глав. Никаких вычитаний.
- Значение обязано быть целым и >= 0: `Math.max(0, Math.floor(count))`.
- Соседний тайминг «00:00» считать из суммы фактических duration, формат h:mm:ss
  (mm:ss при длительности < 1 часа), а не из несуществующего поля.
- Проверить: при 12 сценах показывает «12 сцен», при пустом манифесте — «0 сцен», не «-N».

## 2. src/components/VerbaFlowTextWorkbench.tsx — склеенные счётчики
Симптом: «Слов: 41130 сл/мин» — это «41» и «130 сл/мин», слипшиеся без разделителя.
- Выводить два независимых значения с явным разделителем:
  `Слов: {wordCount} · {wpm} сл/мин`.
- Убедиться, что wordCount и wpm вычисляются раздельно и нигде не конкатенируются
  в одну строку/шаблон без разделителя.

## 3. Удалить дубликаты пайплайна из Studio
Раннер исполняется в репозитории aetherflow-render; локальные копии здесь не запускаются
и расходятся с боевыми версиями.
- Удалить файлы: `assemble_pipeline.py`, `assemble_scenes.py`,
  `.github/workflows/render.yml`, `.github/workflows/render_scene.yml`.
- НЕ удалять и НЕ менять: `.github/workflows/deploy.yml` (деплой GitHub Pages),
  `vite.config.ts` (base path `/aethercombine-studio/`),
  `firebase-applet-config.json` (импортируется в googleDriveAuth.ts),
  `index.html`, `src/main.tsx`, `src/index.css`, `package.json`, `bun.lock`.

## 4. Контроль секретов (только проверка, не переписывать заново)
- `src/utils/aetherPersistence.ts`: в localStorage только профиль и не-секретные настройки
  (repo, branch, drive_folder_id); access_token / github_token — в sessionStorage.
- `src/App.tsx` не содержит `gdriveSaKey`, `modalGdriveSaKey`, `ac_gdrive_sa_key`,
  `localStorage.setItem('ac_gh_token'`, `localStorage.setItem('ac_tg_bot_token'`.
- Терминал раннера и «Копировать лог» используют `sanitizeLogText` из `src/utils/logSanitizer.ts`.
- `src/components/ThumbnailStudioView.tsx`: CF-токен в sessionStorage, ключ
  `aether_cf_api_token` в localStorage отсутствует.

## Критерии приёмки
- `bun run build` проходит без ошибок; консоль браузера чистая.
- В UI: «N сцен» >= 0 и совпадает с числом сцен манифеста; «Слов: 41 · 130 сл/мин».
- Четыре файла-дубликата удалены; deploy.yml и vite.config.ts не изменены.
- В консоли браузера `Object.entries(localStorage).filter(([k,v]) =>
  /ya29\.|access_token|github_pat_|ghp_|bot_token|api_token/i.test(k+v))` возвращает `[]`.
