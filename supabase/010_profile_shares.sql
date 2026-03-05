-- 010: Добавляем количество акций в профиль пользователя
-- Каждый акционер владеет определённым количеством акций,
-- которое учитывается при голосовании (1 голос = кол-во акций)

alter table public.profiles
  add column if not exists shares_count int not null default 0;

-- Для тестирования: обновите shares_count для ваших пользователей, например:
-- update public.profiles set shares_count = 100000 where full_name = 'Dilshod Isakov';
