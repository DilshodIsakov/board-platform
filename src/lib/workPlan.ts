import { supabase } from "./supabaseClient";

export interface WorkPlan {
  id: string;
  organization_id: string;
  title: string;
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
  created_at: string;
}

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
    .select("*, agenda_items:board_plan_agenda_items(* )")
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
