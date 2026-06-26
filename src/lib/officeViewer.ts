/**
 * Рендер офисных документов в браузере для режима рецензирования.
 *  - .docx → постраничный рендер (docx-preview), с разметкой блоков для привязки комментариев.
 *  - .xlsx → структура листов/ячеек (SheetJS) для табличного рендера и выбора ячеек.
 * Плюс утилиты привязки/подсветки выделенного фрагмента в .docx.
 *
 * Всё работает чисто на клиенте — никаких серверов.
 */
import type { DocxAnchor } from "./documentComments";

// ── DOCX ──────────────────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "TD", "TH", "PRE"]);

/**
 * Отрисовать .docx прямо в DOM-контейнер с сохранением форматирования
 * (постранично, шрифты/таблицы/картинки/разрывы страниц) через docx-preview.
 * Контейнер очищается перед рендером.
 */
export async function renderDocxInto(container: HTMLElement, buffer: ArrayBuffer): Promise<void> {
  const { renderAsync } = await import("docx-preview");
  container.innerHTML = "";
  await renderAsync(buffer, container, undefined, {
    className: "docx",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    experimental: true,
    useBase64URL: true,
  });
}

/**
 * Пронумеровать блочные элементы внутри контейнера (data-block="N").
 * Нумерация детерминирована для одного и того же HTML, поэтому якоря
 * стабильны между перерисовками одной версии документа.
 */
export function tagDocxBlocks(container: HTMLElement): void {
  const all = container.querySelectorAll<HTMLElement>("*");
  let idx = 0;
  all.forEach((el) => {
    if (BLOCK_TAGS.has(el.tagName)) {
      el.setAttribute("data-block", String(idx));
      idx++;
    }
  });
}

function blockOf(node: Node, container: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
  while (el && el !== container) {
    if (el.hasAttribute("data-block")) return el;
    el = el.parentElement;
  }
  return null;
}

function charOffsetInBlock(block: HTMLElement, node: Node, offsetInNode: number): number {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) return total + offsetInNode;
    total += (n.textContent || "").length;
  }
  return total + offsetInNode;
}

/**
 * Построить якорь из текущего выделения пользователя.
 * Поддерживается выделение как внутри одного абзаца, так и охватывающее
 * несколько блоков. Возвращает null, если выделение пустое или вне контейнера.
 */
export function getDocxAnchorFromSelection(
  container: HTMLElement
): { anchor: DocxAnchor; quoted: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const startBlockEl = blockOf(range.startContainer, container);
  const endBlockEl = blockOf(range.endContainer, container);
  if (!startBlockEl || !endBlockEl) return null;

  const startBlock = Number(startBlockEl.getAttribute("data-block"));
  const endBlock = Number(endBlockEl.getAttribute("data-block"));
  const startOffset = charOffsetInBlock(startBlockEl, range.startContainer, range.startOffset);
  const endOffset = charOffsetInBlock(endBlockEl, range.endContainer, range.endOffset);

  // Range из getRangeAt всегда в порядке документа: startBlock <= endBlock.
  if (startBlock === endBlock && endOffset <= startOffset) return null;

  const quoted = sel.toString().trim();
  if (!quoted) return null;

  return { anchor: { type: "docx", startBlock, startOffset, endBlock, endOffset }, quoted };
}

/** Снять все подсветки комментариев. */
export function clearDocxHighlights(container: HTMLElement): void {
  container.querySelectorAll("mark.dc-highlight").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

/** Подсветить интервал [from, to) внутри одного блока (по символам). */
function highlightWithinBlock(
  block: HTMLElement,
  from: number,
  to: number,
  commentId: string,
  resolved: boolean
): void {
  // Собираем текстовые узлы заранее: surroundContents меняет DOM по ходу.
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let tn: Node | null;
  while ((tn = walker.nextNode())) textNodes.push(tn as Text);

  let total = 0;
  for (const node of textNodes) {
    const len = (node.textContent || "").length;
    const nodeStart = total;
    const nodeEnd = total + len;
    total += len;

    const s = Math.max(from, nodeStart);
    const e = Math.min(to, nodeEnd);
    if (s >= e) continue;

    const range = document.createRange();
    range.setStart(node, s - nodeStart);
    range.setEnd(node, e - nodeStart);

    const mark = document.createElement("mark");
    mark.className = "dc-highlight" + (resolved ? " dc-highlight-resolved" : "");
    mark.dataset.commentId = commentId;
    try {
      range.surroundContents(mark);
    } catch {
      // на всякий случай — пропускаем проблемный сегмент
    }
  }
}

/**
 * Подсветить якорь, возможно охватывающий несколько блоков.
 * Первый блок — от startOffset до конца, последний — от 0 до endOffset,
 * промежуточные — целиком.
 */
export function highlightDocxAnchor(
  container: HTMLElement,
  anchor: DocxAnchor,
  commentId: string,
  resolved: boolean
): void {
  for (let b = anchor.startBlock; b <= anchor.endBlock; b++) {
    const block = container.querySelector<HTMLElement>(`[data-block="${b}"]`);
    if (!block) continue;
    const from = b === anchor.startBlock ? anchor.startOffset : 0;
    const to = b === anchor.endBlock ? anchor.endOffset : Number.MAX_SAFE_INTEGER;
    highlightWithinBlock(block, from, to, commentId, resolved);
  }
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

export interface XlsxCell {
  addr: string;   // A1
  row: number;    // 0-based
  col: number;    // 0-based
  text: string;
}

export interface XlsxSheet {
  name: string;
  ncols: number;
  rows: XlsxCell[][];
  truncated: boolean;
}

const MAX_ROWS = 300;
const MAX_COLS = 60;

/** Разобрать .xlsx в структуру листов с ячейками (для табличного рендера + выбора). */
export async function parseXlsx(buffer: ArrayBuffer): Promise<XlsxSheet[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const sheets: XlsxSheet[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) {
      sheets.push({ name, ncols: 0, rows: [], truncated: false });
      continue;
    }
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
    const lastCol = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
    const truncated = range.e.r > lastRow || range.e.c > lastCol;

    const rows: XlsxCell[][] = [];
    for (let r = range.s.r; r <= lastRow; r++) {
      const row: XlsxCell[] = [];
      for (let c = range.s.c; c <= lastCol; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        const text = cell ? XLSX.utils.format_cell(cell) : "";
        row.push({ addr, row: r, col: c, text });
      }
      rows.push(row);
    }
    sheets.push({ name, ncols: lastCol - range.s.c + 1, rows, truncated });
  }
  return sheets;
}

/** Имя колонки Excel по 0-based индексу: 0→A, 26→AA. */
export function colName(col: number): string {
  let s = "";
  let c = col;
  do {
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return s;
}

/** Разобрать A1 в {row, col} (0-based). */
export function decodeA1(a1: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(a1);
  if (!m) return { row: 0, col: 0 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

/** Находится ли ячейка (row,col) внутри диапазона start..end (A1). */
export function isCellInRange(row: number, col: number, start: string, end: string): boolean {
  const a = decodeA1(start);
  const b = decodeA1(end);
  const r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
  const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col);
  return row >= r0 && row <= r1 && col >= c0 && col <= c1;
}
