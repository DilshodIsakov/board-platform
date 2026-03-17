import { supabase } from "./supabaseClient";
import { getIntlLocale } from "../i18n";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkPlan {
  id: string;
  organization_id: string;
  title: string;
  title_ru: string | null;
  title_uz: string | null;
  title_en: string | null;
  source_language: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
}

export interface PlanMeeting {
  id: string;
  plan_id: string;
  meeting_number: number;
  planned_date_range_text: string;
  planned_date_from: string;
  planned_date_to: string;
  status: string;
  linked_meeting_id: string | null;
  created_at: string;
  agenda_items?: PlanAgendaItem[];
}

export interface PlanAgendaItem {
  id: string;
  plan_meeting_id: string;
  order_no: number;
  title: string;
  title_ru: string | null;
  title_uz: string | null;
  title_en: string | null;
  source_language: string;
  translation_status_ru: string;
  translation_status_uz: string;
  translation_status_en: string;
  created_at: string;
}

// ─── Payload types ────────────────────────────────────────────────────────────

export interface WorkPlanUpdatePayload {
  title?: string;
  title_ru?: string | null;
  title_uz?: string | null;
  title_en?: string | null;
  source_language?: string;
  period_start?: string;
  period_end?: string;
  status?: string;
  organization_id?: string;
}

export interface PlanMeetingPayload {
  meeting_number?: number;
  planned_date_range_text?: string;
  planned_date_from?: string;
  planned_date_to?: string;
  status?: string;
}

export interface PlanAgendaItemPayload {
  title?: string;
  title_ru?: string | null;
  title_uz?: string | null;
  title_en?: string | null;
  source_language?: string;
  translation_status_ru?: string;
  translation_status_uz?: string;
  translation_status_en?: string;
  order_no?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a date range as a readable string based on current locale */
export function formatPlanDateRange(from: string, to: string): string {
  const locale = getIntlLocale();
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (
    fromDate.getMonth() === toDate.getMonth() &&
    fromDate.getFullYear() === toDate.getFullYear()
  ) {
    return `${fromDate.getDate()}–${toDate.toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;
  }
  return `${fromDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
  })} – ${toDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Загрузить все планы работ */
export async function fetchWorkPlans(): Promise<WorkPlan[]> {
  const { data, error } = await supabase
    .from("board_work_plans")
    .select("*")
    .order("period_start", { ascending: false });

  if (error) {
    console.error("fetchWorkPlans error:", error);
    return [];
  }
  return data as WorkPlan[];
}

/** Загрузить заседания плана с повесткой (один запрос вместо двух) */
export async function fetchPlanMeetings(planId: string): Promise<PlanMeeting[]> {
  const { data, error } = await supabase
    .from("board_plan_meetings")
    .select("*, agenda_items:board_plan_agenda_items(*)")
    .eq("plan_id", planId)
    .order("meeting_number", { ascending: true });

  if (error) {
    console.error("fetchPlanMeetings error:", error);
    return [];
  }

  return (data as PlanMeeting[]).map((m) => ({
    ...m,
    agenda_items: ((m.agenda_items as PlanAgendaItem[]) || []).sort(
      (a, b) => a.order_no - b.order_no
    ),
  }));
}

// ─── Work Plan CRUD ───────────────────────────────────────────────────────────

export async function createWorkPlan(payload: WorkPlanUpdatePayload): Promise<WorkPlan> {
  const { data, error } = await supabase
    .from("board_work_plans")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("createWorkPlan error:", error);
    throw new Error(error.message);
  }
  return data as WorkPlan;
}

export async function updateWorkPlan(id: string, fields: WorkPlanUpdatePayload): Promise<void> {
  const { error } = await supabase.from("board_work_plans").update(fields).eq("id", id);
  if (error) {
    console.error("updateWorkPlan error:", error);
    throw new Error(error.message);
  }
}

// ─── Plan Meeting CRUD ────────────────────────────────────────────────────────

export async function createPlanMeeting(
  planId: string,
  payload: PlanMeetingPayload
): Promise<PlanMeeting> {
  const { data, error } = await supabase
    .from("board_plan_meetings")
    .insert({ plan_id: planId, ...payload })
    .select()
    .single();

  if (error) {
    console.error("createPlanMeeting error:", error);
    throw new Error(error.message);
  }
  return { ...(data as PlanMeeting), agenda_items: [] };
}

export async function updatePlanMeeting(id: string, fields: PlanMeetingPayload): Promise<void> {
  const { error } = await supabase.from("board_plan_meetings").update(fields).eq("id", id);
  if (error) {
    console.error("updatePlanMeeting error:", error);
    throw new Error(error.message);
  }
}

export async function deletePlanMeeting(id: string): Promise<void> {
  const { error } = await supabase.from("board_plan_meetings").delete().eq("id", id);
  if (error) {
    console.error("deletePlanMeeting error:", error);
    throw new Error(error.message);
  }
}

// ─── Plan Agenda Item CRUD ────────────────────────────────────────────────────

export async function createPlanAgendaItem(
  planMeetingId: string,
  orderNo: number,
  payload: PlanAgendaItemPayload
): Promise<PlanAgendaItem> {
  const { data, error } = await supabase
    .from("board_plan_agenda_items")
    .insert({ plan_meeting_id: planMeetingId, order_no: orderNo, ...payload })
    .select()
    .single();

  if (error) {
    console.error("createPlanAgendaItem error:", error);
    throw new Error(error.message);
  }
  return data as PlanAgendaItem;
}

export async function updatePlanAgendaItem(
  id: string,
  fields: PlanAgendaItemPayload
): Promise<void> {
  const { error } = await supabase.from("board_plan_agenda_items").update(fields).eq("id", id);
  if (error) {
    console.error("updatePlanAgendaItem error:", error);
    throw new Error(error.message);
  }
}

export async function deletePlanAgendaItem(id: string): Promise<void> {
  const { error } = await supabase.from("board_plan_agenda_items").delete().eq("id", id);
  if (error) {
    console.error("deletePlanAgendaItem error:", error);
    throw new Error(error.message);
  }
}
