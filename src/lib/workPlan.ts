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

/** Загрузить заседания плана с повесткой */
export async function fetchPlanMeetings(planId: string): Promise<PlanMeeting[]> {
  const { data: meetings, error } = await supabase
    .from("board_plan_meetings")
    .select("*")
    .eq("plan_id", planId)
    .order("meeting_number", { ascending: true });

  if (error) {
    console.error("fetchPlanMeetings error:", error);
    return [];
  }

  const result: PlanMeeting[] = meetings as PlanMeeting[];

  // Загрузить повестку для всех заседаний
  const meetingIds = result.map((m) => m.id);
  if (meetingIds.length > 0) {
    const { data: agendaItems, error: agendaError } = await supabase
      .from("board_plan_agenda_items")
      .select("*")
      .in("plan_meeting_id", meetingIds)
      .order("order_no", { ascending: true });

    if (!agendaError && agendaItems) {
      const agendaMap: Record<string, PlanAgendaItem[]> = {};
      for (const item of agendaItems as PlanAgendaItem[]) {
        if (!agendaMap[item.plan_meeting_id]) agendaMap[item.plan_meeting_id] = [];
        agendaMap[item.plan_meeting_id].push(item);
      }
      for (const m of result) {
        m.agenda_items = agendaMap[m.id] || [];
      }
    }
  }

  return result;
}
