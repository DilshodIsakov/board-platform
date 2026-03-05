import { useEffect, useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import type { Profile, Organization } from "../lib/profile";
import { updateMeetUrl, type Meeting } from "../lib/meetings";
import {
  fetchAgendaItems,
  createAgendaItem,
  createDecision,
  type AgendaItem,
} from "../lib/agenda";
import {
  fetchVotingsByAgendaItem,
  createVoting,
  closeVoting,
  castVote,
  type Voting,
} from "../lib/voting";
import { formatDateTime } from "../lib/format";

const CAN_EDIT = ["admin", "chairman"];

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function MeetingPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const { id: meetingId } = useParams<{ id: string }>();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Голосования: agendaItemId → Voting[]
  const [votingsMap, setVotingsMap] = useState<Record<string, Voting[]>>({});

  // Форма добавления пункта повестки
  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaPresenter, setAgendaPresenter] = useState("");
  const [addingAgenda, setAddingAgenda] = useState(false);
  const [agendaError, setAgendaError] = useState("");

  // Форма добавления решения (к какому пункту)
  const [decisionItemId, setDecisionItemId] = useState<string | null>(null);
  const [decisionText, setDecisionText] = useState("");
  const [addingDecision, setAddingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  // Форма создания голосования (к какому пункту)
  const [votingItemId, setVotingItemId] = useState<string | null>(null);
  const [votingTitle, setVotingTitle] = useState("");

  // Видеоконференция
  const [editingMeetUrl, setEditingMeetUrl] = useState(false);
  const [meetUrlInput, setMeetUrlInput] = useState("");
  const [savingMeetUrl, setSavingMeetUrl] = useState(false);

  const canEdit = profile && CAN_EDIT.includes(profile.role);

  const loadMeeting = async () => {
    if (!meetingId) return;
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (error) {
      console.error("loadMeeting error:", error);
      return;
    }
    setMeeting(data as Meeting);
  };

  const loadAgenda = async () => {
    if (!meetingId) return;
    const items = await fetchAgendaItems(meetingId);
    setAgendaItems(items);
    // Загрузить голосования для каждого пункта
    const map: Record<string, Voting[]> = {};
    await Promise.all(
      items.map(async (item) => {
        map[item.id] = await fetchVotingsByAgendaItem(item.id);
      })
    );
    setVotingsMap(map);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMeeting(), loadAgenda()]);
      setLoading(false);
    })();
  }, [meetingId]);

  const handleAddAgenda = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingId || !org) return;

    setAddingAgenda(true);
    setAgendaError("");

    try {
      await createAgendaItem(
        meetingId,
        org.id,
        agendaTitle,
        agendaItems.length + 1,
        agendaPresenter || undefined
      );
      setAgendaTitle("");
      setAgendaPresenter("");
      await loadAgenda();
    } catch (err: unknown) {
      setAgendaError(err instanceof Error ? err.message : "Ошибка добавления");
    } finally {
      setAddingAgenda(false);
    }
  };

  const handleAddDecision = async (e: FormEvent) => {
    e.preventDefault();
    if (!decisionItemId || !org) return;

    setAddingDecision(true);
    setDecisionError("");

    try {
      await createDecision(decisionItemId, org.id, decisionText);
      setDecisionText("");
      setDecisionItemId(null);
      await loadAgenda();
    } catch (err: unknown) {
      setDecisionError(err instanceof Error ? err.message : "Ошибка добавления");
    } finally {
      setAddingDecision(false);
    }
  };

  const handleCreateVoting = async (agendaItemId: string) => {
    if (!org || !profile || !votingTitle.trim()) return;
    try {
      await createVoting(agendaItemId, org.id, profile.id, votingTitle);
      setVotingTitle("");
      setVotingItemId(null);
      await loadAgenda();
    } catch {
      // ошибка логируется в createVoting
    }
  };

  const handleCloseVoting = async (votingId: string) => {
    try {
      await closeVoting(votingId);
      await loadAgenda();
    } catch {
      // ошибка логируется в closeVoting
    }
  };

  const handleCastVote = async (votingId: string, choice: "for" | "against" | "abstain") => {
    if (!org || !profile) return;
    try {
      await castVote(votingId, org.id, profile.id, choice);
      await loadAgenda();
    } catch {
      // ошибка логируется в castVote
    }
  };

  const handleSaveMeetUrl = async () => {
    if (!meetingId) return;
    setSavingMeetUrl(true);
    try {
      await updateMeetUrl(meetingId, meetUrlInput);
      setMeeting((prev) => prev ? { ...prev, meet_url: meetUrlInput || null } : prev);
      setEditingMeetUrl(false);
    } catch (err) {
      console.error("saveMeetUrl error:", err);
    } finally {
      setSavingMeetUrl(false);
    }
  };

  if (loading) {
    return (
      <div style={{ color: "#9CA3AF" }}>
        {t("common.loading")}
      </div>
    );
  }

  if (!meeting) {
    return (
      <div>
        <p style={{ color: "#dc2626" }}>{t("protocol.meetingNotFound")}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, marginBottom: 4 }}>{meeting.title}</h1>
        <Link to={`/meetings/${meetingId}/protocol`} style={protocolBtnStyle}>
          {t("protocol.title")}
        </Link>
      </div>

      <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
        {formatDateTime(meeting.start_at)}
        {" · "}
        <span style={{
          padding: "2px 10px",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 500,
          background: meeting.status === "completed" ? "#dcfce7"
            : meeting.status === "scheduled" ? "#dbeafe" : "#f3f4f6",
          color: meeting.status === "completed" ? "#166534"
            : meeting.status === "scheduled" ? "#1e40af" : "#374151",
        }}>
          {t(`meetingStatus.${meeting.status}`) || meeting.status}
        </span>
      </p>

      {/* --- Видеоконференция --- */}
      <div style={meetBlockStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>&#128249;</span>
          <strong style={{ fontSize: 15 }}>Видеоконференция</strong>
        </div>

        {meeting.meet_url && !editingMeetUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <a
              href={meeting.meet_url}
              target="_blank"
              rel="noopener noreferrer"
              style={meetJoinBtnStyle}
            >
              Присоединиться к видеоконференции
            </a>
            {canEdit && (
              <button
                onClick={() => {
                  setMeetUrlInput(meeting.meet_url || "");
                  setEditingMeetUrl(true);
                }}
                style={btnSmallStyle}
              >
                Изменить
              </button>
            )}
          </div>
        ) : editingMeetUrl || (canEdit && !meeting.meet_url) ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <input
              type="url"
              value={meetUrlInput}
              onChange={(e) => setMeetUrlInput(e.target.value)}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleSaveMeetUrl}
              disabled={savingMeetUrl}
              style={btnPrimaryStyle}
            >
              {savingMeetUrl ? "..." : "Сохранить"}
            </button>
            {editingMeetUrl && (
              <button onClick={() => setEditingMeetUrl(false)} style={btnSmallStyle}>
                Отмена
              </button>
            )}
          </div>
        ) : (
          <p style={{ color: "#9ca3af", fontSize: 13, margin: "8px 0 0" }}>
            Ссылка на видеоконференцию не добавлена
          </p>
        )}
      </div>

      {/* --- Повестка --- */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>Повестка дня</h2>

      {agendaItems.length === 0 && (
        <p style={{ color: "#888" }}>Пунктов повестки пока нет.</p>
      )}

      {agendaItems.map((item) => {
        const itemVotings = votingsMap[item.id] || [];

        return (
          <div key={item.id} style={agendaCardStyle}>
            {/* Заголовок пункта */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong style={{ fontSize: 15 }}>
                  {item.order_index}. {item.title}
                </strong>
                {item.presenter && (
                  <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 8 }}>
                    — {item.presenter}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {canEdit && (
                  <>
                    <button
                      onClick={() => {
                        setVotingItemId(votingItemId === item.id ? null : item.id);
                        setVotingTitle("");
                      }}
                      style={btnSmallStyle}
                    >
                      + Голосование
                    </button>
                    <button
                      onClick={() => {
                        setDecisionItemId(decisionItemId === item.id ? null : item.id);
                        setDecisionText("");
                        setDecisionError("");
                      }}
                      style={btnSmallStyle}
                    >
                      + Решение
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Решения по пункту */}
            {item.decisions && item.decisions.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {item.decisions.map((d) => (
                  <div key={d.id} style={decisionRowStyle}>
                    <span style={{ flex: 1 }}>{d.decision_text}</span>
                    <span style={{
                      ...decisionBadgeStyle,
                      background: d.status === "approved" ? "#dcfce7"
                        : d.status === "rejected" ? "#fee2e2" : "#f3f4f6",
                      color: d.status === "approved" ? "#166534"
                        : d.status === "rejected" ? "#991b1b" : "#374151",
                    }}>
                      {t(`decisionStatus.${d.status}`, d.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Голосования по пункту */}
            {itemVotings.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {itemVotings.map((v) => {
                  const votes = v.votes || [];
                  const forCount = votes.filter((x) => x.choice === "for").length;
                  const againstCount = votes.filter((x) => x.choice === "against").length;
                  const abstainCount = votes.filter((x) => x.choice === "abstain").length;
                  const myVote = profile ? votes.find((x) => x.voter_id === profile.id) : null;

                  return (
                    <div key={v.id} style={votingBoxStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong style={{ fontSize: 14 }}>{v.title}</strong>
                          <span style={{
                            marginLeft: 8,
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            background: v.status === "open" ? "#dbeafe" : "#f3f4f6",
                            color: v.status === "open" ? "#1e40af" : "#6b7280",
                          }}>
                            {v.status === "open" ? t("meeting.votingOpen") : t("meeting.votingClosed")}
                          </span>
                        </div>
                        {canEdit && v.status === "open" && (
                          <button
                            onClick={() => handleCloseVoting(v.id)}
                            style={{ ...btnSmallStyle, color: "#dc2626", borderColor: "#fecaca" }}
                          >
                            {t("meeting.closeVoting")}
                          </button>
                        )}
                      </div>

                      {/* Результаты */}
                      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 14 }}>
                        <span style={{ color: "#166534" }}>{t("voteChoice.for")}: <strong>{forCount}</strong></span>
                        <span style={{ color: "#991b1b" }}>{t("voteChoice.against")}: <strong>{againstCount}</strong></span>
                        <span style={{ color: "#6b7280" }}>{t("voteChoice.abstain")}: <strong>{abstainCount}</strong></span>
                      </div>

                      {/* Кнопки голосования */}
                      {v.status === "open" && profile && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          {(["for", "against", "abstain"] as const).map((choice) => (
                            <button
                              key={choice}
                              onClick={() => handleCastVote(v.id, choice)}
                              style={{
                                ...voteBtnStyle,
                                background: myVote?.choice === choice
                                  ? (choice === "for" ? "#166534" : choice === "against" ? "#991b1b" : "#6b7280")
                                  : "transparent",
                                color: myVote?.choice === choice ? "#fff"
                                  : (choice === "for" ? "#166534" : choice === "against" ? "#991b1b" : "#6b7280"),
                                borderColor: choice === "for" ? "#bbf7d0" : choice === "against" ? "#fecaca" : "#e5e7eb",
                              }}
                            >
                              {t(`voteChoice.${choice}`)}
                            </button>
                          ))}
                        </div>
                      )}

                      {myVote && (
                        <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>
                          {t("meeting.yourVote")}: {t(`voteChoice.${myVote.choice}`)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Форма создания голосования (inline) */}
            {votingItemId === item.id && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={votingTitle}
                  onChange={(e) => setVotingTitle(e.target.value)}
                  placeholder="Тема голосования"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => handleCreateVoting(item.id)}
                  disabled={!votingTitle.trim()}
                  style={btnPrimaryStyle}
                >
                  Создать
                </button>
              </div>
            )}

            {/* Форма добавления решения (inline) */}
            {decisionItemId === item.id && (
              <form onSubmit={handleAddDecision} style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={decisionText}
                  onChange={(e) => setDecisionText(e.target.value)}
                  required
                  placeholder="Текст решения"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="submit" disabled={addingDecision} style={btnPrimaryStyle}>
                  {addingDecision ? "..." : "Добавить"}
                </button>
              </form>
            )}
            {decisionItemId === item.id && decisionError && (
              <p style={{ color: "#dc2626", fontSize: 13, marginTop: 4 }}>{decisionError}</p>
            )}
          </div>
        );
      })}

      {/* --- Форма добавления пункта повестки --- */}
      {canEdit && (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Добавить пункт повестки</h3>
          <form onSubmit={handleAddAgenda} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Название</label>
              <input
                type="text"
                value={agendaTitle}
                onChange={(e) => setAgendaTitle(e.target.value)}
                required
                placeholder="Утверждение бюджета"
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={labelStyle}>Докладчик</label>
              <input
                type="text"
                value={agendaPresenter}
                onChange={(e) => setAgendaPresenter(e.target.value)}
                placeholder="Иванов И.И."
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <button type="submit" disabled={addingAgenda} style={btnPrimaryStyle}>
              {addingAgenda ? "..." : "Добавить"}
            </button>
          </form>
          {agendaError && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 6 }}>{agendaError}</p>}
        </div>
      )}
    </div>
  );
}

// --- Стили ---

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#6b7280",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 15,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "8px 20px",
  fontSize: 15,
  borderRadius: 6,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  height: 38,
};

const btnSmallStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const agendaCardStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  marginBottom: 12,
};

const decisionRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  borderTop: "1px solid #f3f4f6",
  fontSize: 14,
};

const decisionBadgeStyle: React.CSSProperties = {
  padding: "2px 10px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const votingBoxStyle: React.CSSProperties = {
  padding: 12,
  background: "#f9fafb",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  marginBottom: 8,
};

const voteBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid",
  cursor: "pointer",
  fontWeight: 500,
  transition: "all 0.15s",
};

const meetBlockStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: 8,
};

const meetJoinBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 24px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  background: "#16a34a",
  color: "#fff",
  textDecoration: "none",
  cursor: "pointer",
};

const protocolBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "transparent",
  color: "#374151",
  textDecoration: "none",
  cursor: "pointer",
};
