---
version: 1
name: board-platform-soft
description: "Дизайн-система платформы Наблюдательного совета: мягкий современный интерфейс на Golos Text. Холодные серые с синим подтоном, один акцент — индиго-синий #3557d6, скругления по роли элемента (8 чипы / 10 кнопки и поля / 14 контейнеры), двухслойные лёгкие тени у контейнеров, цветные чипы статусов с рамкой. Белая шапка с квадратным знаком, белая навигация с «таблеткой» активного пункта, контент на #f5f7fa. Выбрано владельцем 15.09.2026 из трёх направлений (см. docs/DESIGN_NOTES.md)."

colors:
  ink: "#1a1f2b"
  ink-strong: "#2a3040"
  ink-muted: "#6b7384"
  ink-subtle: "#9ba3b4"
  canvas: "#f5f7fa"
  card: "#ffffff"
  line: "#e3e7ee"
  line-soft: "#eef1f6"
  accent: "#3557d6"
  accent-hover: "#2c48b8"
  accent-active: "#1f3590"
  accent-soft: "#e9edfb"
  accent-line: "#d3dbf7"
  success: "#1b6b3a"
  success-bg: "#e7f6ec"
  success-line: "#cfead8"
  success-dot: "#2e9e5b"
  warning: "#7a5410"
  warning-bg: "#fff5dd"
  warning-line: "#f4e2a8"
  warning-dot: "#e0a520"
  danger: "#a12b2b"
  danger-bg: "#fdeaea"
  danger-line: "#f5c9c9"
  danger-dot: "#d14343"

typography:
  page-title:
    fontFamily: Golos Text
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  section-title:
    fontFamily: Golos Text
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: -0.01em
  card-title:
    fontFamily: Golos Text
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Golos Text
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-emphasis:
    fontFamily: Golos Text
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: Golos Text
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.4
  chip:
    fontFamily: Golos Text
    fontSize: 12.5px
    fontWeight: 500
    lineHeight: 1.3
  button:
    fontFamily: Golos Text
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.2
  display-number:
    fontFamily: Golos Text
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: -0.02em

rounded:
  chip: 8px
  control: 10px
  card: 14px
  leaf: 12px
  pill: 999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 28px
  xxl: 32px

shadows:
  card: "0 1px 2px rgba(26,31,43,.04), 0 6px 20px rgba(26,31,43,.05)"
  leaf: "0 1px 2px rgba(26,31,43,.06)"
  button-primary: "0 1px 2px rgba(53,87,214,.3)"
  overlay: "0 12px 40px rgba(26,31,43,.14)"

components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
    shadow: "{shadows.button-primary}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    border: 1px solid {colors.line}
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.accent}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  button-danger:
    backgroundColor: "{colors.danger-dot}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  card:
    backgroundColor: "{colors.card}"
    border: 1px solid {colors.line}
    rounded: "{rounded.card}"
    shadow: "{shadows.card}"
    padding: 20px
  chip:
    backgroundColor: "{colors.canvas}"
    border: 1px solid {colors.line}
    textColor: "{colors.ink}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    padding: 5px 10px
  chip-info:
    backgroundColor: "{colors.accent-soft}"
    border: 1px solid {colors.accent-line}
    textColor: "{colors.accent}"
  chip-success:
    backgroundColor: "{colors.success-bg}"
    border: 1px solid {colors.success-line}
    textColor: "{colors.success}"
  chip-warning:
    backgroundColor: "{colors.warning-bg}"
    border: 1px solid {colors.warning-line}
    textColor: "{colors.warning}"
  chip-danger:
    backgroundColor: "{colors.danger-bg}"
    border: 1px solid {colors.danger-line}
    textColor: "{colors.danger}"
  text-input:
    backgroundColor: "{colors.card}"
    border: 1px solid {colors.line}
    rounded: "{rounded.control}"
    padding: 9px 12px
    height: 38px
  text-input-focused:
    border: 1px solid {colors.accent}
    ring: 0 0 0 3px {colors.accent-soft}
  top-nav:
    backgroundColor: "{colors.card}"
    border-bottom: 1px solid {colors.line}
    height: 60px
  side-nav-item:
    height: 40px
    rounded: "{rounded.control}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-emphasis}"
  side-nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  date-leaf:
    border: 1px solid {colors.line}
    rounded: "{rounded.leaf}"
    shadow: "{shadows.leaf}"
    header: "{colors.accent}"
---

## Обзор

Мягкий современный интерфейс для органа управления акционерного общества.
Холодные нейтральные с синим подтоном (не чистые серые), один акцент —
индиго-синий, статусы — отдельная семантическая тройка (зелёный / жёлтый /
красный) с рамкой у чипа, чтобы читаться и на белом, и на `canvas`.

Шрифт — **Golos Text**: сделан для кириллицы, хорошо держит узбекские
Ў Ғ Қ Ҳ, не выглядит «Inter по умолчанию». Один шрифт, иерархия — размером и
весом 400 / 500 / 600.

**Ключевое:** скругление — по роли элемента, не одно на всё.
Чипы 8, кнопки и поля 10, контейнеры 14, «календарный листок» 12,
счётчики — pill. Тень есть только у контейнеров и у primary-кнопки; у
строк списка, чипов и полей — нет.

## Каркас

- Шапка 60px, белая, нижняя линия `line`. Слева квадратный знак 30×30
  (`accent`, скругление 9, буквы «НС»), название, через точку — организация.
  Справа поиск (`canvas` фон, скругление 10), язык как чип, уведомления,
  аватар 34.
- Навигация 248px, белая, правая линия. Пункт — 40px, скругление 10,
  `ink-muted` 500; активный — `accent-soft` фон + `accent` текст.
  Счётчики — pill `accent`. Группы разделены подписью 12px `ink-subtle`
  (sentence case).
- Контент на `canvas`, отступ 28–32px, контейнеры — `card`.

## Компоненты и правила

- **Контейнер** — `card`: белый, `line`, 14, тень `card`, внутри 20px.
  Не вкладывать карточку в карточку: внутри карточки — строки с верхней
  линией `line` (12px 20px) или блок на `canvas` со скруглением 12.
- **Заголовок страницы** 26/600 −0.01em; подзаголовок/дата 14 `ink-muted`.
- **Список** — строка: цветная точка 8px статуса слева (опционально),
  заголовок 500, под ним caption `ink-muted`, справа чип.
- **Чипы**: всегда с рамкой; нейтральный — на `canvas`. Не капс, не bold.
- **Кнопки** в ряд через `gap: 8px`; primary — одна на экран.
- **Герой главной**: календарный листок (месяц капсом в шапке листка —
  единственное место с капсом, как на настоящем отрывном календаре),
  заголовок 20/600, чипы фактов, кнопки; справа блок на `canvas` с
  повесткой или прогрессом.
- **Иконки** — SVG 16–18px, stroke 1.6; эмодзи нет.
- **Пустое состояние** — заголовок 500 + одна строка что сделать, кнопка
  secondary.
- **Фокус** — рамка `accent` + кольцо 3px `accent-soft`.

## Чего не делать

- Один радиус на всё (это и есть «шаблонность» скруглённых карточек).
- Тени на строках, чипах, полях ввода.
- Второй акцентный цвет. Фиолетовый, бирюзовый — нет.
- Капс-лейблы и трекинг (кроме шапки календарного листка).
- Стрелки «→» и «+» в тексте кнопок и ссылок.
- Градиенты как декорация.
