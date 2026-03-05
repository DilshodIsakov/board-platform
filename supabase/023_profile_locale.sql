-- ============================================================
-- Board Platform — Добавление поля locale в profiles
-- Запускать в Supabase SQL Editor
-- ============================================================

alter table public.profiles
  add column if not exists locale text not null default 'ru';
