import type { BilingualHelp } from './ContextHelp';

export const projectHelp = {
name: {ru:{summary:"Название нового независимого проекта.",effect:"Создаёт отдельную запись при нажатии кнопки создания.",whenOn:"Для нового выпуска или отдельного видео.",whenOff:"Для продолжения существующего проекта выберите его карточку.",recommended:"Уникальное понятное название.",example:"HISTOVIVA EP03",limitations:"Название не является идентификатором облачной папки."},en:{summary:"Name of a new independent project.",effect:"Creates a separate record when you press Create.",whenOn:"For a new episode or separate video.",whenOff:"Select an existing project to continue it.",recommended:"A descriptive unique name.",example:"HISTOVIVA EP03",limitations:"The name is not a cloud folder ID."}},
format: {ru:{summary:"Формат нового проекта.",effect:"Определяет доступность Loop.",whenOn:"Выберите формат до создания.",whenOff:"Не меняет существующие проекты.",recommended:"Video для обычного выпуска.",example:"Ambient Loop для длинного видео Whisker.",limitations:"Ambient недоступен HISTOVIVA."},en:{summary:"New project format.",effect:"Controls Loop availability.",whenOn:"Choose before creation.",whenOff:"Does not change existing projects.",recommended:"Video for regular episodes.",example:"Ambient Loop for long Whisker videos.",limitations:"Ambient is unavailable in HISTOVIVA."}},
importBackup: {
  "ru": {
    "summary": "Восстановление проекта из резервной копии JSON.",
    "effect": "Создаёт новый независимый проект с новым идентификатором.",
    "whenOn": "Для восстановления или переноса сохранённого проекта.",
    "whenOff": "Для продолжения существующего проекта откройте его карточку.",
    "recommended": "Используйте резервную копию из соответствующего рабочего пространства.",
    "example": "Импорт ранее экспортированного выпуска HISTOVIVA.",
    "limitations": "Облачные файлы не копируются автоматически. Несовместимые или повреждённые копии отклоняются."
  },
  "en": {
    "summary": "Restore a project from a JSON backup.",
    "effect": "Creates an independent project with a new identifier.",
    "whenOn": "To restore or transfer a saved project.",
    "whenOff": "Open an existing project card to continue working.",
    "recommended": "Use a backup from the matching workspace.",
    "example": "Import a previously exported HISTOVIVA episode.",
    "limitations": "Cloud files are not copied automatically. Incompatible or damaged backups are rejected."
  }
},
exportBackup: {
  "ru": {
    "summary": "Экспорт резервной копии JSON.",
    "effect": "Сохраняет данные проекта в файл.",
    "whenOn": "Перед переносом или удалением.",
    "whenOff": "Не заменяет облачное резервирование.",
    "recommended": "Храните копию отдельно.",
    "example": "Экспорт выпуска перед архивированием.",
    "limitations": "Облачные файлы не скачиваются автоматически."
  },
  "en": {
    "summary": "Export a JSON backup.",
    "effect": "Saves project data to a file.",
    "whenOn": "Before transfer or deletion.",
    "whenOff": "Not a replacement for cloud backups.",
    "recommended": "Keep a separate copy.",
    "example": "Export an episode before archiving.",
    "limitations": "Cloud files are not downloaded automatically."
  }
},
archive: {
  "ru": {
    "summary": "Архивирование проекта.",
    "effect": "Скрывает проект из активного списка, сохраняя данные.",
    "whenOn": "Когда работа завершена.",
    "whenOff": "Если проект ещё нужен ежедневно.",
    "recommended": "Архивируйте завершённые выпуски.",
    "example": "Архив готового видео.",
    "limitations": "Архивирование не удаляет облачные файлы."
  },
  "en": {
    "summary": "Archive a project.",
    "effect": "Hides it from the active list while retaining data.",
    "whenOn": "When work is complete.",
    "whenOff": "When daily access is needed.",
    "recommended": "Archive completed episodes.",
    "example": "Archive a finished video.",
    "limitations": "Archiving does not delete cloud files."
  }
},
remove: {
  "ru": {
    "summary": "Окончательное удаление архивного проекта.",
    "effect": "Удаляет локальные данные проекта.",
    "whenOn": "Только если проект больше не нужен.",
    "whenOff": "Если может понадобиться восстановление.",
    "recommended": "Сначала экспортируйте резервную копию.",
    "example": "Удаление ненужного черновика.",
    "limitations": "Необратимо для локальных данных; облачные файлы не удаляются."
  },
  "en": {
    "summary": "Permanently delete an archived project.",
    "effect": "Removes local project data.",
    "whenOn": "Only when no longer needed.",
    "whenOff": "If recovery may be needed.",
    "recommended": "Export a backup first.",
    "example": "Delete an unwanted draft.",
    "limitations": "Local deletion is irreversible; cloud files are not deleted."
  }
},
rename: {
  "ru": {
    "summary": "Переименование проекта.",
    "effect": "Меняет отображаемое название, сохраняя идентификатор.",
    "whenOn": "Для уточнения названия выпуска.",
    "whenOff": "Если название уже понятно.",
    "recommended": "Используйте понятное название.",
    "example": "HISTOVIVA EP03 — Troy.",
    "limitations": "Не переименовывает облачную папку автоматически."
  },
  "en": {
    "summary": "Rename a project.",
    "effect": "Changes its display name while retaining its ID.",
    "whenOn": "To clarify an episode name.",
    "whenOff": "When the name is already clear.",
    "recommended": "Use a descriptive name.",
    "example": "HISTOVIVA EP03 — Troy.",
    "limitations": "Does not automatically rename cloud folders."
  }
},
duplicate: {
  "ru": {
    "summary": "Дублирование проекта.",
    "effect": "Создаёт отдельный проект с новым идентификатором.",
    "whenOn": "Для альтернативной версии.",
    "whenOff": "Для продолжения оригинала.",
    "recommended": "Дайте копии отличимое название.",
    "example": "EP03 — альтернативная версия.",
    "limitations": "Облачные файлы физически не копируются."
  },
  "en": {
    "summary": "Duplicate a project.",
    "effect": "Creates a separate project with a new ID.",
    "whenOn": "For an alternative version.",
    "whenOff": "To continue the original.",
    "recommended": "Give the copy a distinct name.",
    "example": "EP03 — alternate version.",
    "limitations": "Cloud files are not physically copied."
  }
},
restore: {
  "ru": {
    "summary": "Восстановление из архива.",
    "effect": "Возвращает проект в активный список с прежним идентификатором.",
    "whenOn": "Для продолжения работы.",
    "whenOff": "Если проект должен остаться в архиве.",
    "recommended": "После восстановления откройте карточку.",
    "example": "Возобновление работы над EP03.",
    "limitations": "Не восстанавливает окончательно удалённые проекты."
  },
  "en": {
    "summary": "Restore from archive.",
    "effect": "Returns the project to the active list with its original ID.",
    "whenOn": "To resume work.",
    "whenOff": "When it should remain archived.",
    "recommended": "Open its card after restoring.",
    "example": "Resume work on EP03.",
    "limitations": "Cannot recover permanently deleted projects."
  }
}
} satisfies Record<string, BilingualHelp>;
