-- ============================================================
-- 058: Regulatory documents library
-- Categories (internal / external / reports) + uploaded files
-- ============================================================

-- ── Categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reg_categories (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('internal','external','reports')),
  name        TEXT    NOT NULL DEFAULT '',
  name_en     TEXT,
  name_uz     TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regcat_org_kind ON public.reg_categories(org_id, kind);

ALTER TABLE public.reg_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regcat_select" ON public.reg_categories;
DROP POLICY IF EXISTS "regcat_insert" ON public.reg_categories;
DROP POLICY IF EXISTS "regcat_update" ON public.reg_categories;
DROP POLICY IF EXISTS "regcat_delete" ON public.reg_categories;

CREATE POLICY "regcat_select" ON public.reg_categories
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());

CREATE POLICY "regcat_insert" ON public.reg_categories
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regcat_update" ON public.reg_categories
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regcat_delete" ON public.reg_categories
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

-- ── Documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reg_documents (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id    UUID    NOT NULL REFERENCES public.reg_categories(id) ON DELETE CASCADE,

  title          TEXT    NOT NULL DEFAULT '',
  title_en       TEXT,
  title_uz       TEXT,

  description    TEXT,
  description_en TEXT,
  description_uz TEXT,

  effective_date DATE,
  version        TEXT    NOT NULL DEFAULT '1.0',
  issuing_body   TEXT,

  file_name      TEXT    NOT NULL DEFAULT '',
  file_size      BIGINT  NOT NULL DEFAULT 0,
  mime_type      TEXT    NOT NULL DEFAULT '',
  storage_path   TEXT    NOT NULL DEFAULT '',

  uploaded_by    UUID    REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regdoc_category  ON public.reg_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_regdoc_org       ON public.reg_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_regdoc_archived  ON public.reg_documents(is_archived);

ALTER TABLE public.reg_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regdoc_select" ON public.reg_documents;
DROP POLICY IF EXISTS "regdoc_insert" ON public.reg_documents;
DROP POLICY IF EXISTS "regdoc_update" ON public.reg_documents;
DROP POLICY IF EXISTS "regdoc_delete" ON public.reg_documents;

CREATE POLICY "regdoc_select" ON public.reg_documents
  FOR SELECT TO authenticated USING (org_id = public.get_my_org_id());

CREATE POLICY "regdoc_insert" ON public.reg_documents
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regdoc_update" ON public.reg_documents
  FOR UPDATE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

CREATE POLICY "regdoc_delete" ON public.reg_documents
  FOR DELETE TO authenticated
  USING (org_id = public.get_my_org_id() AND public.get_my_role() IN ('admin','corp_secretary'));

-- ── Seed default categories ───────────────────────────────────
DO $$
DECLARE v_org UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  INSERT INTO public.reg_categories (org_id, kind, name, name_en, name_uz, order_index) VALUES
    -- Internal documents
    (v_org, 'internal', 'Устав общества',             'Company Charter',        'Жамият устави',          1),
    (v_org, 'internal', 'Положения',                  'Regulations',            'Низомлар',               2),
    (v_org, 'internal', 'Другие внутренние документы','Other Internal Documents','Бошқа ички ҳужжатлар',  3),
    -- External regulations
    (v_org, 'external', 'Регулирование энергорынка',    'Energy Market Regulations',     'Энергия бозорини тартибга солиш',     10),
    (v_org, 'external', 'Тарифное регулирование',       'Tariff Regulations',            'Тариф тартибга солиш',                11),
    (v_org, 'external', 'Постановления и указы',        'Decrees and Orders',            'Қарорлар ва фармойишлар',             12),
    (v_org, 'external', 'Другое внешнее регулирование', 'Other External Regulations',    'Бошқа ташқи тартибга солиш',         13),
    -- Reports
    (v_org, 'reports',  'Отчёты по МСФО',              'IFRS Reports',                  'ХЗМС ҳисоботлари',                   20),
    (v_org, 'reports',  'ESG-отчёты',                  'ESG Reports',                   'ESG ҳисоботлари',                    21),
    (v_org, 'reports',  'Рейтинговые отчёты',           'Rating Reports',                'Рейтинг ҳисоботлари',                22),
    (v_org, 'reports',  'Отчёты внутреннего аудита',    'Internal Audit Reports',        'Ички аудит ҳисоботлари',             23),
    (v_org, 'reports',  'Отчёты о закупках',            'Procurement Reports',           'Харид ҳисоботлари',                  24)
  ON CONFLICT (org_id, kind, name) DO NOTHING;
END $$;
