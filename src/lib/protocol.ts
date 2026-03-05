import { supabase } from "./supabaseClient";

/**
 * Полные данные заседания для генерации протокола.
 * Этот же объект будет передаваться AI-генератору в будущем.
 */
export interface ProtocolData {
  meeting: {
    id: string;
    title: string;
    start_at: string;
    location: string | null;
    status: string;
  };
  organization: {
    name: string;
  };
  agendaItems: {
    order_index: number;
    title: string;
    presenter: string | null;
    decisions: {
      decision_text: string;
      status: string;
    }[];
    votings: {
      title: string;
      status: string;
      results: { for: number; against: number; abstain: number; total: number };
    }[];
  }[];
}

/** Собрать все данные заседания для протокола */
export async function collectProtocolData(meetingId: string): Promise<ProtocolData | null> {
  // 1. Заседание
  const { data: meeting, error: mErr } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .single();

  if (mErr || !meeting) {
    console.error("collectProtocolData meeting error:", mErr);
    return null;
  }

  // 2. Организация
  const orgId = meeting.organization_id;
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  // 3. Пункты повестки с решениями
  const { data: agendaItems } = await supabase
    .from("agenda_items")
    .select("*, decisions(*)")
    .eq("meeting_id", meetingId)
    .order("order_index", { ascending: true });

  // 4. Голосования по пунктам повестки
  const items = agendaItems || [];
  const agendaWithVotings = await Promise.all(
    items.map(async (item: Record<string, unknown>) => {
      const { data: votings } = await supabase
        .from("votings")
        .select("*, votes(*)")
        .eq("agenda_item_id", item.id as string);

      const votingResults = (votings || []).map((v: Record<string, unknown>) => {
        const votes = (v.votes as Record<string, unknown>[]) || [];
        const forCount = votes.filter((x) => x.choice === "for").length;
        const againstCount = votes.filter((x) => x.choice === "against").length;
        const abstainCount = votes.filter((x) => x.choice === "abstain").length;
        return {
          title: v.title as string,
          status: v.status as string,
          results: {
            for: forCount,
            against: againstCount,
            abstain: abstainCount,
            total: forCount + againstCount + abstainCount,
          },
        };
      });

      const decisions = ((item.decisions as Record<string, unknown>[]) || []).map((d) => ({
        decision_text: d.decision_text as string,
        status: d.status as string,
      }));

      return {
        order_index: item.order_index as number,
        title: item.title as string,
        presenter: item.presenter as string | null,
        decisions,
        votings: votingResults,
      };
    })
  );

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      start_at: meeting.start_at,
      location: meeting.location,
      status: meeting.status,
    },
    organization: { name: org?.name || "—" },
    agendaItems: agendaWithVotings,
  };
}

const DECISION_STATUS: Record<string, string> = {
  proposed: "Предложено",
  approved: "ПРИНЯТО",
  rejected: "ОТКЛОНЕНО",
};

/**
 * Генерация текста протокола из собранных данных.
 * Шаблонная (не-AI) версия. В будущем здесь будет вызов AI API.
 */
export function generateProtocolText(data: ProtocolData): string {
  const { meeting, organization, agendaItems } = data;

  const date = new Date(meeting.start_at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [];

  lines.push(`ПРОТОКОЛ ЗАСЕДАНИЯ`);
  lines.push(`${organization.name}`);
  lines.push(``);
  lines.push(`Тема: ${meeting.title}`);
  lines.push(`Дата и время: ${date}`);
  if (meeting.location) {
    lines.push(`Место: ${meeting.location}`);
  }
  lines.push(``);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`ПОВЕСТКА ДНЯ`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(``);

  if (agendaItems.length === 0) {
    lines.push(`Пункты повестки отсутствуют.`);
  }

  for (const item of agendaItems) {
    lines.push(`${item.order_index}. ${item.title}`);
    if (item.presenter) {
      lines.push(`   Докладчик: ${item.presenter}`);
    }

    // Голосования
    for (const v of item.votings) {
      const r = v.results;
      lines.push(``);
      lines.push(`   ГОЛОСОВАНИЕ: ${v.title}`);
      lines.push(`   Результат: За — ${r.for}, Против — ${r.against}, Воздержались — ${r.abstain} (всего: ${r.total})`);
      lines.push(`   Статус: ${v.status === "closed" ? "Закрыто" : "Открыто"}`);
    }

    // Решения
    if (item.decisions.length > 0) {
      lines.push(``);
      lines.push(`   РЕШЕНИЯ:`);
      for (const d of item.decisions) {
        lines.push(`   • ${d.decision_text} — ${DECISION_STATUS[d.status] || d.status}`);
      }
    }

    lines.push(``);
    lines.push(`${"-".repeat(60)}`);
    lines.push(``);
  }

  lines.push(``);
  lines.push(`Протокол составлен: ${new Date().toLocaleDateString("ru-RU")}`);
  lines.push(``);
  lines.push(`Председатель: ______________________ / __________________ /`);
  lines.push(`Секретарь:    ______________________ / __________________ /`);

  return lines.join("\n");
}

/**
 * Заглушка для AI-генерации протокола.
 * В будущем здесь будет вызов Supabase Edge Function → LLM API.
 *
 * Интерфейс:
 *   generateProtocolAI(data: ProtocolData): Promise<string>
 *
 * Edge Function будет получать ProtocolData и возвращать
 * отформатированный текст протокола, сгенерированный AI.
 */
export async function generateProtocolAI(data: ProtocolData): Promise<string> {
  // TODO: Вызов Supabase Edge Function:
  // const { data: result } = await supabase.functions.invoke("generate-protocol", {
  //   body: { protocolData: data },
  // });
  // return result.text;

  // Пока используем шаблонную генерацию
  return generateProtocolText(data);
}
