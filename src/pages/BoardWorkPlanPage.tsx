import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchWorkPlans,
  fetchPlanMeetings,
  createWorkPlan,
  updateWorkPlan,
  createPlanMeeting,
  updatePlanMeeting,
  deletePlanMeeting,
  createPlanAgendaItem,
  updatePlanAgendaItem,
  deletePlanAgendaItem,
  formatPlanDateRange,
  type WorkPlan,
  type PlanMeeting,
  type PlanAgendaItem,
} from "../lib/workPlan";
import { getLocalizedField } from "../lib/i18nHelpers";
import {
  generateMeetingTranslations,
  translationStatusLabel,
  translationStatusColor,
  type TranslationStatus,
  type SupportedLang,
} from "../lib/translationService";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "#7C3AED",
  completed: "#16a34a",
  canceled: "#9CA3AF",
};

const MEETING_STATUS_OPTIONS = ["planned", "completed", "canceled"];
const PLAN_STATUS_OPTIONS = ["draft", "approved", "archived"];

export default function BoardWorkPlanPage({ profile, org }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  // ── Data ──────────────────────────────────────────────────────────────────
  const [plans, setPlans] = useState<WorkPlan[]>([]);
  const [meetings, setMeetings] = useState<PlanMeeting[]>([]);
  const SS_EXPANDED = "workplan_expandedMeeting";
  const [expandedMeeting, setExpandedMeetingRaw] = useState<string | null>(
    () => sessionStorage.getItem(SS_EXPANDED) || null
  );
  const setExpandedMeeting = useCallback((id: string | null) => {
    setExpandedMeetingRaw(id);
    if (id) sessionStorage.setItem(SS_EXPANDED, id);
    else sessionStorage.removeItem(SS_EXPANDED);
  }, []);
  const [loading, setLoading] = useState(true);

  // ── Create plan modal ────────────────────────────────────────────────────
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanPeriodStart, setNewPlanPeriodStart] = useState("");
  const [newPlanPeriodEnd, setNewPlanPeriodEnd] = useState("");
  const [newPlanSaving, setNewPlanSaving] = useState(false);
  const [newPlanError, setNewPlanError] = useState<string | null>(null);

  // ── Plan edit modal ───────────────────────────────────────────────────────
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planSrcLang, setPlanSrcLang] = useState<SupportedLang>("ru");
  const [planLangTab, setPlanLangTab] = useState<SupportedLang>("ru");
  const [planTitleRu, setPlanTitleRu] = useState("");
  const [planTitleUz, setPlanTitleUz] = useState("");
  const [planTitleEn, setPlanTitleEn] = useState("");
  const [planStatusRu, setPlanStatusRu] = useState<TranslationStatus>("original");
  const [planStatusUz, setPlanStatusUz] = useState<TranslationStatus>("missing");
  const [planStatusEn, setPlanStatusEn] = useState<TranslationStatus>("missing");
  const [planStatusEdit, setPlanStatusEdit] = useState("approved");
  const [planPeriodStart, setPlanPeriodStart] = useState("");
  const [planPeriodEnd, setPlanPeriodEnd] = useState("");
  const [planTranslating, setPlanTranslating] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // ── Meeting modal ─────────────────────────────────────────────────────────
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<PlanMeeting | null>(null);
  const [meetDateFrom, setMeetDateFrom] = useState("");
  const [meetStatus, setMeetStatus] = useState("planned");
  const [meetSaving, setMeetSaving] = useState(false);
  const [meetError, setMeetError] = useState<string | null>(null);

  // ── Agenda item modal ─────────────────────────────────────────────────────
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [editingAgendaItem, setEditingAgendaItem] = useState<PlanAgendaItem | null>(null);
  const [agendaMeetingId, setAgendaMeetingId] = useState<string | null>(null);
  const [agendaSrcLang, setAgendaSrcLang] = useState<SupportedLang>("ru");
  const [agendaLangTab, setAgendaLangTab] = useState<SupportedLang>("ru");
  const [agendaTitleRu, setAgendaTitleRu] = useState("");
  const [agendaTitleUz, setAgendaTitleUz] = useState("");
  const [agendaTitleEn, setAgendaTitleEn] = useState("");
  const [agendaStatusRu, setAgendaStatusRu] = useState<TranslationStatus>("original");
  const [agendaStatusUz, setAgendaStatusUz] = useState<TranslationStatus>("missing");
  const [agendaStatusEn, setAgendaStatusEn] = useState<TranslationStatus>("missing");
  const [agendaTranslating, setAgendaTranslating] = useState(false);
  const [agendaTransError, setAgendaTransError] = useState<string | null>(null);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [agendaSaveError, setAgendaSaveError] = useState<string | null>(null);

  // ── Draft persistence ────────────────────────────────────────────────────
  const SS_DRAFT = "workplan_modalDraft";
  const draftRestored = useRef(false);

  // Restore draft after data loads — re-open modal with saved form values
  const restoreDraft = useCallback((loadedMeetings: PlanMeeting[]) => {
    const raw = sessionStorage.getItem(SS_DRAFT);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.modal === "editPlan") {
        setPlanSrcLang(d.planSrcLang ?? "ru");
        setPlanLangTab(d.planLangTab ?? "ru");
        setPlanTitleRu(d.planTitleRu ?? "");
        setPlanTitleUz(d.planTitleUz ?? "");
        setPlanTitleEn(d.planTitleEn ?? "");
        setPlanStatusRu(d.planStatusRu ?? "original");
        setPlanStatusUz(d.planStatusUz ?? "missing");
        setPlanStatusEn(d.planStatusEn ?? "missing");
        setPlanStatusEdit(d.planStatusEdit ?? "approved");
        setPlanPeriodStart(d.planPeriodStart ?? "");
        setPlanPeriodEnd(d.planPeriodEnd ?? "");
        setShowPlanModal(true);
      } else if (d.modal === "createPlan") {
        setNewPlanTitle(d.newPlanTitle ?? "");
        setNewPlanPeriodStart(d.newPlanPeriodStart ?? "");
        setNewPlanPeriodEnd(d.newPlanPeriodEnd ?? "");
        setShowCreatePlanModal(true);
      } else if (d.modal === "meeting") {
        setMeetDateFrom(d.meetDateFrom ?? "");
        setMeetStatus("planned");
        if (d.editingMeetingId) {
          const found = loadedMeetings.find((m) => m.id === d.editingMeetingId);
          setEditingMeeting(found ?? null);
        } else {
          setEditingMeeting(null);
        }
        setShowMeetingModal(true);
      } else if (d.modal === "agenda") {
        setAgendaMeetingId(d.agendaMeetingId ?? null);
        setAgendaSrcLang(d.agendaSrcLang ?? "ru");
        setAgendaLangTab(d.agendaLangTab ?? "ru");
        setAgendaTitleRu(d.agendaTitleRu ?? "");
        setAgendaTitleUz(d.agendaTitleUz ?? "");
        setAgendaTitleEn(d.agendaTitleEn ?? "");
        setAgendaStatusRu(d.agendaStatusRu ?? "original");
        setAgendaStatusUz(d.agendaStatusUz ?? "missing");
        setAgendaStatusEn(d.agendaStatusEn ?? "missing");
        if (d.editingAgendaItemId) {
          for (const m of loadedMeetings) {
            const found = (m.agenda_items || []).find((ai) => ai.id === d.editingAgendaItemId);
            if (found) { setEditingAgendaItem(found); break; }
          }
        } else {
          setEditingAgendaItem(null);
        }
        setShowAgendaModal(true);
      }
    } catch { /* ignore corrupt draft */ }
  }, []);

  // Save draft whenever a modal is open and fields change
  useEffect(() => {
    const openModal = showPlanModal ? "editPlan"
      : showCreatePlanModal ? "createPlan"
      : showMeetingModal ? "meeting"
      : showAgendaModal ? "agenda"
      : null;

    if (!openModal) {
      sessionStorage.removeItem(SS_DRAFT);
      return;
    }

    const draft: Record<string, unknown> = { modal: openModal };

    if (openModal === "editPlan") {
      Object.assign(draft, {
        planSrcLang, planLangTab, planTitleRu, planTitleUz, planTitleEn,
        planStatusRu, planStatusUz, planStatusEn, planStatusEdit,
        planPeriodStart, planPeriodEnd,
      });
    } else if (openModal === "createPlan") {
      Object.assign(draft, { newPlanTitle, newPlanPeriodStart, newPlanPeriodEnd });
    } else if (openModal === "meeting") {
      Object.assign(draft, { meetDateFrom, editingMeetingId: editingMeeting?.id ?? null });
    } else if (openModal === "agenda") {
      Object.assign(draft, {
        agendaMeetingId, editingAgendaItemId: editingAgendaItem?.id ?? null,
        agendaSrcLang, agendaLangTab, agendaTitleRu, agendaTitleUz, agendaTitleEn,
        agendaStatusRu, agendaStatusUz, agendaStatusEn,
      });
    }

    sessionStorage.setItem(SS_DRAFT, JSON.stringify(draft));
  }, [
    showPlanModal, showCreatePlanModal, showMeetingModal, showAgendaModal,
    planSrcLang, planLangTab, planTitleRu, planTitleUz, planTitleEn,
    planStatusRu, planStatusUz, planStatusEn, planStatusEdit,
    planPeriodStart, planPeriodEnd,
    newPlanTitle, newPlanPeriodStart, newPlanPeriodEnd,
    meetDateFrom, editingMeeting,
    agendaMeetingId, editingAgendaItem, agendaSrcLang, agendaLangTab,
    agendaTitleRu, agendaTitleUz, agendaTitleEn,
    agendaStatusRu, agendaStatusUz, agendaStatusEn,
  ]);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    fetchWorkPlans().then((data) => {
      setPlans(data);
      if (data.length > 0) {
        fetchPlanMeetings(data[0].id).then((m) => {
          setMeetings(m);
          setLoading(false);
          if (!draftRestored.current) {
            draftRestored.current = true;
            restoreDraft(m);
          }
        });
      } else {
        setLoading(false);
        if (!draftRestored.current) {
          draftRestored.current = true;
          restoreDraft([]);
        }
      }
    });
  }, [profile?.id, restoreDraft]);

  const reload = async (planId: string) => {
    const m = await fetchPlanMeetings(planId);
    setMeetings(m);
  };

  // ── Plan modal ────────────────────────────────────────────────────────────
  const openCreatePlan = () => {
    const now = new Date();
    const year = now.getFullYear();
    setNewPlanTitle("");
    setNewPlanPeriodStart(`${year}-01-01`);
    setNewPlanPeriodEnd(`${year}-12-31`);
    setNewPlanError(null);
    setShowCreatePlanModal(true);
  };

  const handleCreateNewPlan = async () => {
    if (!newPlanTitle.trim()) { setNewPlanError(t("workplan.titleRequired")); return; }
    if (!newPlanPeriodStart || !newPlanPeriodEnd) { setNewPlanError(t("workplan.datesRequired")); return; }
    setNewPlanSaving(true);
    setNewPlanError(null);
    try {
      await createWorkPlan({
        title: newPlanTitle.trim(),
        title_ru: newPlanTitle.trim(),
        source_language: "ru",
        period_start: newPlanPeriodStart,
        period_end: newPlanPeriodEnd,
        status: "draft",
        organization_id: org?.id,
      });
      setPlans(await fetchWorkPlans());
      setMeetings([]);
      setShowCreatePlanModal(false);
    } catch (e) {
      setNewPlanError(e instanceof Error ? e.message : t("workplan.saveError"));
    } finally {
      setNewPlanSaving(false);
    }
  };

  const openEditPlan = () => {
    const plan = plans[0];
    if (!plan) return;
    const src = (plan.source_language as SupportedLang) ?? "ru";
    setPlanSrcLang(src);
    setPlanLangTab(src);
    setPlanTitleRu(plan.title_ru ?? plan.title);
    setPlanTitleUz(plan.title_uz ?? "");
    setPlanTitleEn(plan.title_en ?? "");
    setPlanStatusRu(src === "ru" ? "original" : (plan.title_ru ? "auto_translated" : "missing"));
    setPlanStatusUz(src === "uz" ? "original" : (plan.title_uz ? "auto_translated" : "missing"));
    setPlanStatusEn(src === "en" ? "original" : (plan.title_en ? "auto_translated" : "missing"));
    setPlanStatusEdit(plan.status);
    setPlanPeriodStart(plan.period_start);
    setPlanPeriodEnd(plan.period_end);
    setPlanError(null);
    setShowPlanModal(true);
  };

  const getPlanTabTitle = () =>
    planLangTab === "ru" ? planTitleRu : planLangTab === "uz" ? planTitleUz : planTitleEn;

  const setPlanTabTitle = (val: string) => {
    if (planLangTab === "ru") {
      setPlanTitleRu(val);
      if (planLangTab !== planSrcLang) setPlanStatusRu("reviewed");
    } else if (planLangTab === "uz") {
      setPlanTitleUz(val);
      if (planLangTab !== planSrcLang) setPlanStatusUz("reviewed");
    } else {
      setPlanTitleEn(val);
      if (planLangTab !== planSrcLang) setPlanStatusEn("reviewed");
    }
  };

  const handleGeneratePlanTranslations = async () => {
    const srcTitle = planSrcLang === "ru" ? planTitleRu : planSrcLang === "uz" ? planTitleUz : planTitleEn;
    if (!srcTitle.trim()) return;
    setPlanTranslating(true);
    setPlanError(null);
    try {
      const draft = await generateMeetingTranslations(planSrcLang, srcTitle);
      setPlanTitleRu(draft.title_ru); setPlanTitleUz(draft.title_uz); setPlanTitleEn(draft.title_en);
      setPlanStatusRu(draft.status_ru); setPlanStatusUz(draft.status_uz); setPlanStatusEn(draft.status_en);
    } catch {
      setPlanError(t("workplan.translationError"));
    } finally {
      setPlanTranslating(false);
    }
  };

  const handleSavePlan = async () => {
    if (!plans[0]) return;
    if (!planTitleRu.trim()) { setPlanError(t("workplan.titleRequired")); return; }
    setPlanSaving(true);
    setPlanError(null);
    try {
      const srcTitle = planSrcLang === "ru" ? planTitleRu : planSrcLang === "uz" ? planTitleUz : planTitleEn;
      await updateWorkPlan(plans[0].id, {
        title: srcTitle,
        title_ru: planTitleRu || null,
        title_uz: planTitleUz || null,
        title_en: planTitleEn || null,
        source_language: planSrcLang,
        period_start: planPeriodStart,
        period_end: planPeriodEnd,
        status: planStatusEdit,
      });
      setPlans(await fetchWorkPlans());
      setShowPlanModal(false);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : t("workplan.saveError"));
    } finally {
      setPlanSaving(false);
    }
  };

  // ── Meeting modal ─────────────────────────────────────────────────────────
  const openCreateMeeting = () => {
    setEditingMeeting(null);
    setMeetDateFrom(""); setMeetStatus("planned");
    setMeetError(null); setShowMeetingModal(true);
  };

  const openEditMeeting = (m: PlanMeeting) => {
    setEditingMeeting(m);
    setMeetDateFrom(m.planned_date_from); setMeetStatus(m.status);
    setMeetError(null); setShowMeetingModal(true);
  };

  const handleSaveMeeting = async () => {
    if (!plans[0]) return;
    if (!meetDateFrom) { setMeetError(t("workplan.datesRequired")); return; }
    setMeetSaving(true);
    setMeetError(null);
    const dateRangeText = formatPlanDateRange(meetDateFrom, meetDateFrom);
    try {
      if (editingMeeting) {
        await updatePlanMeeting(editingMeeting.id, {
          planned_date_from: meetDateFrom, planned_date_to: meetDateFrom,
          planned_date_range_text: dateRangeText, status: meetStatus,
        });
      } else {
        const maxNum = meetings.reduce((max, m) => Math.max(max, m.meeting_number), 0);
        await createPlanMeeting(plans[0].id, {
          meeting_number: maxNum + 1,
          planned_date_from: meetDateFrom, planned_date_to: meetDateFrom,
          planned_date_range_text: dateRangeText, status: meetStatus,
        });
      }
      await reload(plans[0].id);
      setShowMeetingModal(false);
    } catch (e) {
      setMeetError(e instanceof Error ? e.message : t("workplan.saveError"));
    } finally {
      setMeetSaving(false);
    }
  };

  const handleDeleteMeeting = async (m: PlanMeeting) => {
    if (!window.confirm(t("workplan.confirmDeleteMeeting"))) return;
    try {
      await deletePlanMeeting(m.id);
      if (expandedMeeting === m.id) setExpandedMeeting(null);
      if (plans[0]) await reload(plans[0].id);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("workplan.deleteError"));
    }
  };

  // ── Agenda item modal ─────────────────────────────────────────────────────
  const openCreateAgendaItem = (meetingId: string) => {
    setEditingAgendaItem(null);
    setAgendaMeetingId(meetingId);
    setAgendaSrcLang("ru"); setAgendaLangTab("ru");
    setAgendaTitleRu(""); setAgendaTitleUz(""); setAgendaTitleEn("");
    setAgendaStatusRu("original"); setAgendaStatusUz("missing"); setAgendaStatusEn("missing");
    setAgendaTransError(null); setAgendaSaveError(null);
    setShowAgendaModal(true);
  };

  const openEditAgendaItem = (item: PlanAgendaItem) => {
    setEditingAgendaItem(item);
    setAgendaMeetingId(item.plan_meeting_id);
    const src = (item.source_language as SupportedLang) || "ru";
    setAgendaSrcLang(src); setAgendaLangTab(src);
    setAgendaTitleRu(item.title_ru ?? item.title);
    setAgendaTitleUz(item.title_uz ?? "");
    setAgendaTitleEn(item.title_en ?? "");
    setAgendaStatusRu((item.translation_status_ru as TranslationStatus) ?? "original");
    setAgendaStatusUz((item.translation_status_uz as TranslationStatus) ?? "missing");
    setAgendaStatusEn((item.translation_status_en as TranslationStatus) ?? "missing");
    setAgendaTransError(null); setAgendaSaveError(null);
    setShowAgendaModal(true);
  };

  const getAgendaTabTitle = () =>
    agendaLangTab === "ru" ? agendaTitleRu : agendaLangTab === "uz" ? agendaTitleUz : agendaTitleEn;

  const handleAgendaTitleChange = (val: string) => {
    if (agendaLangTab === "ru") {
      setAgendaTitleRu(val);
      if (agendaLangTab !== agendaSrcLang) setAgendaStatusRu("reviewed");
    } else if (agendaLangTab === "uz") {
      setAgendaTitleUz(val);
      if (agendaLangTab !== agendaSrcLang) setAgendaStatusUz("reviewed");
    } else {
      setAgendaTitleEn(val);
      if (agendaLangTab !== agendaSrcLang) setAgendaStatusEn("reviewed");
    }
  };

  const handleGenerateAgendaTranslations = async () => {
    const srcTitle = agendaSrcLang === "ru" ? agendaTitleRu : agendaSrcLang === "uz" ? agendaTitleUz : agendaTitleEn;
    if (!srcTitle.trim()) return;
    setAgendaTranslating(true);
    setAgendaTransError(null);
    try {
      const draft = await generateMeetingTranslations(agendaSrcLang, srcTitle);
      setAgendaTitleRu(draft.title_ru); setAgendaTitleUz(draft.title_uz); setAgendaTitleEn(draft.title_en);
      setAgendaStatusRu(draft.status_ru); setAgendaStatusUz(draft.status_uz); setAgendaStatusEn(draft.status_en);
    } catch {
      setAgendaTransError(t("workplan.translationError"));
    } finally {
      setAgendaTranslating(false);
    }
  };

  const handleSaveAgendaItem = async () => {
    if (!agendaMeetingId) return;
    const srcTitle = agendaSrcLang === "ru" ? agendaTitleRu : agendaSrcLang === "uz" ? agendaTitleUz : agendaTitleEn;
    if (!srcTitle.trim()) { setAgendaSaveError(t("workplan.titleRequired")); return; }

    const resolveStatus = (lang: SupportedLang, val: string): TranslationStatus => {
      if (lang === agendaSrcLang) return "original";
      if (!val.trim()) return "missing";
      return lang === "ru" ? agendaStatusRu : lang === "uz" ? agendaStatusUz : agendaStatusEn;
    };

    setAgendaSaving(true);
    setAgendaSaveError(null);
    try {
      const payload = {
        title: srcTitle,
        title_ru: agendaTitleRu || null, title_uz: agendaTitleUz || null, title_en: agendaTitleEn || null,
        source_language: agendaSrcLang,
        translation_status_ru: resolveStatus("ru", agendaTitleRu),
        translation_status_uz: resolveStatus("uz", agendaTitleUz),
        translation_status_en: resolveStatus("en", agendaTitleEn),
      };
      if (editingAgendaItem) {
        await updatePlanAgendaItem(editingAgendaItem.id, payload);
      } else {
        const meeting = meetings.find((m) => m.id === agendaMeetingId);
        const maxOrder = (meeting?.agenda_items || []).reduce((max, i) => Math.max(max, i.order_no), 0);
        await createPlanAgendaItem(agendaMeetingId, maxOrder + 1, payload);
      }
      if (plans[0]) await reload(plans[0].id);
      setShowAgendaModal(false);
    } catch (e) {
      setAgendaSaveError(e instanceof Error ? e.message : t("workplan.saveError"));
    } finally {
      setAgendaSaving(false);
    }
  };

  const handleDeleteAgendaItem = async (item: PlanAgendaItem) => {
    if (!window.confirm(t("workplan.confirmDeleteAgendaItem"))) return;
    try {
      await deletePlanAgendaItem(item.id);
      if (plans[0]) await reload(plans[0].id);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("workplan.deleteError"));
    }
  };

  // ── Create plan modal renderer ───────────────────────────────────────────
  const renderCreatePlanModal = () => (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 480 }}>
        <h2 style={modalTitleStyle}>{t("workplan.createPlan")}</h2>

        <label style={labelStyle}>{t("workplan.planTitle")}</label>
        <input
          value={newPlanTitle}
          onChange={(e) => setNewPlanTitle(e.target.value)}
          style={inputStyle}
          placeholder={t("workplan.planTitle")}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div>
            <label style={labelStyle}>{t("workplan.planPeriodStart")}</label>
            <input type="date" value={newPlanPeriodStart} onChange={(e) => setNewPlanPeriodStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t("workplan.planPeriodEnd")}</label>
            <input type="date" value={newPlanPeriodEnd} onChange={(e) => setNewPlanPeriodEnd(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {newPlanError && <div style={errorStyle}>{newPlanError}</div>}

        <div style={modalFooterStyle}>
          <button onClick={() => setShowCreatePlanModal(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
          <button onClick={handleCreateNewPlan} disabled={newPlanSaving} style={primaryBtnStyle}>
            {newPlanSaving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  if (plans.length === 0) {
    return (
      <div>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, color: "#9CA3AF", marginBottom: 20 }}>{t("workplan.noPlans")}</div>
          {isAdmin && (
            <button onClick={openCreatePlan} style={primaryBtnStyle}>
              + {t("workplan.createPlan")}
            </button>
          )}
        </div>
        {showCreatePlanModal && renderCreatePlanModal()}
      </div>
    );
  }

  const plan = plans[0];
  const today = new Date().toISOString().slice(0, 10);
  const futureMeetings = meetings.filter((m) => m.planned_date_from >= today);
  const pastMeetings = meetings.filter((m) => m.planned_date_from < today);

  return (
    <div>
      {/* Plan header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
            {getLocalizedField(plan as unknown as Record<string, unknown>, "title")}
          </h1>
          <div style={{ fontSize: 13, color: "#6B7280" }}>
            {t("workplan.period", { start: formatDate(plan.period_start), end: formatDate(plan.period_end) })}
            <span style={{
              display: "inline-block", marginLeft: 12, padding: "2px 10px",
              borderRadius: 12, background: "#F3E8FF", color: "#7C3AED",
              fontSize: 12, fontWeight: 600,
            }}>
              {plan.status === "approved" ? t("workplan.approved") : plan.status}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={openEditPlan} style={secondaryBtnStyle}>{t("workplan.editPlan")}</button>
            <button onClick={openCreateMeeting} style={primaryBtnStyle}>+ {t("workplan.addMeeting")}</button>
          </div>
        )}
      </div>

      {/* Upcoming meetings */}
      <h2 style={sectionTitleStyle}>{t("workplan.upcomingMeetings", { count: futureMeetings.length })}</h2>
      {futureMeetings.length === 0 ? (
        <div style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 20 }}>{t("workplan.noUpcomingMeetings")}</div>
      ) : (
        futureMeetings.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={m}
            expanded={expandedMeeting === m.id}
            isAdmin={isAdmin}
            onToggle={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
            onGoCalendar={() => {
              const d = new Date(m.planned_date_from);
              navigate(`/calendar?year=${d.getFullYear()}&month=${d.getMonth()}`);
            }}
            onEdit={() => openEditMeeting(m)}
            onDelete={() => handleDeleteMeeting(m)}
            onAddAgendaItem={() => { setExpandedMeeting(m.id); openCreateAgendaItem(m.id); }}
            onEditAgendaItem={openEditAgendaItem}
            onDeleteAgendaItem={handleDeleteAgendaItem}
          />
        ))
      )}

      {/* Past meetings */}
      {pastMeetings.length > 0 && (
        <>
          <h2 style={{ ...sectionTitleStyle, marginTop: 32, color: "#9CA3AF" }}>
            {t("workplan.pastMeetings", { count: pastMeetings.length })}
          </h2>
          {pastMeetings.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              expanded={expandedMeeting === m.id}
              isAdmin={isAdmin}
              past
              onToggle={() => setExpandedMeeting(expandedMeeting === m.id ? null : m.id)}
              onEdit={() => openEditMeeting(m)}
              onDelete={() => handleDeleteMeeting(m)}
              onAddAgendaItem={() => { setExpandedMeeting(m.id); openCreateAgendaItem(m.id); }}
              onEditAgendaItem={openEditAgendaItem}
              onDeleteAgendaItem={handleDeleteAgendaItem}
            />
          ))}
        </>
      )}

      {/* ── Plan edit modal ─────────────────────────────────────────────── */}
      {showPlanModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={modalTitleStyle}>{t("workplan.editPlan")}</h2>

            <label style={labelStyle}>{t("nsMeetings.sourceLanguage")}</label>
            <select value={planSrcLang} onChange={(e) => {
              const lng = e.target.value as SupportedLang;
              setPlanSrcLang(lng); setPlanLangTab(lng);
            }} style={selectStyle}>
              <option value="ru">Русский</option>
              <option value="uz">Ўзбекча</option>
              <option value="en">English</option>
            </select>

            <div style={tabBarStyle}>
              {(["ru", "uz", "en"] as SupportedLang[]).map((lng) => {
                const st = lng === "ru" ? planStatusRu : lng === "uz" ? planStatusUz : planStatusEn;
                return (
                  <button key={lng} onClick={() => setPlanLangTab(lng)} style={tabBtnStyle(planLangTab === lng)}>
                    {t(`langTabs.${lng}`)}
                    <span style={{ marginLeft: 4, color: translationStatusColor(st) }}>{translationStatusLabel(st)}</span>
                  </button>
                );
              })}
            </div>

            <label style={labelStyle}>{t("workplan.planTitle")}</label>
            <input
              value={getPlanTabTitle()}
              onChange={(e) => setPlanTabTitle(e.target.value)}
              style={inputStyle}
              placeholder={`${t("workplan.planTitle")} (${planLangTab.toUpperCase()})`}
            />

            <button
              onClick={handleGeneratePlanTranslations}
              disabled={planTranslating}
              style={{ ...secondaryBtnStyle, marginTop: 8, fontSize: 13 }}
            >
              {planTranslating ? t("workplan.generating") : t("workplan.generateTranslations")}
            </button>
            {planError && <div style={errorStyle}>{planError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div>
                <label style={labelStyle}>{t("workplan.planPeriodStart")}</label>
                <input type="date" value={planPeriodStart} onChange={(e) => setPlanPeriodStart(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{t("workplan.planPeriodEnd")}</label>
                <input type="date" value={planPeriodEnd} onChange={(e) => setPlanPeriodEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <label style={{ ...labelStyle, marginTop: 16 }}>{t("workplan.planStatusLabel")}</label>
            <select value={planStatusEdit} onChange={(e) => setPlanStatusEdit(e.target.value)} style={selectStyle}>
              {PLAN_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <div style={modalFooterStyle}>
              <button onClick={() => setShowPlanModal(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
              <button onClick={handleSavePlan} disabled={planSaving} style={primaryBtnStyle}>
                {planSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meeting modal ───────────────────────────────────────────────── */}
      {showMeetingModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 480 }}>
            <h2 style={modalTitleStyle}>
              {editingMeeting ? t("workplan.editMeeting") : t("workplan.addMeeting")}
            </h2>

            <div>
              <label style={labelStyle}>{t("workplan.meetingDateFrom")}</label>
              <input type="date" value={meetDateFrom} onChange={(e) => setMeetDateFrom(e.target.value)} style={inputStyle} />
            </div>

            {meetError && <div style={errorStyle}>{meetError}</div>}

            <div style={modalFooterStyle}>
              <button onClick={() => setShowMeetingModal(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
              <button onClick={handleSaveMeeting} disabled={meetSaving} style={primaryBtnStyle}>
                {meetSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Agenda item modal ───────────────────────────────────────────── */}
      {showAgendaModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={modalTitleStyle}>
              {editingAgendaItem ? t("workplan.editAgendaItem") : t("workplan.addAgendaItem")}
            </h2>

            <label style={labelStyle}>{t("nsMeetings.sourceLanguage")}</label>
            <select value={agendaSrcLang} onChange={(e) => {
              const lng = e.target.value as SupportedLang;
              setAgendaSrcLang(lng); setAgendaLangTab(lng);
            }} style={selectStyle}>
              <option value="ru">Русский</option>
              <option value="uz">Ўзбекча</option>
              <option value="en">English</option>
            </select>

            <div style={tabBarStyle}>
              {(["ru", "uz", "en"] as SupportedLang[]).map((lng) => {
                const st = lng === "ru" ? agendaStatusRu : lng === "uz" ? agendaStatusUz : agendaStatusEn;
                return (
                  <button key={lng} onClick={() => setAgendaLangTab(lng)} style={tabBtnStyle(agendaLangTab === lng)}>
                    {t(`langTabs.${lng}`)}
                    <span style={{ marginLeft: 4, color: translationStatusColor(st) }}>{translationStatusLabel(st)}</span>
                  </button>
                );
              })}
            </div>

            <label style={labelStyle}>{t("workplan.agendaItemTitle")}</label>
            <textarea
              value={getAgendaTabTitle()}
              onChange={(e) => handleAgendaTitleChange(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" as const }}
              placeholder={`${t("workplan.agendaItemTitle")} (${agendaLangTab.toUpperCase()})`}
            />

            <button
              onClick={handleGenerateAgendaTranslations}
              disabled={agendaTranslating}
              style={{ ...secondaryBtnStyle, marginTop: 8, fontSize: 13 }}
            >
              {agendaTranslating ? t("workplan.generating") : t("workplan.generateTranslations")}
            </button>
            {agendaTransError && <div style={errorStyle}>{agendaTransError}</div>}
            {agendaSaveError && <div style={errorStyle}>{agendaSaveError}</div>}

            <div style={modalFooterStyle}>
              <button onClick={() => setShowAgendaModal(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
              <button onClick={handleSaveAgendaItem} disabled={agendaSaving} style={primaryBtnStyle}>
                {agendaSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Meeting Card ─────────────────────────────────────────────────────────────

function MeetingCard({
  meeting, expanded, isAdmin, past,
  onToggle, onGoCalendar, onEdit, onDelete,
  onAddAgendaItem, onEditAgendaItem, onDeleteAgendaItem,
}: {
  meeting: PlanMeeting;
  expanded: boolean;
  isAdmin: boolean;
  past?: boolean;
  onToggle: () => void;
  onGoCalendar?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddAgendaItem: () => void;
  onEditAgendaItem: (item: PlanAgendaItem) => void;
  onDeleteAgendaItem: (item: PlanAgendaItem) => void;
}) {
  const { t } = useTranslation();
  const statusColor = STATUS_COLORS[meeting.status] || "#9CA3AF";
  const items = meeting.agenda_items || [];

  const statusI18nKey =
    meeting.status === "planned" ? "workplan.planStatus.scheduled" :
    meeting.status === "completed" ? "workplan.planStatus.completed" :
    "workplan.planStatus.cancelled";

  return (
    <div style={{ ...cardStyle, opacity: past ? 0.65 : 1, borderLeft: `4px solid ${statusColor}` }}>
      <div style={cardHeaderStyle} onClick={onToggle}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {t("workplan.meetingNumber", { number: meeting.meeting_number })}
            </span>
            <span style={{
              padding: "2px 8px", borderRadius: 10,
              background: statusColor + "1A", color: statusColor,
              fontSize: 11, fontWeight: 600,
            }}>
              {t(statusI18nKey)}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            {formatPlanDateRange(meeting.planned_date_from, meeting.planned_date_to)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {!past && onGoCalendar && (
            <button style={iconBtnStyle} onClick={onGoCalendar} title={t("workplan.goToCalendar")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          {isAdmin && (
            <>
              <button style={iconBtnStyle} onClick={onEdit} title={t("workplan.editMeeting")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button style={{ ...iconBtnStyle, color: "#EF4444" }} onClick={onDelete} title={t("workplan.deleteMeeting")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                </svg>
              </button>
            </>
          )}
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", cursor: "pointer", flexShrink: 0 }}
            onClick={onToggle}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div style={agendaListStyle}>
          {items.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                {t("workplan.agenda", { count: items.length })}
              </div>
              {items.map((item) => (
                <div key={item.id} style={{ ...agendaItemStyle, alignItems: "flex-start" }}>
                  <span style={agendaNumberStyle}>{item.order_no}</span>
                  <span style={{ flex: 1 }}>
                    {getLocalizedField(item as unknown as Record<string, unknown>, "title")}
                  </span>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8, paddingTop: 2 }}>
                      <button style={iconBtnSmallStyle} onClick={() => onEditAgendaItem(item)} title={t("workplan.editAgendaItem")}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button style={{ ...iconBtnSmallStyle, color: "#EF4444" }} onClick={() => onDeleteAgendaItem(item)} title={t("workplan.deleteAgendaItem")}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddAgendaItem(); }}
              style={{ ...secondaryBtnStyle, marginTop: items.length > 0 ? 10 : 0, fontSize: 13 }}
            >
              + {t("workplan.addAgendaItem")}
            </button>
          )}
          {items.length === 0 && !isAdmin && (
            <div style={{ fontSize: 13, color: "#9CA3AF" }}>{t("workplan.noAgendaItems")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getIntlLocale(), {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF", borderRadius: 10,
  border: "1px solid #E5E7EB", marginBottom: 10, overflow: "hidden",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center",
  padding: "14px 18px", cursor: "pointer", userSelect: "none",
};

const agendaListStyle: React.CSSProperties = {
  padding: "12px 18px 14px", borderTop: "1px solid #F3F4F6",
};

const agendaItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  fontSize: 13, color: "#374151", padding: "6px 0", lineHeight: 1.5,
};

const agendaNumberStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: "50%",
  background: "#F3E8FF", color: "#7C3AED",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
};

const iconBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 6,
  border: "1px solid #E5E7EB", background: "transparent",
  cursor: "pointer", color: "#6B7280",
};

const iconBtnSmallStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 24, height: 24, borderRadius: 4,
  border: "1px solid #E5E7EB", background: "transparent",
  cursor: "pointer", color: "#6B7280",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8,
  background: "#3B82F6", color: "#FFFFFF",
  border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8,
  background: "transparent", color: "#374151",
  border: "1px solid #D1D5DB", cursor: "pointer", fontSize: 14, fontWeight: 500,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8,
  background: "transparent", color: "#374151",
  border: "1px solid #D1D5DB", cursor: "pointer", fontSize: 14,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, overflowY: "auto",
};

const modalStyle: React.CSSProperties = {
  background: "#FFFFFF", borderRadius: 14, padding: "28px 32px",
  width: "100%", maxWidth: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, margin: "0 0 20px", color: "#111827",
};

const modalFooterStyle: React.CSSProperties = {
  display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500,
  color: "#374151", marginBottom: 6, marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #D1D5DB", fontSize: 14, color: "#111827",
  boxSizing: "border-box" as const, background: "#FFFFFF",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

const tabBarStyle: React.CSSProperties = {
  display: "flex", gap: 4, marginTop: 16, marginBottom: 4,
  borderBottom: "1px solid #E5E7EB",
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: "7px 16px", fontSize: 13, fontWeight: 500,
  background: "none", border: "none", cursor: "pointer",
  borderBottom: active ? "2px solid #3B82F6" : "2px solid transparent",
  color: active ? "#3B82F6" : "#6B7280", marginBottom: -1,
});

const errorStyle: React.CSSProperties = {
  marginTop: 8, fontSize: 13, color: "#DC2626",
  background: "#FEF2F2", borderRadius: 6, padding: "8px 12px",
};
