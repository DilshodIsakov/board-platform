import { supabase } from "./supabaseClient";

/**
 * Глобальный поиск по платформе: заседания, материалы, поручения,
 * нормативные документы, комитеты. Поиск — ilike по названиям на трёх
 * языках; доступ к данным ограничивается RLS автоматически.
 */

export type SearchResultType =
  | "meeting"
  | "document"
  | "task"
  | "regulation"
  | "committee";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  /** Локализованные заголовки — страница выбирает по текущему языку */
  title: string;
  title_en?: string | null;
  title_uz?: string | null;
  /** Дополнительная строка: дата, имя файла и т.п. */
  subtitle?: string | null;
  /** Куда вести при клике */
  route: string;
}

const PER_SECTION_LIMIT = 10;

/** Экранировать спецсимволы PostgREST-фильтра or=(...) и ilike */
function sanitize(query: string): string {
  return query.replace(/[,()%_]/g, " ").trim();
}

export async function searchAll(rawQuery: string): Promise<SearchResult[]> {
  const q = sanitize(rawQuery);
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const [meetings, documents, tasks, regulations, committees] = await Promise.all([
    supabase
      .from("meetings")
      .select("id, title, title_ru, title_en, title_uz, start_at")
      .or(`title.ilike.${like},title_ru.ilike.${like},title_en.ilike.${like},title_uz.ilike.${like}`)
      .order("start_at", { ascending: false })
      .limit(PER_SECTION_LIMIT),
    supabase
      .from("documents")
      .select("id, title, file_name, meeting_id, created_at")
      .or(`title.ilike.${like},file_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_SECTION_LIMIT),
    supabase
      .from("board_tasks")
      .select("id, title, title_ru, title_en, title_uz, created_at")
      .or(`title.ilike.${like},title_ru.ilike.${like},title_en.ilike.${like},title_uz.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_SECTION_LIMIT),
    supabase
      .from("reg_documents")
      .select("id, title, title_en, title_uz, file_name, created_at")
      .or(`title.ilike.${like},title_en.ilike.${like},title_uz.ilike.${like},file_name.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(PER_SECTION_LIMIT),
    supabase
      .from("committees")
      .select("id, name, name_en, name_uz")
      .or(`name.ilike.${like},name_en.ilike.${like},name_uz.ilike.${like}`)
      .limit(PER_SECTION_LIMIT),
  ]);

  const results: SearchResult[] = [];

  for (const m of meetings.data ?? []) {
    results.push({
      type: "meeting",
      id: m.id,
      title: m.title_ru || m.title,
      title_en: m.title_en,
      title_uz: m.title_uz,
      subtitle: m.start_at ? new Date(m.start_at).toLocaleDateString() : null,
      route: `/ns-meetings/${m.id}`,
    });
  }

  for (const d of documents.data ?? []) {
    results.push({
      type: "document",
      id: d.id,
      title: d.title || d.file_name,
      subtitle: d.file_name,
      // материалы живут внутри заседания; без привязки — общий раздел
      route: d.meeting_id ? `/ns-meetings/${d.meeting_id}` : "/documents",
    });
  }

  for (const task of tasks.data ?? []) {
    results.push({
      type: "task",
      id: task.id,
      title: task.title_ru || task.title,
      title_en: task.title_en,
      title_uz: task.title_uz,
      subtitle: task.created_at ? new Date(task.created_at).toLocaleDateString() : null,
      route: `/tasks/${task.id}`,
    });
  }

  for (const r of regulations.data ?? []) {
    results.push({
      type: "regulation",
      id: r.id,
      title: r.title,
      title_en: r.title_en,
      title_uz: r.title_uz,
      subtitle: r.file_name,
      route: "/regulations",
    });
  }

  for (const c of committees.data ?? []) {
    results.push({
      type: "committee",
      id: c.id,
      title: c.name,
      title_en: c.name_en,
      title_uz: c.name_uz,
      route: `/committees/${c.id}`,
    });
  }

  return results;
}
