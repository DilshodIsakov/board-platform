-- 011: Дополнительные поля для голосований
-- Описание, крайний срок, общее количество голосующих

alter table public.votings
  add column if not exists description text not null default '',
  add column if not exists deadline date,
  add column if not exists total_members int not null default 8;
