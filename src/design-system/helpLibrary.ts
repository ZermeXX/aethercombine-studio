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
}
} satisfies Record<string, BilingualHelp>;
