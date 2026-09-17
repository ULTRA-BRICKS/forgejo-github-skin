# Архитектура: внешний скин без форка

Изучена установленная версия **16.0.3**, tag `v16.0.3`, commit `eccddb2d17c93b42b2c8995725e03e549ac9ec0c`. Восемь SHA-256 исходных файлов находятся в `research/source-audit.json`; `scripts/check-compat.py` проверяет их.

Go templates формируют страницы, права, ссылки и формы; JS/Vue-компоненты отвечают за отдельные контролы. В body есть HTMX-атрибуты: повторная инициализация после замены DOM должна быть идемпотентной. Не считаем весь Forgejo единой Vue SPA.

`templates/base/head.tmpl` устанавливает `html[data-theme]`; `base/head_style.tmpl` загружает `index.css` и `theme-<name>.css`. Footer уже содержит слот `custom/footer`. Репозиторий использует `.secondary-nav`, `.repo-button-row`, `.clone-panel`, `#repo-files-table`; переключение веток — `.js-branch-tag-selector`. Эти детали проверены в исходниках указанного tag.

| Вариант | Польза | Ограничение | Решение |
|---|---|---|---|
| CSS | Палитра, плотность, responsive | Не меняет сценарии | Основа |
| CSS + внешний JS hook | UX без пересборки Forgejo | Нестабильный DOM-контракт | Выбран для 0.1 |
| Полные внешние Go templates | Свободное расположение блоков | Копии расходятся с upstream, риск потерять permissions/CSRF | Пока не используем |
| Форк frontend/backend | Максимальный контроль | Постоянные rebase и security updates | Только для доказанного ограничения |
| Отдельная REST SPA | Полностью свой интерфейс | Повторная реализация auth, diff, review; неполное API | Не оправдано сейчас |
| Userscript/расширение | Быстрый личный эксперимент | Установка на устройства, мобильные ограничения | Не основной способ |
| Подмена HTML reverse proxy | Внешняя установка | Хрупкость, CSP/cache/compression, сложная отладка | Отклонено |

Forgejo **уже поддерживает выбор темы пользователем** из разрешённого администратором списка. Upstream-предложение должно касаться стабильных точек расширения, а не изобретения этого переключателя. [UI configuration](https://forgejo.org/docs/latest/admin/config-cheat-sheet/)

`tokens.json` → `scripts/build.mjs` → три `dist/public/assets/css/theme-hypergithub-*.css`. Общие CSS/JS расположены под `/assets/hypergithub/0.1.0/`. После публикации изменение их содержимого требует bump version. Native theme импортируется для сохранения подсветки и нетронутых компонентов.

Один внешний `templates/custom/footer.tmpl` подключает ES module с учётом `AppSubUrl`, без inline script. JS не хранит токены, не имеет клиента mutation API, не интерполирует пользовательские комментарии в HTML. Используются существующие серверные ссылки и кнопки. При выборе другой темы обёртки удаляются.

Механизмы CustomPath и hooks документированы, но совместимость глубокой кастомизации между версиями не гарантирована. [Forgejo customization](https://forgejo.org/docs/latest/contributor/customization/)

Не обещаем поддержку 16.0.4 по одному сходству номера, полный review/file-tree/search UX, внедрение на production или pixel-perfect идентичность. Базис — измеренные эталоны, типизированные токены, небольшой внешний слой и явно проверяемые ограничения.
