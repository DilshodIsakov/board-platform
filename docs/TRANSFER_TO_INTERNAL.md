# Перенос изменений на внутренний сервер (board.het.uz)

Инструкция для Claude Code на внутреннем сервере. Написана по итогам
сверки этого (облачного, Supabase) репозитория с TECHNICAL_HANDOVER.md
внутренней инсталляции. Переносятся: блок Б (видео в комитетах),
блок В (рецензирование документов), выбранные пункты блока Г
(поиск, валидация файлов, аватары, счётчик чата, роли, миграция 041,
статистика).

**Репозиторий-источник:** https://github.com/DilshodIsakov/board-platform
(ветка main). Все упоминаемые файлы брать оттуда.

---

## 0. Критические различия архитектур — прочитать до начала

| | Этот репозиторий (источник) | Внутренний сервер (цель) |
|---|---|---|
| Backend | Supabase (PostgREST, RLS) | Express 5 + `pg`, авторизация в роутах |
| Клиент БД во фронте | `@supabase/supabase-js` | самописный `src/lib/apiClient.ts` |
| Файлы | Supabase Storage (бакеты) | диск, `/var/www/backend/uploads` |
| Auth | Supabase Auth (`auth.uid()`) | JWT, `req.user` |
| RLS-политики | работают | **не действуют**; `auth.uid()` в БД нет |
| Миграции | SQL Editor | `cat file.sql \| sudo -u postgres psql -d boardplatform` |
| Enum ролей | `user_role`: без chairman/department_head | `app_role`: **с** chairman и department_head |

Из этого четыре сквозных правила:

**П1 — нумерация миграций.** На внутреннем сервере последняя миграция —
`061_document_signatures.sql` (своя, в источнике её нет). Наши
061/062/063/066 конфликтуют по номерам. При переносе класть их в
диапазон 070+ (соответствие ниже). Сначала проверить, что занято:
`ls ~/frontend-source/supabase/ | sort | tail`.

**П2 — вырезать RLS из миграций.** Перед накаткой любой нашей миграции
удалить из неё блоки `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`,
`DROP POLICY`/`CREATE POLICY` и всё, что ссылается на `auth.uid()`,
`public.get_my_org_id()`, `public.get_my_role()`, схему `storage`.
Оставлять только: CREATE TABLE / ALTER TABLE / CREATE INDEX / UPDATE
(backfill) / триггеры без auth-функций. Авторизация реализуется в
Express-роутах — по образцу существующих роутов проекта.

**П3 — адаптация фронтенд-lib.** Файлы `src/lib/*.ts` из источника
зовут `supabase.from()/.storage/.rpc()`. Во внутреннем репозитории
такие вызовы уже переведены на `apiClient`/fetch — прежде чем
адаптировать новый lib-файл, посмотреть, как во внутреннем репо
адаптированы `lib/documents.ts` и `lib/nsMeetings.ts`, и делать
единообразно: `.from()/.select()` → GET-эндпоинт, `.storage.upload` →
POST multipart на Express + multer, `.rpc()` → обычный эндпоинт.
Страницы (`src/pages/*.tsx`), компоненты и локали переносятся почти
как есть — они зовут lib-функции, а не supabase напрямую.

**П4 — роли.** В коде источника из проверок доступа удалена роль
`chairman` (в облачной БД её нет). Во внутренней БД `chairman` ЕСТЬ и
критически используется (подписание протоколов: `role IN ('chairman',
'board_member')`). **При переносе любого файла с массивом ролей —
вернуть `chairman` обратно** в BOARD_ROLES / COMMENT_ROLES / canVote
и т.п. Список таких мест — в §Г8.

Деплой после каждого блока — по схеме из handover §4:
frontend: `npm run build` на ПК → `scp dist/* adminhet@192.168.10.170:/var/www/frontend/`;
backend: `git pull && pm2 restart backend` на сервере.

---

## Блок Б — видеоконференции в комитетах + миграция 060

Коммиты источника: `96c13cd`, `2ed79ff`, `8eb527a`, `63fb965`
(май 2026). Суть: на странице комитетов починено подключение к
видеозвонку (ссылка `meet_url` у заседаний комитетов, кнопки
подключения, локализация); заодно добавлены многоязычные поля
«основания» задач.

1. **Миграция** `060_task_basis_multilingual.sql` — чистый SQL без
   Supabase-специфики (ALTER TABLE board_tasks ADD basis_ru/uz/en +
   backfill), накатить как есть. Если номер 060 занят — переименовать
   в `070_task_basis_multilingual.sql`.
2. **Фронтенд:** перенести изменения из `src/pages/CommitteesPage.tsx`
   и `src/lib/committees.ts` (сравнить diff коммитов, а не копировать
   файлы целиком — внутренние версии уже отличаются из-за apiClient).
   Плюс новые ключи локалей в `ru.json` / `en.json` / `uz-Cyrl.json`
   (ключи с видео и комитетами — искать по diff).
3. Если во внутренней версии `committees.ts` уже адаптирован под
   apiClient — переносить только логику (поля meet_url, обработчики),
   не сигнатуры запросов.

Проверка: страница комитета → заседание с указанной ссылкой на
конференцию → кнопка подключения открывает ссылку; задача с
«основанием» показывает его на всех трёх языках.

---

## Блок В — рецензирование документов (.docx/.xlsx в браузере)

Коммиты источника: `a891997` (основной, ~2100 строк), `1298eb5`
(миграция 063), `37016af` (типографика и адаптивность).

### В.1. Что это делает

- Просмотр .docx и .xlsx прямо на странице `/documents/:id/review`
  (без скачивания): docx рендерится `docx-preview`, xlsx — `xlsx`
  (SheetJS) в HTML-таблицу. Рендер целиком **клиентский** — серверу
  ничего конвертировать не нужно, LibreOffice не участвует.
- Версии документов: новая версия файла с примечанием, история
  версий, просмотр любой версии (таблица `document_versions`).
- Комментарии к документу с ветками ответов (таблица
  `document_comments`), с правами: писать могут admin / corp_secretary
  / board_member / **chairman** / executive (chairman вернуть, см. П4).

### В.2. Миграции (накатывать в этом порядке, с учётом П1/П2)

| Источник | Во внутреннем репо назвать | Что вырезать по П2 |
|---|---|---|
| `061_document_versions.sql` | `071_document_versions.sql` | блок POLICY (строки с doc_versions_select/insert/delete), ENABLE RLS |
| `062_document_comments.sql` | `072_document_comments.sql` | блок POLICY dc_select/insert/update/delete, ENABLE RLS |
| `063_document_review_cleanup.sql` | `073_document_review_cleanup.sql` | ничего — Supabase-специфики нет |

Остаётся: таблицы `document_versions`, `document_comments`, индексы,
FK. Обратить внимание: FK ссылаются на `documents(id)`,
`reg_documents(id)`, `profiles(id)` — все существуют во внутренней БД.

### В.3. Backend (написать новые Express-роуты)

По образцу существующих роутов документов:

- `GET /api/documents/:id/versions` — список версий
  (SELECT из document_versions WHERE document_id, ORDER BY version_no DESC).
- `POST /api/documents/:id/versions` — multipart-загрузка новой версии
  (multer → uploads/, INSERT в document_versions со следующим
  version_no, change_note из body). Право: admin / corp_secretary
  (+ смотреть, кто может загружать документы в текущей внутренней логике).
- `GET /api/document-versions/:id/download` — отдача файла версии
  (по образцу `GET /api/documents/download/:id`, с проверкой токена —
  НЕ через публичный `/uploads`).
- `GET /api/documents/:id/comments` + `POST` + `PATCH /:commentId`
  + `DELETE /:commentId` — CRUD комментариев. `user_id`, `user_name`,
  `user_role` брать из `req.user`, НЕ из body (см. handover §7.2 —
  не повторять существующую ошибку). Право удаления: автор или admin;
  редактирования: автор или admin/corp_secretary.
- Всё то же для `source_type = 'reg_document'` (комментарии/версии
  работают и для нормативных документов) — во фронте это параметр
  `source`.

### В.4. Frontend

Новые файлы (скопировать из источника, затем адаптировать lib по П3):

- `src/pages/DocumentReviewPage.tsx` — страница рецензирования.
  Вернуть `chairman` в COMMENT_ROLES (П4).
- `src/components/DocumentViewer.tsx` — рендер docx/xlsx.
- `src/components/DocumentCommentThread.tsx` — ветки комментариев.
- `src/lib/officeViewer.ts` — парсинг файлов (чистый клиент, работает
  с Blob — адаптации почти не требует; получение Blob заменить со
  supabase.storage.download на fetch download-эндпоинта с токеном).
- `src/lib/documentVersions.ts` — ПОЛНОСТЬЮ переписать вызовы:
  upload/download/createSignedUrl/remove → новые эндпоинты из В.3.
- `src/lib/documentComments.ts` — то же, CRUD через эндпоинты.

Изменяемые существующие файлы (переносить по diff коммита `a891997`):
`src/App.tsx` (роуты `/documents/:documentId/review` и
`/reg-documents/:documentId/review`), `src/lib/documents.ts`,
`src/lib/regulations.ts` (кнопка «Рецензировать»),
`src/pages/NSMeetingDetailsPage.tsx`,
`src/pages/CommitteeMeetingDetailsPage.tsx`,
`src/pages/RegulationsPage.tsx`, локали (блок ключей `review.*` во
всех трёх json).

Зависимости (ставятся на ПК разработчика, где идёт сборка):

```
npm i docx-preview jszip xlsx
```

### В.5. Типографика (коммит `37016af`)

`src/index.css` + `src/components/Sidebar.tsx` — перенести как есть,
НО: первая строка index.css — `@import` Google Fonts (Lexend, Source
Sans 3). Если у пользователей внутренней сети нет доступа в интернет,
шрифты не загрузятся (упадёт на системные — не сломается, но вид
другой). В этом случае: скачать woff2-файлы обоих шрифтов, положить в
`src/assets/fonts/`, заменить @import на локальные `@font-face`.

### В.6. Проверка блока В

Заседание НС → документ .docx → «Рецензировать» → документ виден в
браузере, комментарий добавляется/отвечается/удаляется по правам,
новая версия загружается и открывается, старая доступна в истории.
То же для .xlsx и для документа из «Нормативных документов».

---

## Блок Г — выбранные пункты

### Г2. Глобальный поиск

Источник: `src/lib/search.ts`, `src/pages/SearchPage.tsx`, строка
поиска в `src/components/Layout.tsx` (форма + headerSearchStyle),
роут `/search` в `App.tsx`, ключи `search.*` в локалях.

`search.ts` в источнике делает 5 параллельных PostgREST-запросов с
`.or(ilike...)` — на внутреннем сервере вместо этого сделать **один
эндпоинт** `GET /api/search?q=...`:

```sql
-- 5 запросов внутри одного роута (параметризованных, НЕ конкатенацией):
SELECT id, title, title_ru, title_en, title_uz, start_at FROM meetings
 WHERE title ILIKE $1 OR title_ru ILIKE $1 OR title_en ILIKE $1 OR title_uz ILIKE $1
 ORDER BY start_at DESC LIMIT 10;
-- аналогично: documents (title, file_name), board_tasks (title*),
-- reg_documents (title*, file_name), committees (name*)
```

`$1 = '%' + q + '%'`, экранировать `%`/`_` в пользовательском вводе.
`search.ts` переписать в один fetch этого эндпоинта, маппинг в
`SearchResult[]` оставить как в источнике (типы, routes для перехода).
SearchPage и Layout переносятся как есть. Минимум 2 символа — уже
заложено и в Layout, и в lib.

Проверка: ввод в шапке → страница результатов по 5 разделам, клик
ведёт на нужную сущность, чужая организация не ищется (фильтр org —
добавить в SQL WHERE по org_id из req.user, т.к. RLS здесь нет!).

### Г4. Валидация загружаемых файлов

Источник: `src/lib/fileValidation.ts` — переносится **без изменений**
(чистый клиент: блок-лист исполняемых расширений + лимиты размера
50/25/25 MB). Плюс ключи `fileValidation.*` в трёх локалях. Вызовы
`assertFileAllowed(file, "document" | "chat" | "task")` вставить в
начало всех upload-функций внутренних lib-файлов: documents, versions
(В.4), nsMeetings, regulations, committees, tasks, chat.

**Важно для этой архитектуры:** клиентская проверка обходится, а
Supabase-бакетов с их лимитами тут нет — продублировать на бэкенде:
- в multer: `limits: { fileSize: 50 * 1024 * 1024 }` (по типу эндпоинта);
- в роуте — отклонять расширения из того же блок-листа
  (exe, msi, bat, cmd, com, scr, pif, cpl, ps1, vbs, vbe, js, jse,
  wsf, wsh, hta, jar) с кодом 400.

Проверка: .exe отклоняется с человекочитаемым сообщением и через UI,
и прямым POST на эндпоинт (curl) мимо фронтенда.

### Г5. Аватары профиля

Миграция 065 источника — **не переносить**, она целиком про Supabase
Storage (бакет profile-photos). На внутреннем сервере сначала
проверить, работает ли загрузка фото профиля вообще (в источнике до
065 она падала). Если не работает — реализовать по-местному:

- `POST /api/profile/avatar` — multer, только image/jpeg|png|webp,
  лимит 5 MB, сохранять в `uploads/avatars/{profileId}.{ext}`
  (перезапись старого), UPDATE profiles SET avatar_url.
- Право: только свой профиль (id из req.user), admin — любой.
- Отдачу можно оставить через существующую статику `/uploads`
  (аватары не секретны), но помнить, что handover §7.1 рекомендует
  закрыть `/uploads` целиком — тогда аватарам нужен свой публичный
  под-путь или авторизованный эндпоинт.
- Фронтенд: в `profileDetails.ts` (внутренняя версия) заменить
  storage-вызов на POST этого эндпоинта.

### Г6. Счётчик непрочитанных сообщений чата

Источник: миграция `066_chat_unread_counter.sql` + правка
`src/lib/chat.ts`. Миграция в оригинале построена на `auth.uid()` —
на внутренний сервер переносить так:

1. Таблицу — как есть (переименовать файл в
   `074_chat_group_reads.sql`):
   ```sql
   CREATE TABLE IF NOT EXISTS public.chat_group_reads (
     user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
     group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
     last_read_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, group_id)
   );
   ```
   + два индекса из миграции. Функции из миграции НЕ создавать —
   их логику перенести в Express (auth.uid() в БД нет).
   Перед накаткой сверить имена таблиц чата с внутренней схемой
   (chat_groups / chat_group_members / chat_group_messages /
   messages.receiver_id, read_at) — если чат-схема внутри отличалась,
   подставить фактические имена.
2. Эндпоинты (SQL — адаптация тел функций из миграции 066, `$1` =
   req.user.id):
   - `GET /api/chat/unread-count` → одно число: непрочитанные личные
     (messages WHERE receiver_id=$1 AND read_at IS NULL AND
     sender_id<>$1) + групповые (сообщения групп, где состоит $1,
     новее chat_group_reads.last_read_at этого пользователя,
     sender_id<>$1).
   - `POST /api/chat/groups/:groupId/read` → UPSERT в chat_group_reads
     (ON CONFLICT (user_id, group_id) DO UPDATE SET last_read_at=now()).
   - `POST /api/chat/personal/:peerId/read` → UPDATE messages SET
     read_at=now() WHERE receiver_id=$1 AND sender_id=$2 AND read_at IS NULL.
3. Фронтенд: во внутреннем `chat.ts` заменить три `.rpc(...)`-вызова
   (`get_unread_chat_count`, `mark_personal_messages_as_read`,
   `mark_group_as_read`) на fetch этих эндпоинтов. Места вызова и
   бейдж в Layout уже есть.

Примечание: обновление счётчика «вживую» на внутреннем сервере идёт
через их собственный WebSocket (`/ws`) — если события чата туда уже
шлются, дёргать refresh счётчика по ним; иначе счётчик обновится при
переходах между страницами, что тоже приемлемо.

### Г8. Роли — НЕ переносить буквально ⚠

В источнике роли `chairman` и `department_head` удалены из типов и
проверок, потому что в облачной БД их нет в enum. Во внутренней БД
(enum `app_role`) они ЕСТЬ, и `chairman` активно используется:
подписание протоколов создаёт записи для `role IN ('chairman',
'board_member')`. Буквальный перенос сломает председателю голосование,
комментарии и место в списках СД.

Что переносить — сам принцип «тип = enum БД»:

1. Снять фактический список: `SELECT unnest(enum_range(NULL::app_role));`
2. Привести `UserRole` в `src/lib/profile.ts` внутренней версии ровно
   к этому списку. По handover в TS есть `management`/`employee`,
   которых в enum может не быть, — убрать из типа то, чего нет в БД,
   а НЕ то, чего нет в облачной версии.
3. `chairman` оставить во всех проверках. `department_head` — если
   enum содержит, а пользователей с ролью нет, можно оставить в типе,
   но решение фиксировать комментарием у типа (как сделано в
   источнике: «не расширять без миграции enum»).

### Г9. Миграция 041 → no-op

В источнике `041_corp_secretary_permissions.sql` заменена заглушкой
(создавала политики на несуществующих таблицах, права продублированы
в 044). На внутреннем сервере RLS всё равно не действует, поэтому
это чистая гигиена репозитория: скопировать no-op версию файла поверх
внутренней, к БД не прикасаться. Делается за минуту вместе с любым
другим блоком.

### Г10. Честная статистика

Источник: diff `src/pages/StatsPage.tsx` в коммите `b09bfae`.
Убрана выдуманная длительность заседаний «120 мин» (у заседаний нет
end_at) — в таблице, карточке и CSV/выгрузке показывается «—».
Чистый фронтенд, переносится по diff как есть. Туда же — мелочь из
того же коммита: дата загрузки в карточке документа на
`RegulationsPage.tsx` (+ ключ `regs.uploadedOn` в трёх локалях).

---

## Рекомендуемый порядок работ

1. Г4 (валидация) + Г10 (статистика) + Г9 (041) — простые, без БД
   (кроме нуля миграций), обкатка процесса деплоя.
2. Блок Б — одна простая миграция + фронтенд.
3. Г2 (поиск) — первый новый Express-эндпоинт.
4. Г6 (счётчик чата) — таблица + три эндпоинта.
5. Блок В — самый большой: 2 таблицы, ~6 эндпоинтов, 6 новых файлов
   фронтенда. Делать последним, когда процесс отработан.
6. Г5 (аватары) — по результату проверки «а работает ли сейчас».
7. Г8 — не отдельная задача, а правило при переносе каждого файла
   (chairman возвращать) + разовая сверка типа с enum.

После каждого шага: `npm run build` без ошибок TypeScript, деплой,
ручная проверка из соответствующего раздела. БД перед первой
миграцией забэкапить: `sudo -u postgres pg_dump boardplatform | gzip
> ~/boardplatform_$(date +%F).sql.gz`.

## Что сознательно НЕ переносится (решение владельца проекта)

2FA (TOTP — завязан на Supabase Auth MFA, во внутренней архитектуре
потребовал бы своей реализации), миграции 064/065/067 (Supabase
Storage и Realtime), живое табло голосования, vitest-тесты, гигиена
git-репозитория источника. Если 2FA понадобится на внутреннем сервере
— это отдельная задача (speakeasy/otplib + поле totp_secret в
profiles + шаг в /login), не перенос.
