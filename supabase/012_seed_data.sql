-- ============================================================
-- 012: Наполнение платформы данными АО «Региональные электрические сети»
-- Выполнять ПОСЛЕ всех предыдущих миграций (001-011)
-- Создаёт РЕАЛЬНЫХ пользователей с логинами
-- Пароль для всех: Test1234!
-- ============================================================

-- Шаг 1: Обновляем название организации
UPDATE public.organizations
SET name = 'АО «Региональные электрические сети»'
WHERE id = (SELECT organization_id FROM public.profiles LIMIT 1);

-- Шаг 2: Обновляем ваш профиль (Dilshod Isakov)
UPDATE public.profiles
SET shares_count = 1200000
WHERE full_name = 'Dilshod Isakov';

-- Шаг 3: Временно заменяем триггер-функцию на пустышку
-- (не требует owner прав на auth.users, только на public функцию)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Временно отключено для seed-данных
  RETURN new;
END;
$$;

-- Шаг 4: Создаём всё
DO $$
DECLARE
  org_uuid uuid;
  admin_id uuid;
  pwd_hash text;

  -- НС (Наблюдательный совет) — 7 членов
  ns_chair uuid := gen_random_uuid();
  ns_member1 uuid := gen_random_uuid();
  ns_member2 uuid := gen_random_uuid();
  ns_member3 uuid := gen_random_uuid();
  ns_member4 uuid := gen_random_uuid();
  ns_member5 uuid := gen_random_uuid();
  ns_member6 uuid := gen_random_uuid();

  -- Правление — 6 членов
  pr_chair uuid := gen_random_uuid();
  pr_first_dep1 uuid := gen_random_uuid();
  pr_first_dep2 uuid := gen_random_uuid();
  pr_dep1 uuid := gen_random_uuid();
  pr_dep2 uuid := gen_random_uuid();
  pr_dep3 uuid := gen_random_uuid();

  -- Исполнительный орган — 10 членов
  ex_accountant uuid := gen_random_uuid();
  ex_head1 uuid := gen_random_uuid();
  ex_head2 uuid := gen_random_uuid();
  ex_head3 uuid := gen_random_uuid();
  ex_head4 uuid := gen_random_uuid();
  ex_head5 uuid := gen_random_uuid();
  ex_head6 uuid := gen_random_uuid();
  ex_head7 uuid := gen_random_uuid();
  ex_head8 uuid := gen_random_uuid();
  ex_head9 uuid := gen_random_uuid();

  -- Аудитор и секретарь
  auditor_id uuid := gen_random_uuid();
  secretary_id uuid := gen_random_uuid();

  -- Заседания НС
  meeting1_id uuid := gen_random_uuid();
  meeting2_id uuid := gen_random_uuid();
  meeting3_id uuid := gen_random_uuid();

  -- Собрания акционеров
  sh_meeting1_id uuid := gen_random_uuid();
  sh_meeting2_id uuid := gen_random_uuid();

  -- Повестка заседания НС
  agenda1 uuid := gen_random_uuid();
  agenda2 uuid := gen_random_uuid();
  agenda3 uuid := gen_random_uuid();
  agenda4 uuid := gen_random_uuid();

  -- Повестка для прошлых заседаний (чтобы привязать решения)
  past_agenda1 uuid := gen_random_uuid();
  past_agenda2 uuid := gen_random_uuid();
  past_agenda3 uuid := gen_random_uuid();
  past_agenda4 uuid := gen_random_uuid();
  past_agenda5 uuid := gen_random_uuid();

  -- Повестка собрания акционеров
  sh_agenda1 uuid := gen_random_uuid();
  sh_agenda2 uuid := gen_random_uuid();
  sh_agenda3 uuid := gen_random_uuid();
  sh_agenda4 uuid := gen_random_uuid();
  sh_agenda5 uuid := gen_random_uuid();

  -- Голосования
  voting1_id uuid := gen_random_uuid();
  voting2_id uuid := gen_random_uuid();
  voting3_id uuid := gen_random_uuid();

BEGIN
  SELECT organization_id INTO org_uuid FROM public.profiles LIMIT 1;
  SELECT id INTO admin_id FROM public.profiles WHERE full_name = 'Dilshod Isakov' LIMIT 1;

  pwd_hash := crypt('Test1234!', gen_salt('bf'));

  -- ================================================================
  -- AUTH USERS
  -- ================================================================

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000', ns_chair,   'authenticated', 'authenticated', 'karimov@res.test',       pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Каримов Бахтиёр Рахимович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ns_member1, 'authenticated', 'authenticated', 'sultanova@res.test',     pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Султанова Малика Азизовна"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ns_member2, 'authenticated', 'authenticated', 'rakhmatullaev@res.test', pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Рахматуллаев Фарход Ильхомович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ns_member3, 'authenticated', 'authenticated', 'yuldasheva@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Юлдашева Нилуфар Шавкатовна"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ns_member4, 'authenticated', 'authenticated', 'mirzaev@res.test',      pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Мирзаев Азиз Бахтиёрович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ns_member5, 'authenticated', 'authenticated', 'khasanova@res.test',    pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Хасанова Дилноза Уктамовна"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ns_member6, 'authenticated', 'authenticated', 'abdullaev@res.test',    pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Абдуллаев Тимур Равшанович"}', now(), now(), '', '');

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000', pr_chair,      'authenticated', 'authenticated', 'normatov@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Норматов Шерзод Алишерович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', pr_first_dep1, 'authenticated', 'authenticated', 'inoyatov@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Иноятов Рустам Камолович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', pr_first_dep2, 'authenticated', 'authenticated', 'tashmatov@res.test', pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ташматов Бобур Нодирович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', pr_dep1,       'authenticated', 'authenticated', 'safarov@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Сафаров Жасур Бахромович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', pr_dep2,       'authenticated', 'authenticated', 'kadirov@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Кадиров Отабек Исломович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', pr_dep3,       'authenticated', 'authenticated', 'tursunov@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Турсунов Дильшод Фаррухович"}', now(), now(), '', '');

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000', ex_accountant, 'authenticated', 'authenticated', 'nazarova@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Назарова Гулчехра Хамидовна"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head1,      'authenticated', 'authenticated', 'akbarov@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Акбаров Шухрат Тохирович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head2,      'authenticated', 'authenticated', 'usmanova@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Усманова Феруза Рахимовна"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head3,      'authenticated', 'authenticated', 'rasulov@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Расулов Нодир Бахтиёрович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head4,      'authenticated', 'authenticated', 'kholmatova@res.test',pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Холматова Зулфия Абдуллаевна"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head5,      'authenticated', 'authenticated', 'mamatov@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Маматов Улугбек Набиевич"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head6,      'authenticated', 'authenticated', 'ergashev@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Эргашев Бахром Тулкинович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head7,      'authenticated', 'authenticated', 'zhuraev@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Жураев Сардор Камолович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head8,      'authenticated', 'authenticated', 'nurmatov@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Нурматов Ботир Рашидович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', ex_head9,      'authenticated', 'authenticated', 'azimova@res.test',   pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Азимова Шахло Равшановна"}', now(), now(), '', '');

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000', auditor_id,   'authenticated', 'authenticated', 'khamraev@res.test', pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Хамраев Достон Тахирович"}', now(), now(), '', ''),
    ('00000000-0000-0000-0000-000000000000', secretary_id, 'authenticated', 'authenticated', 'isakova@res.test',  pwd_hash, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Исакова Лола Баходировна"}', now(), now(), '', '');

  -- ================================================================
  -- AUTH IDENTITIES
  -- ================================================================
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES
    (gen_random_uuid(), ns_chair,      'karimov@res.test',       jsonb_build_object('sub', ns_chair::text,      'email', 'karimov@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ns_member1,    'sultanova@res.test',     jsonb_build_object('sub', ns_member1::text,    'email', 'sultanova@res.test',     'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ns_member2,    'rakhmatullaev@res.test', jsonb_build_object('sub', ns_member2::text,    'email', 'rakhmatullaev@res.test', 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ns_member3,    'yuldasheva@res.test',    jsonb_build_object('sub', ns_member3::text,    'email', 'yuldasheva@res.test',    'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ns_member4,    'mirzaev@res.test',       jsonb_build_object('sub', ns_member4::text,    'email', 'mirzaev@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ns_member5,    'khasanova@res.test',     jsonb_build_object('sub', ns_member5::text,    'email', 'khasanova@res.test',     'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ns_member6,    'abdullaev@res.test',     jsonb_build_object('sub', ns_member6::text,    'email', 'abdullaev@res.test',     'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), pr_chair,      'normatov@res.test',      jsonb_build_object('sub', pr_chair::text,      'email', 'normatov@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), pr_first_dep1, 'inoyatov@res.test',      jsonb_build_object('sub', pr_first_dep1::text, 'email', 'inoyatov@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), pr_first_dep2, 'tashmatov@res.test',     jsonb_build_object('sub', pr_first_dep2::text, 'email', 'tashmatov@res.test',     'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), pr_dep1,       'safarov@res.test',       jsonb_build_object('sub', pr_dep1::text,       'email', 'safarov@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), pr_dep2,       'kadirov@res.test',       jsonb_build_object('sub', pr_dep2::text,       'email', 'kadirov@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), pr_dep3,       'tursunov@res.test',      jsonb_build_object('sub', pr_dep3::text,       'email', 'tursunov@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_accountant, 'nazarova@res.test',      jsonb_build_object('sub', ex_accountant::text, 'email', 'nazarova@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head1,      'akbarov@res.test',       jsonb_build_object('sub', ex_head1::text,      'email', 'akbarov@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head2,      'usmanova@res.test',      jsonb_build_object('sub', ex_head2::text,      'email', 'usmanova@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head3,      'rasulov@res.test',       jsonb_build_object('sub', ex_head3::text,      'email', 'rasulov@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head4,      'kholmatova@res.test',    jsonb_build_object('sub', ex_head4::text,      'email', 'kholmatova@res.test',    'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head5,      'mamatov@res.test',       jsonb_build_object('sub', ex_head5::text,      'email', 'mamatov@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head6,      'ergashev@res.test',      jsonb_build_object('sub', ex_head6::text,      'email', 'ergashev@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head7,      'zhuraev@res.test',       jsonb_build_object('sub', ex_head7::text,      'email', 'zhuraev@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head8,      'nurmatov@res.test',      jsonb_build_object('sub', ex_head8::text,      'email', 'nurmatov@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), ex_head9,      'azimova@res.test',       jsonb_build_object('sub', ex_head9::text,      'email', 'azimova@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), auditor_id,    'khamraev@res.test',      jsonb_build_object('sub', auditor_id::text,    'email', 'khamraev@res.test',      'email_verified', true, 'phone_verified', false), 'email', now(), now(), now()),
    (gen_random_uuid(), secretary_id,  'isakova@res.test',       jsonb_build_object('sub', secretary_id::text,  'email', 'isakova@res.test',       'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());

  -- ================================================================
  -- ПРОФИЛИ (profiles.id = auth.users.id)
  -- ================================================================
  INSERT INTO public.profiles (id, organization_id, role, full_name, shares_count) VALUES
    (ns_chair,   org_uuid, 'chairman',     'Каримов Бахтиёр Рахимович',      1500000),
    (ns_member1, org_uuid, 'board_member', 'Султанова Малика Азизовна',        800000),
    (ns_member2, org_uuid, 'board_member', 'Рахматуллаев Фарход Ильхомович',   900000),
    (ns_member3, org_uuid, 'board_member', 'Юлдашева Нилуфар Шавкатовна',      700000),
    (ns_member4, org_uuid, 'board_member', 'Мирзаев Азиз Бахтиёрович',         650000),
    (ns_member5, org_uuid, 'board_member', 'Хасанова Дилноза Уктамовна',       550000),
    (ns_member6, org_uuid, 'board_member', 'Абдуллаев Тимур Равшанович',        600000),
    (pr_chair,      org_uuid, 'executive', 'Норматов Шерзод Алишерович',        500000),
    (pr_first_dep1, org_uuid, 'executive', 'Иноятов Рустам Камолович',          350000),
    (pr_first_dep2, org_uuid, 'executive', 'Ташматов Бобур Нодирович',          350000),
    (pr_dep1,       org_uuid, 'executive', 'Сафаров Жасур Бахромович',          200000),
    (pr_dep2,       org_uuid, 'executive', 'Кадиров Отабек Исломович',          150000),
    (pr_dep3,       org_uuid, 'executive', 'Турсунов Дильшод Фаррухович',       150000),
    (ex_accountant, org_uuid, 'department_head', 'Назарова Гулчехра Хамидовна',   0),
    (ex_head1,      org_uuid, 'department_head', 'Акбаров Шухрат Тохирович',      0),
    (ex_head2,      org_uuid, 'department_head', 'Усманова Феруза Рахимовна',      0),
    (ex_head3,      org_uuid, 'department_head', 'Расулов Нодир Бахтиёрович',      0),
    (ex_head4,      org_uuid, 'department_head', 'Холматова Зулфия Абдуллаевна',   0),
    (ex_head5,      org_uuid, 'department_head', 'Маматов Улугбек Набиевич',       0),
    (ex_head6,      org_uuid, 'department_head', 'Эргашев Бахром Тулкинович',      0),
    (ex_head7,      org_uuid, 'department_head', 'Жураев Сардор Камолович',        0),
    (ex_head8,      org_uuid, 'department_head', 'Нурматов Ботир Рашидович',       0),
    (ex_head9,      org_uuid, 'department_head', 'Азимова Шахло Равшановна',        0),
    (auditor_id,   org_uuid, 'auditor', 'Хамраев Достон Тахирович',               0),
    (secretary_id, org_uuid, 'admin',   'Исакова Лола Баходировна',                0);

  -- ================================================================
  -- ЗАСЕДАНИЯ НС
  -- ================================================================
  INSERT INTO public.meetings (id, organization_id, title, start_at, status, meet_url, created_by) VALUES
    (meeting1_id, org_uuid, 'Квартальное заседание НС',
     '2026-01-08 10:00:00+05', 'completed', 'https://meet.google.com/abc-defg-hij', ns_chair),
    (meeting2_id, org_uuid, 'Стратегическая сессия НС',
     '2026-01-10 14:00:00+05', 'completed', NULL, ns_chair),
    (meeting3_id, org_uuid, 'Внеочередное заседание НС — Утверждение бюджета 2026',
     '2026-03-15 10:00:00+05', 'scheduled', 'https://meet.google.com/xyz-uvwx-rst', ns_chair);

  -- ================================================================
  -- ПОВЕСТКА заседаний
  -- ================================================================
  INSERT INTO public.agenda_items (id, meeting_id, org_id, title, order_index) VALUES
    (past_agenda1, meeting1_id, org_uuid, 'Утверждение финансового отчёта за Q4 2025', 1),
    (past_agenda2, meeting1_id, org_uuid, 'Инвестиционная программа модернизации', 2),
    (past_agenda3, meeting1_id, org_uuid, 'Назначение ревизионной комиссии', 3),
    (past_agenda4, meeting2_id, org_uuid, 'Стратегия цифровой трансформации 2026-2030', 1),
    (past_agenda5, meeting2_id, org_uuid, 'Создание комитета по ESG', 2),
    (agenda1, meeting3_id, org_uuid, 'Утверждение бюджета на 2026 год', 1),
    (agenda2, meeting3_id, org_uuid, 'Назначение нового CFO', 2),
    (agenda3, meeting3_id, org_uuid, 'Стратегия развития на 5 лет', 3),
    (agenda4, meeting3_id, org_uuid, 'Разное', 4);

  -- ================================================================
  -- РЕШЕНИЯ
  -- ================================================================
  INSERT INTO public.decisions (agenda_item_id, org_id, decision_text, status) VALUES
    (past_agenda1, org_uuid, 'Наблюдательный совет единогласно утвердил финансовый отчёт за четвёртый квартал 2025 года.', 'approved'),
    (past_agenda2, org_uuid, 'Одобрена инвестиционная программа на модернизацию подстанций в размере 2.5 млрд сум.', 'approved'),
    (past_agenda3, org_uuid, 'Назначен состав ревизионной комиссии для проверки деятельности правления.', 'approved'),
    (past_agenda4, org_uuid, 'Принята стратегия цифровой трансформации компании на 2026-2030 годы.', 'approved'),
    (past_agenda5, org_uuid, 'Решено создать комитет по устойчивому развитию при Наблюдательном совете.', 'approved');

  -- ================================================================
  -- ГОЛОСОВАНИЯ
  -- ================================================================
  INSERT INTO public.votings (id, agenda_item_id, org_id, title, description, status, deadline, total_members, created_by) VALUES
    (voting1_id, agenda1, org_uuid,
     'Утверждение бюджета на 2026 год',
     'Предлагается утвердить бюджет компании на 2026 год в размере 500 млн сум с распределением по департаментам согласно приложенному документу.',
     'open', '2026-03-10', 7, ns_chair),
    (voting2_id, agenda2, org_uuid,
     'Назначение нового CFO',
     'Рассматривается кандидатура Азизы Шариповой на должность финансового директора.',
     'open', '2026-03-12', 7, ns_chair),
    (voting3_id, agenda3, org_uuid,
     'Стратегия развития на 5 лет',
     'Утверждение стратегического плана развития компании на период 2026-2031 гг.',
     'open', '2026-03-15', 7, ns_chair);

  -- Голоса
  INSERT INTO public.votes (voting_id, org_id, voter_id, choice) VALUES
    (voting1_id, org_uuid, ns_chair,   'for'),
    (voting1_id, org_uuid, ns_member1, 'for'),
    (voting1_id, org_uuid, ns_member2, 'for'),
    (voting1_id, org_uuid, ns_member3, 'against'),
    (voting1_id, org_uuid, ns_member4, 'for'),
    (voting2_id, org_uuid, ns_chair,   'for'),
    (voting2_id, org_uuid, ns_member1, 'against'),
    (voting2_id, org_uuid, ns_member2, 'for');

  -- ================================================================
  -- СОБРАНИЯ АКЦИОНЕРОВ
  -- ================================================================
  INSERT INTO public.shareholder_meetings (id, organization_id, title, meeting_type, meeting_date, status, total_shares, voted_shares, created_by) VALUES
    (sh_meeting1_id, org_uuid, 'Годовое общее собрание акционеров 2026',
     'annual', '2026-04-15 10:00:00+05', 'scheduled', 8600000, 0, ns_chair),
    (sh_meeting2_id, org_uuid, 'Внеочередное собрание акционеров',
     'extraordinary', '2025-12-20 14:00:00+05', 'completed', 8600000, 5400000, ns_chair);

  INSERT INTO public.shareholder_agenda_items (id, meeting_id, title, order_index) VALUES
    (sh_agenda1, sh_meeting1_id, 'Утверждение годового отчёта за 2025 год', 1),
    (sh_agenda2, sh_meeting1_id, 'Утверждение финансовой отчётности и распределение прибыли', 2),
    (sh_agenda3, sh_meeting1_id, 'Избрание членов Наблюдательного совета', 3),
    (sh_agenda4, sh_meeting1_id, 'Утверждение аудитора на 2026 год', 4),
    (sh_agenda5, sh_meeting1_id, 'Утверждение размера дивидендов', 5);

  INSERT INTO public.shareholder_materials (meeting_id, title, status) VALUES
    (sh_meeting1_id, 'Годовой отчёт за 2025 год', 'available'),
    (sh_meeting1_id, 'Аудиторское заключение', 'available'),
    (sh_meeting1_id, 'Отчёт Наблюдательного совета', 'available'),
    (sh_meeting1_id, 'Проект распределения прибыли', 'pending'),
    (sh_meeting1_id, 'Список кандидатов в НС', 'pending');

  RAISE NOTICE '';
  RAISE NOTICE '=============================================';
  RAISE NOTICE 'ДАННЫЕ УСПЕШНО ЗАГРУЖЕНЫ!';
  RAISE NOTICE '=============================================';
  RAISE NOTICE 'Пароль для всех: Test1234!';
  RAISE NOTICE 'karimov@res.test     — Председатель НС';
  RAISE NOTICE 'sultanova@res.test   — Член НС';
  RAISE NOTICE 'normatov@res.test    — Председатель Правления';
  RAISE NOTICE 'isakova@res.test     — Корп. секретарь';
  RAISE NOTICE 'khamraev@res.test    — Аудитор';
  RAISE NOTICE '... и ещё 20 пользователей';
END $$;

-- Шаг 5: Восстанавливаем триггер-функцию
-- (используем text вместо app_role, и organization_id вместо org_id)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _org_id uuid;
  _full_name text;
  _role text;
BEGIN
  _org_id := coalesce(
    (new.raw_user_meta_data ->> 'org_id')::uuid,
    (select id from public.organizations where is_active = true limit 1)
  );

  if _org_id is null then
    return new;
  end if;

  _full_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  _role := coalesce(new.raw_user_meta_data ->> 'role', 'board_member');

  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, _org_id, _full_name, _role);

  return new;
end;
$$;
