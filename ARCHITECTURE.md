# Техническая архитектура — Board Platform MVP

**Версия:** 2.0
**Дата:** 23 февраля 2026
**Подход:** Supabase-first (без отдельного Node.js сервера на этапе MVP)
**Мультитенантность:** org_id на всех бизнес-таблицах (1 компания сейчас, SaaS потом)

---

## Содержание

1. [Обзор системной архитектуры](#1-обзор-системной-архитектуры)
2. [Схема базы данных](#2-схема-базы-данных)
3. [Связи и ограничения](#3-связи-и-ограничения)
4. [Стратегия RLS](#4-стратегия-rls)
5. [Матрица ролей и разрешений](#5-матрица-ролей-и-разрешений)
6. [Дорожная карта MVP](#6-дорожная-карта-mvp)

---

## 1. Обзор системной архитектуры

### 1.1 Принцип: Supabase-first

На этапе MVP мы **не создаём отдельный Node.js сервер**. Вся логика работает через:

| Слой | Технология | Назначение |
|------|-----------|------------|
| **Аутентификация** | Supabase Auth | Регистрация, вход, JWT-токены, управление сессиями |
| **База данных** | Supabase PostgreSQL | Хранение всех данных, бизнес-логика через функции |
| **Авторизация** | PostgreSQL RLS | Разграничение доступа на уровне строк |
| **Бизнес-логика** | PostgreSQL Functions + Edge Functions | Триггеры, валидация, сложные операции |
| **Файлы** | Supabase Storage | Загрузка/скачивание документов с RLS-политиками |
| **Реальное время** | Supabase Realtime | Чат, уведомления, обновление голосований |
| **Фронтенд** | React + Vite + TypeScript | SPA-приложение, напрямую работает с Supabase SDK |

### 1.2 Почему Supabase-first

- **Быстрее до MVP** — не нужно писать API-сервер, маршруты, контроллеры
- **Безопасность из коробки** — RLS защищает данные на уровне БД, а не на уровне API
- **Масштабируемость** — Edge Functions добавляются по мере роста, не меняя архитектуру
- **Realtime бесплатно** — WebSocket-подписки для чата и уведомлений

### 1.3 Схема взаимодействия компонентов

```
┌──────────────────────────────────────────────────────┐
│                  БРАУЗЕР (Клиент)                      │
│                                                        │
│   React SPA (Vite + TypeScript + Tailwind + shadcn)   │
│                                                        │
│   ┌──────────┐  ┌──────────┐  ┌────────────────┐     │
│   │ Supabase │  │  React   │  │    Zustand /   │     │
│   │   SDK    │  │  Router  │  │  TanStack Query│     │
│   └────┬─────┘  └──────────┘  └────────────────┘     │
│        │                                               │
└────────┼───────────────────────────────────────────────┘
         │
         │  HTTPS (REST + WebSocket)
         │
┌────────▼───────────────────────────────────────────────┐
│                    SUPABASE CLOUD                        │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │    Auth      │  │   Realtime   │  │    Storage    │  │
│  │  (GoTrue)   │  │  (WebSocket) │  │   (S3-like)  │  │
│  │             │  │              │  │              │  │
│  │ - Email/Pwd │  │ - Чат        │  │ - Документы  │  │
│  │ - JWT       │  │ - Голосов.   │  │ - Материалы  │  │
│  │ - Sessions  │  │ - Уведомл.   │  │ - Аватары    │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬────────┘  │
│         │                │                  │           │
│  ┌──────▼────────────────▼──────────────────▼────────┐  │
│  │              PostgreSQL 15+                         │  │
│  │                                                     │  │
│  │  ┌──────────────┐  ┌────────────────────────────┐  │  │
│  │  │  RLS-полити-  │  │  Функции и триггеры        │  │  │
│  │  │  ки на каждой │  │                            │  │  │
│  │  │  таблице      │  │  - log_audit_event()       │  │  │
│  │  │              │  │  - update_vote_counts()    │  │  │
│  │  │  WHERE       │  │  - check_quorum()          │  │  │
│  │  │  org_id =    │  │  - close_expired_votes()   │  │  │
│  │  │  user.org_id │  │  - update_document_status()│  │  │
│  │  └──────────────┘  └────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Edge Functions (Deno)                   │  │
│  │                                                      │  │
│  │  - generate-protocol  (вызов AI API)                │  │
│  │  - send-notification  (email/push, будущее)         │  │
│  │  - export-pdf         (генерация отчётов)           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 1.4 Принцип мультитенантности

Сейчас — **одна организация**. Но архитектура готова к расширению:

```
Каждая бизнес-таблица содержит:
  org_id UUID NOT NULL REFERENCES organizations(id)

Каждая RLS-политика содержит:
  WHERE org_id = (SELECT org_id FROM profiles WHERE user_id = auth.uid())

При масштабировании в SaaS:
  - Создаётся новая запись в organizations
  - Новые пользователи привязываются к новой org_id
  - RLS автоматически изолирует данные
  - НЕ нужно менять код приложения
```

### 1.5 Ключевое архитектурное решение: profiles вместо прямого users

Supabase Auth управляет таблицей `auth.users` (системная, нельзя добавлять бизнес-поля). Поэтому создаётся таблица `public.profiles`:

```
auth.users (системная)          public.profiles (наша)
┌──────────────┐               ┌──────────────────────┐
│ id (UUID)    │──── 1:1 ─────│ user_id (FK)         │
│ email        │               │ org_id               │
│ password     │               │ role                 │
│ ...          │               │ full_name            │
└──────────────┘               │ position, phone ...  │
                               └──────────────────────┘
```

---

## 2. Схема базы данных

### 2.1 Обзор всех таблиц

```
ЯДРО СИСТЕМЫ                    МОДУЛИ
┌─────────────────┐
│  organizations   │
└────────┬────────┘
         │
┌────────▼────────┐           ┌──────────────────────┐
│    profiles      │           │      meetings        │
│  (user_id,      │           │  (org_id, created_by)│
│   org_id, role) │           └───────┬──────────────┘
└────────┬────────┘                   │
         │                    ┌───────┼──────────────┐
         │                    │       │              │
         │            ┌───────▼──┐ ┌──▼─────────┐ ┌─▼──────────────┐
         │            │ agenda_  │ │ meeting_   │ │   votings      │
         │            │ items    │ │participants│ │(org_id,meeting) │
         │            └──────────┘ └────────────┘ └───────┬────────┘
         │                                                │
         │                                        ┌───────▼────────┐
         │                                        │     votes      │
         │                                        │(voting,user)   │
         │                                        └────────────────┘
         │
         │            ┌──────────────┐     ┌──────────────────┐
         ├────────────│  protocols   │     │    documents      │
         │            │(org_id,mtg)  │     │  (org_id,created) │
         │            └──────────────┘     └───────┬──────────┘
         │                                         │
         │                                 ┌───────▼──────────┐
         │                                 │document_approvals│
         │                                 └──────────────────┘
         │
         │            ┌──────────────┐     ┌──────────────────┐
         ├────────────│   messages   │     │     audits       │
         │            │(org_id,      │     │  (org_id,auditor)│
         │            │ sender,rcv)  │     └───────┬──────────┘
         │            └──────────────┘             │
         │                                 ┌───────▼──────────┐
         │                                 │  audit_findings  │
         │                                 └──────────────────┘
         │
         │            ┌──────────────────────────────────────┐
         └────────────│            audit_logs                  │
                      │  (org_id, user_id, action, entity)   │
                      └──────────────────────────────────────┘
```

---

### 2.2 Таблица `organizations`

Информация о компании. Сейчас 1 запись. В SaaS-режиме — по одной на каждого клиента.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `name` | `VARCHAR(500)` | Название организации | NOT NULL |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `created_by` | `UUID` | Кто создал организацию | FK → `auth.users(id)` |
| `is_active` | `BOOLEAN` | Активна ли организация | DEFAULT `true` |

**Индексы:** нет (малое количество записей)

---

### 2.3 Таблица `profiles`

Расширенный профиль пользователя. Связан 1:1 с `auth.users`.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | `UUID` | Ссылка на auth.users | UNIQUE, NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `role` | `VARCHAR(50)` | Роль в системе | NOT NULL, CHECK |
| `full_name` | `VARCHAR(255)` | ФИО | NOT NULL |
| `position` | `VARCHAR(255)` | Должность | |
| `is_active` | `BOOLEAN` | Активен ли аккаунт | DEFAULT `true` |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |

**CHECK (role):**
```
role IN ('chairman', 'board_member', 'executive', 'admin', 'auditor', 'department_head')
```

**Индексы:**
- `idx_profiles_user_id` UNIQUE (user_id)
- `idx_profiles_org_id` (org_id)
- `idx_profiles_role` (org_id, role)
- `idx_profiles_active` (org_id, is_active)

**Триггер:** При создании записи в `auth.users` — автоматически создаётся запись в `profiles` через `handle_new_user()` функцию.

---

### 2.4 Таблица `meetings`

Заседания Наблюдательного совета и другие собрания.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `title` | `VARCHAR(500)` | Название | NOT NULL |
| `description` | `TEXT` | Описание/повестка | |
| `meeting_type` | `VARCHAR(50)` | Тип заседания | NOT NULL, CHECK |
| `meeting_format` | `VARCHAR(20)` | Формат проведения | NOT NULL, DEFAULT `'offline'`, CHECK |
| `status` | `VARCHAR(30)` | Статус | NOT NULL, DEFAULT `'scheduled'`, CHECK |
| `scheduled_date` | `DATE` | Дата проведения | NOT NULL |
| `scheduled_time` | `TIME` | Время начала | |
| `end_time` | `TIME` | Время окончания | |
| `duration_minutes` | `INT` | Длительность (мин) | CHECK (`duration_minutes > 0`) |
| `location` | `VARCHAR(500)` | Место проведения | |
| `video_conference_url` | `TEXT` | Ссылка на видеоконференцию | |
| `created_by` | `UUID` | Кто создал | NOT NULL, FK → `profiles(id)` |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (meeting_type):**
```
meeting_type IN ('regular', 'extraordinary', 'strategic', 'budget_committee', 'quarterly', 'shareholder_annual', 'shareholder_extraordinary')
```

**CHECK (meeting_format):**
```
meeting_format IN ('online', 'offline', 'hybrid')
```

**CHECK (status):**
```
status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')
```

**Индексы:**
- `idx_meetings_org_date` (org_id, scheduled_date)
- `idx_meetings_org_status` (org_id, status)
- `idx_meetings_org_type` (org_id, meeting_type)
- `idx_meetings_created_by` (created_by)

---

### 2.5 Таблица `meeting_participants`

Участники конкретного заседания.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `meeting_id` | `UUID` | Заседание | NOT NULL, FK → `meetings(id)` ON DELETE CASCADE |
| `profile_id` | `UUID` | Участник | NOT NULL, FK → `profiles(id)` |
| `role_in_meeting` | `VARCHAR(30)` | Роль на заседании | DEFAULT `'participant'`, CHECK |
| `attendance_status` | `VARCHAR(20)` | Статус участия | DEFAULT `'invited'`, CHECK |
| `joined_at` | `TIMESTAMPTZ` | Время подключения | |
| `left_at` | `TIMESTAMPTZ` | Время отключения | |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |

**CHECK (role_in_meeting):**
```
role_in_meeting IN ('chairperson', 'secretary', 'participant', 'observer', 'presenter')
```

**CHECK (attendance_status):**
```
attendance_status IN ('invited', 'confirmed', 'attended', 'absent', 'excused')
```

**Ограничения:**
- `UNIQUE(meeting_id, profile_id)` — один пользователь не может быть добавлен дважды

**Индексы:**
- `idx_mp_org_meeting` (org_id, meeting_id)
- `idx_mp_profile` (profile_id)

---

### 2.6 Таблица `agenda_items`

Пункты повестки дня заседания.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `meeting_id` | `UUID` | Заседание | NOT NULL, FK → `meetings(id)` ON DELETE CASCADE |
| `order_number` | `INT` | Порядковый номер | NOT NULL, CHECK (`order_number > 0`) |
| `title` | `VARCHAR(500)` | Вопрос повестки | NOT NULL |
| `description` | `TEXT` | Подробное описание | |
| `status` | `VARCHAR(20)` | Статус рассмотрения | DEFAULT `'pending'`, CHECK |
| `presenter_id` | `UUID` | Докладчик | FK → `profiles(id)` |
| `duration_minutes` | `INT` | Отведённое время (мин) | |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (status):**
```
status IN ('pending', 'in_discussion', 'voted', 'approved', 'rejected', 'postponed')
```

**Ограничения:**
- `UNIQUE(meeting_id, order_number)` — номера не дублируются в рамках заседания

**Индексы:**
- `idx_agenda_org_meeting` (org_id, meeting_id)

---

### 2.7 Таблица `votings`

Голосования по вопросам заседаний.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `meeting_id` | `UUID` | Связанное заседание | FK → `meetings(id)` ON DELETE SET NULL |
| `agenda_item_id` | `UUID` | Связанный пункт повестки | FK → `agenda_items(id)` ON DELETE SET NULL |
| `title` | `VARCHAR(500)` | Вопрос голосования | NOT NULL |
| `description` | `TEXT` | Описание / контекст | |
| `status` | `VARCHAR(20)` | Статус | NOT NULL, DEFAULT `'active'`, CHECK |
| `requires_quorum` | `BOOLEAN` | Требуется кворум | DEFAULT `true` |
| `quorum_percentage` | `SMALLINT` | Процент для кворума | DEFAULT `50`, CHECK (`quorum_percentage BETWEEN 1 AND 100`) |
| `deadline` | `TIMESTAMPTZ` | Срок завершения | NOT NULL |
| `total_eligible_voters` | `SMALLINT` | Всего имеют право голоса | NOT NULL, DEFAULT `0` |
| `created_by` | `UUID` | Кто создал | NOT NULL, FK → `profiles(id)` |
| `closed_at` | `TIMESTAMPTZ` | Когда закрыто | |
| `closed_by` | `UUID` | Кто закрыл | FK → `profiles(id)` |
| `result` | `VARCHAR(20)` | Итог | CHECK |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (status):**
```
status IN ('draft', 'active', 'completed', 'cancelled')
```

**CHECK (result):**
```
result IN ('approved', 'rejected', 'no_quorum', NULL)
```

**Индексы:**
- `idx_votings_org_status` (org_id, status)
- `idx_votings_org_deadline` (org_id, deadline)
- `idx_votings_meeting` (meeting_id)
- `idx_votings_agenda` (agenda_item_id)

> **Примечание:** Счётчики `votes_for`, `votes_against`, `votes_abstained` **не хранятся в этой таблице** — они вычисляются через агрегацию из `votes`. Это исключает рассинхронизацию данных. Для производительности создаётся VIEW `voting_results`.

---

### 2.8 Таблица `votes`

Индивидуальные голоса (иммутабельные записи).

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `voting_id` | `UUID` | Голосование | NOT NULL, FK → `votings(id)` ON DELETE CASCADE |
| `profile_id` | `UUID` | Кто голосовал | NOT NULL, FK → `profiles(id)` |
| `vote_value` | `VARCHAR(20)` | Значение голоса | NOT NULL, CHECK |
| `voted_at` | `TIMESTAMPTZ` | Время голосования | NOT NULL, DEFAULT `now()` |

**CHECK (vote_value):**
```
vote_value IN ('for', 'against', 'abstained')
```

**Ограничения:**
- `UNIQUE(voting_id, profile_id)` — один человек голосует один раз
- Записи **не обновляются и не удаляются** (иммутабельность для аудита)

**Индексы:**
- `idx_votes_org_voting` (org_id, voting_id)
- `idx_votes_profile` (profile_id)

**VIEW `voting_results`:**
```
Автоматически агрегирует:
  - voting_id
  - COUNT(*) FILTER (WHERE vote_value = 'for')     AS votes_for
  - COUNT(*) FILTER (WHERE vote_value = 'against')  AS votes_against
  - COUNT(*) FILTER (WHERE vote_value = 'abstained') AS votes_abstained
  - COUNT(*)                                         AS total_voted
```

---

### 2.9 Таблица `protocols`

Протоколы заседаний.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `meeting_id` | `UUID` | Заседание | NOT NULL, FK → `meetings(id)` |
| `title` | `VARCHAR(500)` | Название протокола | NOT NULL |
| `brief_content` | `TEXT` | Бриф заседания (вход для ИИ) | |
| `content` | `TEXT` | Текст протокола | |
| `status` | `VARCHAR(20)` | Статус | NOT NULL, DEFAULT `'draft'`, CHECK |
| `generated_by_ai` | `BOOLEAN` | Создан с помощью ИИ | DEFAULT `false` |
| `created_by` | `UUID` | Кто создал | NOT NULL, FK → `profiles(id)` |
| `approved_by` | `UUID` | Кто утвердил | FK → `profiles(id)` |
| `approved_at` | `TIMESTAMPTZ` | Дата утверждения | |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (status):**
```
status IN ('draft', 'review', 'approved', 'archived')
```

**Индексы:**
- `idx_protocols_org_meeting` (org_id, meeting_id)
- `idx_protocols_org_status` (org_id, status)

---

### 2.10 Таблица `documents`

Документы для согласования.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `title` | `VARCHAR(500)` | Название | NOT NULL |
| `description` | `TEXT` | Описание | |
| `storage_path` | `TEXT` | Путь в Supabase Storage | NOT NULL |
| `file_name` | `VARCHAR(255)` | Оригинальное имя файла | NOT NULL |
| `file_size` | `BIGINT` | Размер (байт) | CHECK (`file_size > 0`) |
| `mime_type` | `VARCHAR(100)` | MIME-тип | NOT NULL |
| `status` | `VARCHAR(30)` | Статус согласования | NOT NULL, DEFAULT `'draft'`, CHECK |
| `responsible_id` | `UUID` | Ответственный за документ | FK → `profiles(id)` |
| `meeting_id` | `UUID` | Связанное заседание (если есть) | FK → `meetings(id)` |
| `created_by` | `UUID` | Кто загрузил | NOT NULL, FK → `profiles(id)` |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (status):**
```
status IN ('draft', 'pending_approval', 'in_review', 'approved', 'rejected')
```

**CHECK (mime_type):**
```
mime_type IN (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
)
```

**Индексы:**
- `idx_documents_org_status` (org_id, status)
- `idx_documents_org_created_by` (org_id, created_by)
- `idx_documents_meeting` (meeting_id)

> **Важно:** Файл хранится в Supabase Storage с путём `{org_id}/documents/{document_id}/{file_name}`. Поле `storage_path` хранит полный путь, а не публичный URL. URL генерируется через `createSignedUrl()` на клиенте.

---

### 2.11 Таблица `document_approvals`

Цепочка согласования документа.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `document_id` | `UUID` | Документ | NOT NULL, FK → `documents(id)` ON DELETE CASCADE |
| `approver_id` | `UUID` | Согласующий | NOT NULL, FK → `profiles(id)` |
| `order_number` | `SMALLINT` | Порядок согласования | NOT NULL, DEFAULT `1` |
| `status` | `VARCHAR(20)` | Статус | NOT NULL, DEFAULT `'pending'`, CHECK |
| `comment` | `TEXT` | Комментарий | |
| `decided_at` | `TIMESTAMPTZ` | Дата решения | |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |

**CHECK (status):**
```
status IN ('pending', 'approved', 'rejected')
```

**Ограничения:**
- `UNIQUE(document_id, approver_id)` — один согласующий на документ

**Индексы:**
- `idx_da_org_document` (org_id, document_id)
- `idx_da_approver_status` (approver_id, status)

**Триггер `update_document_status()`:** после каждого UPDATE на `document_approvals`:
- Если все согласующие `approved` → документ переходит в `approved`
- Если хотя бы один `rejected` → документ переходит в `rejected`

---

### 2.12 Таблица `messages`

Чат-сообщения (1-на-1).

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `sender_id` | `UUID` | Отправитель | NOT NULL, FK → `profiles(id)` |
| `receiver_id` | `UUID` | Получатель | NOT NULL, FK → `profiles(id)` |
| `content` | `TEXT` | Текст сообщения | NOT NULL, CHECK (`char_length(content) > 0`) |
| `is_read` | `BOOLEAN` | Прочитано | DEFAULT `false` |
| `read_at` | `TIMESTAMPTZ` | Время прочтения | |
| `created_at` | `TIMESTAMPTZ` | Время отправки | DEFAULT `now()` |

**Ограничения:**
- `CHECK (sender_id != receiver_id)` — нельзя писать самому себе

**Индексы:**
- `idx_messages_conversation` (org_id, LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC) — для эффективной выборки беседы
- `idx_messages_receiver_unread` (receiver_id, is_read) WHERE `is_read = false` — для подсчёта непрочитанных

> **Realtime:** Таблица `messages` подключена к Supabase Realtime. Клиент подписывается на `INSERT` события с фильтром `receiver_id = currentUser.id`.

---

### 2.13 Таблица `audits`

Внутренние аудиторские проверки.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `title` | `VARCHAR(500)` | Название проверки | NOT NULL |
| `department` | `VARCHAR(255)` | Проверяемый департамент | NOT NULL |
| `status` | `VARCHAR(20)` | Статус | NOT NULL, DEFAULT `'planned'`, CHECK |
| `risk_level` | `VARCHAR(20)` | Уровень риска | CHECK |
| `start_date` | `DATE` | Дата начала | NOT NULL |
| `end_date` | `DATE` | Дата окончания | |
| `auditor_id` | `UUID` | Ответственный аудитор | NOT NULL, FK → `profiles(id)` |
| `summary` | `TEXT` | Итоговое заключение | |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (status):**
```
status IN ('planned', 'active', 'completed', 'cancelled')
```

**CHECK (risk_level):**
```
risk_level IN ('low', 'medium', 'high', 'critical')
```

**Ограничения:**
- `CHECK (end_date IS NULL OR end_date >= start_date)`

**Индексы:**
- `idx_audits_org_status` (org_id, status)
- `idx_audits_auditor` (auditor_id)

---

### 2.14 Таблица `audit_findings`

Замечания, выявленные при аудите.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `audit_id` | `UUID` | Проверка | NOT NULL, FK → `audits(id)` ON DELETE CASCADE |
| `title` | `VARCHAR(500)` | Замечание | NOT NULL |
| `description` | `TEXT` | Подробное описание | |
| `severity` | `VARCHAR(20)` | Критичность | NOT NULL, CHECK |
| `status` | `VARCHAR(20)` | Статус устранения | NOT NULL, DEFAULT `'open'`, CHECK |
| `responsible_id` | `UUID` | Ответственный за устранение | FK → `profiles(id)` |
| `due_date` | `DATE` | Срок устранения | |
| `resolution_comment` | `TEXT` | Комментарий по устранению | |
| `created_at` | `TIMESTAMPTZ` | Дата создания | DEFAULT `now()` |
| `updated_at` | `TIMESTAMPTZ` | Дата обновления | DEFAULT `now()` |

**CHECK (severity):**
```
severity IN ('low', 'medium', 'high', 'critical')
```

**CHECK (status):**
```
status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')
```

**Индексы:**
- `idx_af_org_audit` (org_id, audit_id)
- `idx_af_severity` (org_id, severity) WHERE `status NOT IN ('closed', 'wont_fix')`

---

### 2.15 Таблица `audit_logss`

Неизменяемый журнал всех действий пользователей.

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | `UUID` | Первичный ключ | PK, DEFAULT `gen_random_uuid()` |
| `org_id` | `UUID` | Организация | NOT NULL, FK → `organizations(id)` |
| `user_id` | `UUID` | Кто выполнил | FK → `auth.users(id)` |
| `action_type` | `VARCHAR(100)` | Код действия | NOT NULL |
| `entity_type` | `VARCHAR(50)` | Тип объекта | NOT NULL |
| `entity_id` | `UUID` | ID объекта | |
| `metadata` | `JSONB` | Дополнительные данные | DEFAULT `'{}'::jsonb` |
| `created_at` | `TIMESTAMPTZ` | Время события | NOT NULL, DEFAULT `now()` |

**Важно:**
- Эта таблица **append-only** — никогда не обновляется и не удаляется
- INSERT разрешён **только** через серверную функцию `log_audit_event()`
- Пользователи **не могут** вставлять записи напрямую

**Индексы:**
- `idx_al_org_created` (org_id, created_at DESC)
- `idx_al_org_user` (org_id, user_id, created_at DESC)
- `idx_al_org_entity` (org_id, entity_type, entity_id)
- `idx_al_action_type` (action_type)

**Каталог действий:**

| action_type | entity_type | Описание |
|--------|-------------|----------|
| `auth.login` | `user` | Вход в систему |
| `auth.logout` | `user` | Выход из системы |
| `auth.login_failed` | `user` | Неудачная попытка входа |
| `meeting.create` | `meeting` | Создание заседания |
| `meeting.update` | `meeting` | Изменение заседания |
| `meeting.cancel` | `meeting` | Отмена заседания |
| `meeting.complete` | `meeting` | Завершение заседания |
| `voting.create` | `voting` | Создание голосования |
| `voting.close` | `voting` | Закрытие голосования |
| `vote.cast` | `vote` | Подача голоса |
| `protocol.create` | `protocol` | Создание протокола |
| `protocol.approve` | `protocol` | Утверждение протокола |
| `protocol.ai_generate` | `protocol` | Генерация протокола ИИ |
| `document.upload` | `document` | Загрузка документа |
| `document.approve` | `document_approval` | Согласование документа |
| `document.reject` | `document_approval` | Отклонение документа |
| `document.download` | `document` | Скачивание документа |
| `audit.create` | `audit` | Создание проверки |
| `audit.complete` | `audit` | Завершение проверки |
| `finding.create` | `audit_finding` | Создание замечания |
| `finding.resolve` | `audit_finding` | Устранение замечания |
| `message.send` | `message` | Отправка сообщения |
| `profile.update` | `profile` | Обновление профиля |
| `report.export` | `report` | Экспорт отчёта |

---

## 3. Связи и ограничения

### 3.1 Диаграмма связей (ER)

```
organizations (1)
    │
    ├──< profiles (M)          [org_id]
    │       │
    │       ├──< meeting_participants  [profile_id]
    │       ├──< votes                 [profile_id]
    │       ├──< messages              [sender_id, receiver_id]
    │       ├──< documents             [created_by, responsible_id]
    │       ├──< document_approvals    [approver_id]
    │       ├──< protocols             [created_by, approved_by]
    │       ├──< audits                [auditor_id]
    │       ├──< audit_findings        [responsible_id]
    │       └──< audit_logs             [user_id]
    │
    ├──< meetings (M)          [org_id]
    │       │
    │       ├──< meeting_participants (M)  [meeting_id]
    │       ├──< agenda_items (M)          [meeting_id]
    │       ├──< votings (M)               [meeting_id]
    │       ├──< protocols (M)             [meeting_id]
    │       └──< documents (M)             [meeting_id]  (опционально)
    │
    ├──< votings (M)           [org_id]
    │       │
    │       └──< votes (M)     [voting_id]
    │
    ├──< documents (M)         [org_id]
    │       │
    │       └──< document_approvals (M) [document_id]
    │
    ├──< audits (M)            [org_id]
    │       │
    │       └──< audit_findings (M) [audit_id]
    │
    ├──< messages (M)          [org_id]
    │
    └──< audit_logs (M)         [org_id]

agenda_items (1) ──< votings (M)    [agenda_item_id]  (опционально)
```

### 3.2 Каскадное поведение при удалении

| Родительская таблица | Дочерняя таблица | ON DELETE |
|---------------------|------------------|-----------|
| `auth.users` | `profiles` | CASCADE |
| `meetings` | `meeting_participants` | CASCADE |
| `meetings` | `agenda_items` | CASCADE |
| `meetings` | `votings` | SET NULL |
| `meetings` | `protocols` | RESTRICT |
| `votings` | `votes` | CASCADE |
| `documents` | `document_approvals` | CASCADE |
| `audits` | `audit_findings` | CASCADE |
| `organizations` | все бизнес-таблицы | RESTRICT |
| `profiles` | связанные записи | RESTRICT (кроме каскадов выше) |

> **Принцип:** Мы используем **soft-delete** (поле `is_active = false` или `status = 'cancelled'`) вместо физического удаления. CASCADE применяется только для технических связей (участники при удалении заседания). Данные, важные для аудита, никогда не удаляются физически.

### 3.3 Ключевые бизнес-правила в БД

Реализуются через PostgreSQL-функции и триггеры:

**1. `fn_handle_new_user()`** — Триггер на `auth.users AFTER INSERT`:
- Создаёт запись в `profiles` с `user_id`, `org_id` (из metadata при регистрации)

**2. `fn_log_audit_event()`** — Функция `SECURITY DEFINER`:
- Вызывается из триггеров или клиента
- Единственный способ записи в `audit_logs`
- Принимает: action_type, entity_type, entity_id, metadata

**3. `fn_after_vote_insert()`** — Триггер на `votes AFTER INSERT`:
- Записывает событие в audit_logs
- Проверяет: если все имеющие право проголосовали → закрывает голосование

**4. `fn_after_approval_update()`** — Триггер на `document_approvals AFTER UPDATE`:
- Пересчитывает статус документа:
  - все `approved` → документ = `approved`
  - любой `rejected` → документ = `rejected`

**5. `fn_close_expired_votings()`** — Вызывается по расписанию (pg_cron или Edge Function):
- Закрывает голосования, у которых `deadline < now()` и `status = 'active'`
- Определяет результат (approved / rejected / no_quorum)

**6. `fn_update_timestamps()`** — Триггер на таблицах с `updated_at`:
- Автоматически обновляет `updated_at = now()` при UPDATE

---

## 4. Стратегия RLS

### 4.1 Общие принципы

```
1. RLS ВКЛЮЧЁН на всех таблицах (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
2. Каждая политика фильтрует по org_id текущего пользователя
3. org_id пользователя извлекается из profiles:
   (SELECT org_id FROM profiles WHERE user_id = auth.uid())
4. Роль пользователя извлекается из profiles:
   (SELECT role FROM profiles WHERE user_id = auth.uid())
5. Для удобства создаётся вспомогательная функция:
   - get_my_org_id() RETURNS UUID
   - get_my_role() RETURNS VARCHAR
   - get_my_profile_id() RETURNS UUID
```

### 4.2 Вспомогательные функции

```
fn get_my_org_id():
  RETURN (SELECT org_id FROM profiles WHERE user_id = auth.uid() LIMIT 1)

fn get_my_role():
  RETURN (SELECT role FROM profiles WHERE user_id = auth.uid() LIMIT 1)

fn get_my_profile_id():
  RETURN (SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
```

Функции помечены как `STABLE` и `SECURITY DEFINER` для кэширования в рамках транзакции.

### 4.3 RLS-политики по таблицам

#### `organizations`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `org_select` | `id = get_my_org_id()` — видишь только свою организацию |
| INSERT | — | Запрещено (создаётся при развёртывании) |
| UPDATE | `org_update` | `id = get_my_org_id() AND get_my_role() = 'admin'` |
| DELETE | — | Запрещено |

#### `profiles`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `profiles_select` | `org_id = get_my_org_id()` — видишь всех в своей организации |
| INSERT | — | Только через триггер `handle_new_user` |
| UPDATE | `profiles_update_self` | `user_id = auth.uid()` — только свой профиль (для language, avatar) |
| UPDATE | `profiles_update_admin` | `org_id = get_my_org_id() AND get_my_role() = 'admin'` — админ редактирует всех |
| DELETE | — | Запрещено (деактивация через `is_active = false`) |

#### `meetings`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `meetings_select` | `org_id = get_my_org_id()` |
| INSERT | `meetings_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| UPDATE | `meetings_update` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| DELETE | — | Запрещено (отмена через `status = 'cancelled'`) |

#### `meeting_participants`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `mp_select` | `org_id = get_my_org_id()` |
| INSERT | `mp_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| UPDATE | `mp_update` | `org_id = get_my_org_id() AND (get_my_role() IN ('chairman', 'admin') OR profile_id = get_my_profile_id())` |
| DELETE | `mp_delete` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |

#### `agenda_items`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `agenda_select` | `org_id = get_my_org_id()` |
| INSERT | `agenda_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| UPDATE | `agenda_update` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| DELETE | `agenda_delete` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |

#### `votings`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `votings_select` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'board_member', 'admin')` |
| INSERT | `votings_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| UPDATE | `votings_update` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| DELETE | — | Запрещено |

#### `votes`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT (свои) | `votes_select_own` | `org_id = get_my_org_id() AND profile_id = get_my_profile_id()` |
| SELECT (все) | `votes_select_admin` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| INSERT | `votes_insert` | `org_id = get_my_org_id() AND profile_id = get_my_profile_id() AND get_my_role() IN ('chairman', 'board_member')` |
| UPDATE | — | Запрещено (иммутабельность) |
| DELETE | — | Запрещено (иммутабельность) |

#### `protocols`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `protocols_select` | `org_id = get_my_org_id() AND (status = 'approved' OR get_my_role() IN ('chairman', 'admin'))` |
| INSERT | `protocols_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| UPDATE | `protocols_update` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| DELETE | — | Запрещено |

> Черновики и протоколы на рассмотрении видит только chairman/admin. Остальные видят только утверждённые.

#### `documents`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `docs_select_involved` | `org_id = get_my_org_id() AND (created_by = get_my_profile_id() OR responsible_id = get_my_profile_id() OR id IN (SELECT document_id FROM document_approvals WHERE approver_id = get_my_profile_id()) OR get_my_role() IN ('chairman', 'admin'))` |
| INSERT | `docs_insert` | `org_id = get_my_org_id() AND get_my_role() NOT IN ('department_head')` |
| UPDATE | `docs_update` | `org_id = get_my_org_id() AND (created_by = get_my_profile_id() OR get_my_role() IN ('chairman', 'admin'))` |
| DELETE | — | Запрещено |

#### `document_approvals`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `da_select` | `org_id = get_my_org_id() AND (approver_id = get_my_profile_id() OR get_my_role() IN ('chairman', 'admin'))` |
| INSERT | `da_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| UPDATE | `da_update` | `org_id = get_my_org_id() AND approver_id = get_my_profile_id() AND status = 'pending'` |
| DELETE | — | Запрещено |

> Согласующий может изменить только свою запись, и только если она в статусе `pending`.

#### `messages`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `messages_select` | `org_id = get_my_org_id() AND (sender_id = get_my_profile_id() OR receiver_id = get_my_profile_id())` |
| INSERT | `messages_insert` | `org_id = get_my_org_id() AND sender_id = get_my_profile_id()` |
| UPDATE | `messages_update_read` | `org_id = get_my_org_id() AND receiver_id = get_my_profile_id()` (только `is_read`, `read_at`) |
| DELETE | — | Запрещено |

> Только свои переписки. Отправитель = текущий пользователь. Прочитать (is_read) может только получатель.

#### `audits`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `audits_select` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin', 'auditor')` |
| INSERT | `audits_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('admin', 'auditor')` |
| UPDATE | `audits_update` | `org_id = get_my_org_id() AND get_my_role() IN ('admin', 'auditor')` |
| DELETE | — | Запрещено |

#### `audit_findings`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `af_select` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin', 'auditor')` |
| INSERT | `af_insert` | `org_id = get_my_org_id() AND get_my_role() IN ('admin', 'auditor')` |
| UPDATE | `af_update` | `org_id = get_my_org_id() AND get_my_role() IN ('admin', 'auditor')` |
| DELETE | — | Запрещено |

#### `audit_logs`

| Операция | Политика | Правило |
|----------|----------|---------|
| SELECT | `al_select` | `org_id = get_my_org_id() AND get_my_role() IN ('chairman', 'admin')` |
| INSERT | — | Запрещено для клиентов. Только через `SECURITY DEFINER` функцию |
| UPDATE | — | Запрещено |
| DELETE | — | Запрещено |

### 4.4 Масштабирование RLS для SaaS

При добавлении мультитенантности:

```
Текущее состояние (1 компания):
  get_my_org_id() всегда возвращает один и тот же UUID

Будущее (SaaS, много компаний):
  get_my_org_id() возвращает org_id конкретного пользователя
  Все политики продолжают работать БЕЗ ИЗМЕНЕНИЙ
  Данные разных организаций полностью изолированы

Что нужно добавить для SaaS:
  1. Таблица subscriptions (тарифы, лимиты)
  2. Роль super_admin (управление организациями)
  3. Возможность принадлежать к нескольким организациям (org_memberships)
```

---

## 5. Матрица ролей и разрешений

### 5.1 Роли и их назначение

| Код роли | Название (RU) | Описание |
|----------|---------------|----------|
| `chairman` | Председатель НС | Глава Наблюдательного совета. Максимальные права, кроме технического администрирования |
| `board_member` | Член НС | Участник совета с правом голоса. Просмотр, участие в заседаниях и голосованиях |
| `executive` | Член Правления | Исполнительный орган. Ограниченный доступ, коммуникация, документы |
| `admin` | Администратор | Корпоративный секретарь. Управляет системой, но не голосует |
| `auditor` | Аудитор | Внутренний аудитор. Доступ к проверкам и статистике |
| `department_head` | Руководитель подразделения | Минимальный доступ: чат и документы (назначенные) |

### 5.2 Детальная матрица разрешений по модулям

#### Модуль: Заседания (meetings)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр списка заседаний | **да** | **да** | только свои | **да** | нет | нет |
| Просмотр деталей заседания | **да** | **да** | если участник | **да** | нет | нет |
| Создание заседания | **да** | нет | нет | **да** | нет | нет |
| Редактирование заседания | **да** | нет | нет | **да** | нет | нет |
| Отмена заседания | **да** | нет | нет | **да** | нет | нет |
| Управление участниками | **да** | нет | нет | **да** | нет | нет |
| Управление повесткой | **да** | нет | нет | **да** | нет | нет |

#### Модуль: Голосования (votings + votes)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр голосований | **да** | **да** | нет | **да** | нет | нет |
| Создание голосования | **да** | нет | нет | **да** | нет | нет |
| Голосование (подача голоса) | **ДА** | **ДА** | нет | нет | нет | нет |
| Просмотр всех голосов (поимённо) | **да** | нет | нет | **да** | нет | нет |
| Просмотр своего голоса | **да** | **да** | нет | нет | нет | нет |
| Закрытие голосования досрочно | **да** | нет | нет | **да** | нет | нет |
| Просмотр результатов (агрегат) | **да** | **да** | нет | **да** | нет | нет |

#### Модуль: Протоколы (protocols)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр утверждённых | **да** | **да** | нет | **да** | **да** | нет |
| Просмотр черновиков | **да** | нет | нет | **да** | нет | нет |
| Создание протокола | **да** | нет | нет | **да** | нет | нет |
| Генерация брифа | **да** | нет | нет | **да** | нет | нет |
| Генерация протокола (ИИ) | **да** | нет | нет | **да** | нет | нет |
| Редактирование | **да** | нет | нет | **да** | нет | нет |
| Утверждение | **да** | нет | нет | нет | нет | нет |

#### Модуль: Документы (documents + document_approvals)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр всех документов | **да** | нет | нет | **да** | нет | нет |
| Просмотр назначенных | **да** | **да** | **да** | **да** | **да** | **да** |
| Загрузка (создание) | **да** | **да** | **да** | **да** | **да** | нет |
| Скачивание | **да** | если участник | если участник | **да** | если участник | если участник |
| Согласование | **да** | если назначен | если назначен | **да** | если назначен | нет |
| Назначение согласующих | **да** | нет | нет | **да** | нет | нет |

#### Модуль: Чат (messages)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр контактов | **да** | **да** | **да** | **да** | нет | **да** |
| Отправка сообщений | **да** | **да** | **да** | **да** | нет | **да** |
| Чтение сообщений | свои | свои | свои | свои | нет | свои |

#### Модуль: Внутренний аудит (audits + audit_findings)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр проверок | **да** | нет | нет | **да** | **да** | нет |
| Создание проверки | нет | нет | нет | **да** | **да** | нет |
| Редактирование проверки | нет | нет | нет | **да** | **да** | нет |
| Просмотр замечаний | **да** | нет | нет | **да** | **да** | нет |
| Создание замечаний | нет | нет | нет | **да** | **да** | нет |
| Экспорт отчётов | **да** | нет | нет | **да** | **да** | нет |

#### Модуль: Статистика

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Полная статистика | **да** | нет | нет | **да** | **да** | нет |
| Базовая статистика (свои заседания) | **да** | **да** | нет | **да** | нет | нет |
| Экспорт отчётов | **да** | нет | нет | **да** | **да** | нет |

#### Модуль: Аудит-лог (audit_logs)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр | **да** | нет | нет | **да** | нет | нет |

#### Модуль: Управление пользователями (profiles)

| Действие | chairman | board_member | executive | admin | auditor | department_head |
|----------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------------:|
| Просмотр всех профилей | **да** | **да** | **да** | **да** | **да** | нет |
| Редактирование своего профиля | **да** | **да** | **да** | **да** | **да** | **да** |
| Создание пользователей | нет | нет | нет | **да** | нет | нет |
| Редактирование чужих профилей | нет | нет | нет | **да** | нет | нет |
| Деактивация пользователей | нет | нет | нет | **да** | нет | нет |
| Смена роли | нет | нет | нет | **да** | нет | нет |

### 5.3 Сводная таблица доступа к разделам

| Раздел | chairman | board_member | executive | admin | auditor | dept_head |
|--------|:--------:|:------------:|:---------:|:-----:|:-------:|:---------:|
| Информация об Обществе | ПОЛНЫЙ | ЧТЕНИЕ | ЧТЕНИЕ | ПОЛНЫЙ | ЧТЕНИЕ | -- |
| Панель управления | ПОЛНЫЙ | ЧТЕНИЕ | ЧАСТИЧНО | ПОЛНЫЙ | ЧАСТИЧНО | -- |
| Календарь | ПОЛНЫЙ | ЧТЕНИЕ | ЧАСТИЧНО | ПОЛНЫЙ | -- | -- |
| Голосование | ПОЛНЫЙ+ГОЛОС | ГОЛОС+ЧТЕНИЕ | -- | УПРАВЛ. | -- | -- |
| Протоколы | ПОЛНЫЙ | ЧТЕНИЕ (утв.) | -- | ПОЛНЫЙ | ЧТЕНИЕ (утв.) | -- |
| Чат | ПОЛНЫЙ | ПОЛНЫЙ | ПОЛНЫЙ | ПОЛНЫЙ | -- | ПОЛНЫЙ |
| Документооборот | ПОЛНЫЙ | УЧАСТИЕ | УЧАСТИЕ | ПОЛНЫЙ | УЧАСТИЕ | ЧТЕНИЕ (назн.) |
| Видеоконференция | ЗАПУСК | УЧАСТИЕ | ПО ПРИГЛАШ. | ЗАПУСК | ПО ПРИГЛАШ. | ПО ПРИГЛАШ. |
| Статистика | ПОЛНЫЙ | ЧАСТИЧНО | -- | ПОЛНЫЙ | ПОЛНЫЙ | -- |
| Внутренний аудит | ЧТЕНИЕ | -- | -- | ПОЛНЫЙ | ПОЛНЫЙ | -- |
| Аудит-лог | ЧТЕНИЕ | -- | -- | ЧТЕНИЕ | -- | -- |

---

## 6. Дорожная карта MVP (по фазам)

### Фаза 0: Фундамент (1 неделя)

**Цель:** Настроить инфраструктуру, БД, аутентификацию

| Задача | Описание |
|--------|----------|
| Настройка проекта Supabase | Создать проект, настроить auth-провайдер (email/password) |
| Миграция БД: ядро | `organizations`, `profiles`, вспомогательные функции (`get_my_org_id`, `get_my_role`, `get_my_profile_id`) |
| Триггер `handle_new_user` | Автоматическое создание профиля при регистрации |
| Триггер `update_timestamps` | Автообновление `updated_at` |
| RLS на `organizations` и `profiles` | Базовые политики |
| Seed-данные | 1 организация, admin-пользователь |
| Настройка Supabase Storage | Бакеты: `avatars`, `documents` |
| Инициализация React-проекта | Vite + TypeScript + Tailwind + shadcn/ui + Supabase SDK |
| Страница авторизации | Login / Logout |
| Базовый layout | Sidebar, роутинг, защита маршрутов по роли |

**Результат:** Работающий каркас — вход в систему, sidebar, роутинг

---

### Фаза 1: Заседания + Календарь (1.5 недели)

**Цель:** Основной цикл работы НС — планирование заседаний

| Задача | Описание |
|--------|----------|
| Миграция БД: `meetings`, `meeting_participants`, `agenda_items` | Таблицы + RLS-политики |
| Страница «Календарь собраний» | Месячный/недельный вид, навигация |
| Создание/редактирование заседания | Форма: название, тип, дата, время, формат, место |
| Управление участниками | Добавление/удаление участников заседания |
| Повестка дня | CRUD для пунктов повестки с drag-n-drop сортировкой |
| Страница «Панель управления» | Виджет «Предстоящие собрания» |
| Аудит-лог для заседаний | Логирование создания, изменения, отмены |

**Результат:** Полный цикл управления заседаниями с календарём

---

### Фаза 2: Голосование (1.5 недели)

**Цель:** Система принятия решений

| Задача | Описание |
|--------|----------|
| Миграция БД: `votings`, `votes` | Таблицы + RLS + VIEW `voting_results` |
| Создание голосования | Привязка к заседанию/пункту повестки, дедлайн, кворум |
| Страница «Система голосования» | Список активных/завершённых голосований |
| Подача голоса | За / Против / Воздержался + блокировка повторного голосования |
| Прогресс-бар | Визуализация текущего состояния голосования |
| Автозакрытие по дедлайну | Edge Function или pg_cron |
| Расчёт результата | Автоматическое определение: одобрено / отклонено / нет кворума |
| Виджет на Dashboard | «Активные голосования» |
| Аудит-лог для голосований | Каждый голос фиксируется в журнале |

**Результат:** Полнофункциональная система голосования

---

### Фаза 3: Документооборот (1 неделя)

**Цель:** Загрузка, хранение и согласование документов

| Задача | Описание |
|--------|----------|
| Миграция БД: `documents`, `document_approvals` | Таблицы + RLS + триггер обновления статуса |
| Supabase Storage: политики для бакета `documents` | RLS на уровне Storage |
| Загрузка документа | Форма + upload в Storage + запись в БД |
| Страница «Документооборот» | Три секции: на согласование, мои, согласованные |
| Workflow согласования | Назначение согласующих, согласование/отклонение |
| Скачивание документа | Signed URL из Supabase Storage |
| Аудит-лог для документов | Загрузка, согласование, отклонение, скачивание |

**Результат:** Полный цикл документооборота с согласованием

---

### Фаза 4: Чат (1 неделя)

**Цель:** Коммуникация между участниками

| Задача | Описание |
|--------|----------|
| Миграция БД: `messages` | Таблица + RLS + индексы для производительности |
| Supabase Realtime | Подписка на новые сообщения |
| Страница «Чат» | Список контактов + окно переписки |
| Отправка сообщений | Ввод текста, отправка, отображение |
| Статус прочтения | Пометка `is_read` при открытии чата |
| Онлайн-статус | Через `last_seen_at` (обновление каждые 30 сек) |
| Поиск контактов | Фильтрация по имени |
| Счётчик непрочитанных | Бейдж в sidebar |

**Результат:** Работающий мессенджер в реальном времени

---

### Фаза 5: Протоколы + ИИ (1 неделя)

**Цель:** Формирование протоколов с помощью ИИ

| Задача | Описание |
|--------|----------|
| Миграция БД: `protocols` | Таблица + RLS |
| Страница «Протоколы» | Двухпанельный интерфейс |
| Генерация брифа | Сбор данных заседания (повестка, участники, голосования) в текстовый бриф |
| Edge Function: `generate-protocol` | Вызов AI API (Claude/GPT) для генерации протокола из брифа |
| Редактирование протокола | Текстовый редактор |
| Утверждение протокола | Смена статуса, фиксация кто утвердил |
| Список недавних протоколов | С фильтрацией по статусу |
| Аудит-лог | Создание, ИИ-генерация, утверждение |

**Результат:** ИИ-генерация протоколов + ручное редактирование

---

### Фаза 6: Информация об Обществе + Профили (0.5 недели)

**Цель:** Справочник по органам управления

| Задача | Описание |
|--------|----------|
| Страница «Информация об Обществе» | Три вкладки: НС / Правление / KPI |
| Карточки участников | Аватар, ФИО, должность, образование, опыт, контакты, полномочия |
| Сводные карточки | Количество членов НС, Правления, Управляющих |
| Профиль текущего пользователя | Просмотр + редактирование (язык, аватар) |
| Управление пользователями (admin) | Список, создание, деактивация, смена роли |

**Результат:** Полный справочник + управление пользователями

---

### Фаза 7: Аудит + Статистика (1 неделя)

**Цель:** Контроль и аналитика

| Задача | Описание |
|--------|----------|
| Миграция БД: `audits`, `audit_findings` | Таблицы + RLS |
| Миграция БД: `audit_logs` | Таблица + функция `log_audit_event` + подключение триггеров ко всем таблицам |
| Страница «Внутренний аудит» | Сводные карточки, таблица проверок, замечания |
| Создание/управление проверками | CRUD для аудитора |
| Страница «Статистика» | Сводные карточки, таблица истории собраний |
| Фильтрация и экспорт | По органу управления, периоду. Экспорт в PDF (Edge Function) |
| Аудит-лог: просмотр | Страница для chairman/admin |

**Результат:** Полный модуль аудита + статистика

---

### Фаза 8: Финализация MVP (1 неделя)

**Цель:** Полировка, тестирование, деплой

| Задача | Описание |
|--------|----------|
| Мультиязычность (i18n) | react-i18next — русский, узбекский, английский |
| Видеоконференция | Интеграция с Jitsi Meet (iframe) |
| Общее собрание акционеров | Страница с вкладками, материалами |
| Адаптивная вёрстка | Корректное отображение на планшетах |
| E2E тестирование | Основные сценарии |
| Деплой на beget.com | Сборка фронтенда, настройка домена, SSL |
| Seed-данные для демо | Тестовые пользователи, заседания, голосования |

**Результат:** Готовый MVP для демонстрации и пилотного запуска

---

### Сводный таймлайн

```
Фаза 0 ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Неделя 1
Фаза 1 ░░░░░░░░░░██████████████░░░░░░░░░░░░░░░  Неделя 2-3
Фаза 2 ░░░░░░░░░░░░░░░░░░░░░░░░██████████████░  Неделя 3-4
Фаза 3 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██  Неделя 5
Фаза 4 Неделя 6 ██████████
Фаза 5 Неделя 7 ██████████
Фаза 6 Неделя 7.5 █████
Фаза 7 Неделя 8 ██████████
Фаза 8 Неделя 9 ██████████

ИТОГО: ~9 недель до MVP
```

---

*Документ является техническим руководством для разработки. Все таблицы, RLS-политики и функции будут реализованы в виде Supabase-миграций.*
