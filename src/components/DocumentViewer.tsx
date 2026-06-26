import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommentAnchor, DocumentComment } from "../lib/documentComments";
import {
  renderDocxInto,
  tagDocxBlocks,
  clearDocxHighlights,
  highlightDocxAnchor,
  getDocxAnchorFromSelection,
  colName,
  isCellInRange,
  type XlsxSheet,
} from "../lib/officeViewer";

interface PendingSelection {
  anchor: CommentAnchor;
  quoted: string;
  x: number;
  y: number;
}

interface Props {
  kind: "docx" | "xlsx";
  docxBuffer?: ArrayBuffer;
  xlsxSheets?: XlsxSheet[];
  /** Корневые комментарии текущей версии (с anchor). */
  rootComments: DocumentComment[];
  activeCommentId: string | null;
  canComment: boolean;
  onRequestComment: (anchor: CommentAnchor, quoted: string) => void;
  onAnchorClick: (commentId: string) => void;
}

export default function DocumentViewer({
  kind,
  docxBuffer,
  xlsxSheets,
  rootComments,
  activeCommentId,
  canComment,
  onRequestComment,
  onAnchorClick,
}: Props) {
  const { t } = useTranslation();
  const docxRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [docxRendering, setDocxRendering] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  // Excel state
  const [activeSheet, setActiveSheet] = useState(0);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // ── DOCX: рендер документа в контейнер (docx-preview) ──
  useEffect(() => {
    if (kind !== "docx" || !docxBuffer) return;
    const container = docxRef.current;
    if (!container) return;
    let cancelled = false;
    setDocxRendering(true);
    (async () => {
      try {
        // docx-preview может «съесть» ArrayBuffer — передаём копию
        await renderDocxInto(container, docxBuffer.slice(0));
        if (cancelled) return;
        tagDocxBlocks(container);
        setRenderTick((n) => n + 1);
      } catch (e) {
        console.error("docx render error:", e);
      } finally {
        if (!cancelled) setDocxRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, docxBuffer]);

  // ── DOCX: подсветка комментариев (после рендера / при изменении) ──
  useEffect(() => {
    if (kind !== "docx") return;
    const container = docxRef.current;
    if (!container || renderTick === 0) return;
    clearDocxHighlights(container);
    for (const c of rootComments) {
      if (c.anchor && c.anchor.type === "docx") {
        highlightDocxAnchor(container, c.anchor, c.id, c.status === "resolved");
      }
    }
    if (activeCommentId) {
      container
        .querySelectorAll(`mark.dc-highlight[data-comment-id="${activeCommentId}"]`)
        .forEach((m) => m.classList.add("dc-active"));
    }
  }, [kind, renderTick, rootComments, activeCommentId]);

  // ── DOCX: выделение текста → плавающая кнопка ──
  const handleDocxMouseUp = () => {
    if (!canComment) return;
    const container = docxRef.current;
    if (!container) return;
    const res = getDocxAnchorFromSelection(container);
    if (!res) {
      setPending(null);
      return;
    }
    const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    if (!rect) return;
    setPending({ anchor: res.anchor, quoted: res.quoted, x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleDocxClick = (e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest("mark.dc-highlight") as HTMLElement | null;
    if (mark?.dataset.commentId) onAnchorClick(mark.dataset.commentId);
  };

  // ── XLSX: выбор ячеек ──
  const sheet = xlsxSheets?.[activeSheet];

  const commentedCells = (() => {
    const map = new Map<string, string>();
    if (kind !== "xlsx" || !sheet) return map;
    for (const c of rootComments) {
      if (c.anchor?.type === "xlsx" && c.anchor.sheet === sheet.name) {
        for (const row of sheet.rows) {
          for (const cell of row) {
            if (isCellInRange(cell.row, cell.col, c.anchor.start, c.anchor.end)) {
              map.set(cell.addr, c.id);
            }
          }
        }
      }
    }
    return map;
  })();

  const finishCellSelection = (e: React.MouseEvent) => {
    if (!canComment || !dragStart || !dragEnd || !sheet) {
      setDragging(false);
      return;
    }
    const startA1 = colName(Math.min(dragStart.col, dragEnd.col)) + (Math.min(dragStart.row, dragEnd.row) + 1);
    const endA1 = colName(Math.max(dragStart.col, dragEnd.col)) + (Math.max(dragStart.row, dragEnd.row) + 1);
    const anchor: CommentAnchor = { type: "xlsx", sheet: sheet.name, start: startA1, end: endA1 };
    const quoted = startA1 === endA1 ? startA1 : `${startA1}:${endA1}`;
    setPending({ anchor, quoted, x: e.clientX, y: e.clientY - 10 });
    setDragging(false);
  };

  const inDragRange = (row: number, col: number): boolean => {
    if (!dragStart || !dragEnd) return false;
    const r0 = Math.min(dragStart.row, dragEnd.row), r1 = Math.max(dragStart.row, dragEnd.row);
    const c0 = Math.min(dragStart.col, dragEnd.col), c1 = Math.max(dragStart.col, dragEnd.col);
    return row >= r0 && row <= r1 && col >= c0 && col <= c1;
  };

  const confirmPending = () => {
    if (pending) {
      onRequestComment(pending.anchor, pending.quoted);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .dc-highlight { background: #FEF3C7; border-bottom: 2px solid #F59E0B; cursor: pointer; }
        .dc-highlight-resolved { background: #E5E7EB; border-bottom-color: #9CA3AF; }
        .dc-highlight.dc-active { background: #FDE68A; box-shadow: 0 0 0 2px #F59E0B; }
        .dc-docx-host .docx-wrapper { background: #F3F4F6; padding: 16px; }
        .dc-xtable td { border: 1px solid #E5E7EB; padding: 4px 8px; font-size: 13px; white-space: nowrap; user-select: none; cursor: cell; }
        .dc-xtable td.dc-rownum, .dc-xtable th { background: #F9FAFB; color: #6B7280; font-weight: 600; text-align: center; position: sticky; top: 0; }
        .dc-xtable td.dc-sel { background: #DBEAFE !important; }
        .dc-xtable td.dc-commented { background: #FEF3C7; cursor: pointer; }
      `}</style>

      {kind === "docx" && (
        <>
          {docxRendering && (
            <div style={{ color: "#9CA3AF", fontSize: 13, padding: 12 }}>{t("review.rendering")}</div>
          )}
          <div
            ref={docxRef}
            className="dc-docx-host"
            onMouseUp={handleDocxMouseUp}
            onClick={handleDocxClick}
          />
        </>
      )}

      {kind === "xlsx" && sheet && (
        <div>
          {xlsxSheets && xlsxSheets.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {xlsxSheets.map((s, i) => (
                <button
                  key={s.name + i}
                  onClick={() => { setActiveSheet(i); setDragStart(null); setDragEnd(null); }}
                  style={{
                    padding: "5px 12px", fontSize: 13, borderRadius: 6, cursor: "pointer",
                    border: "1px solid " + (i === activeSheet ? "#2563EB" : "#D1D5DB"),
                    background: i === activeSheet ? "#EFF6FF" : "#fff",
                    color: i === activeSheet ? "#2563EB" : "#374151", fontWeight: 500,
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ overflow: "auto", maxHeight: "70vh", border: "1px solid #E5E7EB", borderRadius: 8 }}>
            <table className="dc-xtable" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th></th>
                  {sheet.rows[0]?.map((cell) => (
                    <th key={cell.col}>{colName(cell.col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="dc-rownum">{(row[0]?.row ?? ri) + 1}</td>
                    {row.map((cell) => {
                      const commentId = commentedCells.get(cell.addr);
                      const selected = dragging && inDragRange(cell.row, cell.col);
                      const cls = [
                        commentId ? "dc-commented" : "",
                        selected ? "dc-sel" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <td
                          key={cell.col}
                          className={cls}
                          title={commentId ? t("review.cellHasComment") : undefined}
                          onMouseDown={() => {
                            if (commentId) { onAnchorClick(commentId); return; }
                            if (!canComment) return;
                            setDragStart({ row: cell.row, col: cell.col });
                            setDragEnd({ row: cell.row, col: cell.col });
                            setDragging(true);
                            setPending(null);
                          }}
                          onMouseEnter={() => {
                            if (dragging) setDragEnd({ row: cell.row, col: cell.col });
                          }}
                          onMouseUp={finishCellSelection}
                        >
                          {cell.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.truncated && (
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>{t("review.sheetTruncated")}</p>
          )}
        </div>
      )}

      {/* Плавающая кнопка «Прокомментировать» */}
      {pending && canComment && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={confirmPending}
          style={{
            position: "fixed",
            left: pending.x,
            top: pending.y - 42,
            transform: "translateX(-50%)",
            zIndex: 1500,
            padding: "7px 14px",
            background: "#2563EB",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          💬 {t("review.addComment")}
        </button>
      )}
    </div>
  );
}
