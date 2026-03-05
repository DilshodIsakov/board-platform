-- 007: Добавить колонку meet_url для ссылки на видеоконференцию (Google Meet)
alter table public.meetings
  add column if not exists meet_url text;
