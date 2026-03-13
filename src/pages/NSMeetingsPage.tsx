import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchNSMeetings,
  createNSMeeting,
  updateNSMeeting,
  deleteNSMeeting,
  fetchAgendaItems,
  createAgendaItem,
  updateAgendaItem,
  deleteAgendaItem,
  fetchMaterialsByAgenda,
  uploadMaterial,
  deleteMaterial,
  getMaterialUrl,
  formatFileSize,
  getFileTypeLabel,
  fetchBriefsForMeeting,
  generateBrief,
  type NSMeeting,
  type AgendaItem,
  type Material,
  type AgendaBrief,
  type BriefLang,
} from "../lib/nsMeetings";
import { getLocalizedField, isTranslationStale, getStatusBadgeStyle } from "../lib/i18nHelpers";
import {
  generateMeetingTranslations,
  generateAgendaTranslations,
  type SupportedLang,
  type TranslationStatus,
} from "../lib/translationService";
import {
  fetchVotingsByAgendaItems,
  createAndActivateVoting,
  activateVoting,
  closeVotingItem,
  castVote,
  tallyBoardVotes,
  signMeetingVotes,
  fetchMeetingSignature,
  type Voting,
  type Vote,
  type MeetingVoteSignature,
} from "../lib/voting";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function NSMeetingsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const isAdmin = profile?.role === "admin";

  const [meetings, setMeetings] = useState<NSMeeting[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Meeting form
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<NSMeeting | null>(null);
  const [formSourceLang, setFormSourceLang] = useState<SupportedLang>("ru");
  const [formLangTab, setFormLangTab] = useState<SupportedLang>("ru");
  const [formTitleRu, setFormTitleRu] = useState("");
  const [formTitleUz, setFormTitleUz] = useState("");
  const [formTitleEn, setFormTitleEn] = useState("");
  const [formStatusRu, setFormStatusRu] = useState<TranslationStatus>("original");
  const [formStatusUz, setFormStatusUz] = useState<TranslationStatus>("missing");
  const [formStatusEn, setFormStatusEn] = useState<TranslationStatus>("missing");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState<string>("scheduled");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationStale, setTranslationStale] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [saveError, setSaveError] = useState("");

  // Agenda list
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);

  // Agenda create/edit modal
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [editingAgendaItem, setEditingAgendaItem] = useState<AgendaItem | null>(null);
  const [agendaSourceLang, setAgendaSourceLang] = useState<SupportedLang>("ru");
  const [agendaLangTab, setAgendaLangTab] = useState<SupportedLang>("ru");
  const [agendaTitleRu, setAgendaTitleRu] = useState("");
  const [agendaTitleUz, setAgendaTitleUz] = useState("");
  const [agendaTitleEn, setAgendaTitleEn] = useState("");
  const [agendaPresenterRu, setAgendaPresenterRu] = useState("");
  const [agendaPresenterUz, setAgendaPresenterUz] = useState("");
  const [agendaPresenterEn, setAgendaPresenterEn] = useState("");
  const [agendaStatusRu, setAgendaStatusRu] = useState<TranslationStatus>("original");
  const [agendaStatusUz, setAgendaStatusUz] = useState<TranslationStatus>("missing");
  const [agendaStatusEn, setAgendaStatusEn] = useState<TranslationStatus>("missing");
  const [agendaTranslating, setAgendaTranslating] = useState(false);
  const [agendaTranslationError, setAgendaTranslationError] = useState("");
  const [agendaSaveError, setAgendaSaveError] = useState("");
  const [agendaSaving, setAgendaSaving] = useState(false);

  // Materials per agenda item
  const [materialsMap, setMaterialsMap] = useState<Record<string, Material[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Voting — keyed by agendaItemId → Voting; votes keyed by votingId → my Vote
  const [votingsMap, setVotingsMap] = useState<Record<string, Voting>>({});
  const [myVotesMap, setMyVotesMap] = useState<Record<string, Vote>>({});
  const [meetingSignature, setMeetingSignature] = useState<MeetingVoteSignature | null>(null);
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signError, setSignError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  // AI Briefs — keyed by `${agendaId}_${lang}`
  const [briefsMap, setBriefsMap] = useState<Record<string, AgendaBrief>>({});
  const [briefLoading, setBriefLoading] = useState<Record<string, boolean>>({});
  const [briefError, setBriefError] = useState<Record<string, string>>({});
  const [briefCopied, setBriefCopied] = useState<Record<string, boolean>>({});
  const [briefLang, setBriefLang] = useState<Record<string, BriefLang>>({});

  const LANG_OPTIONS: { value: BriefLang; label: string }[] = [
    { value: "ru", label: "Русский" },
    { value: "uz_cyrl", label: "Ўзбекча (кириллица)" },
    { value: "en", label: "English" },
  ];

  const briefKey = (agendaId: string, lang: BriefLang) => `${agendaId}_${lang}`;
  const getCurrentLang = (agendaId: string): BriefLang => briefLang[agendaId] || "ru";

  const selected = meetings.find((m) => m.id === selectedId) || null;

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadMeetings();
  }, [profile]);

  useEffect(() => {
    if (selectedId) {
      loadAgenda(selectedId);
    } else {
      setAgendaItems([]);
      setMaterialsMap({});
      setVotingsMap({});
      setMyVotesMap({});
      setMeetingSignature(null);
    }
  }, [selectedId]);

  const loadMeetings = async () => {
    setLoading(true);
    const data = await fetchNSMeetings();
    setMeetings(data);
    setLoading(false);
  };

  const loadVotingData = async (items: AgendaItem[], meetingId: string) => {
    if (!profile) return;
    if (items.length === 0) {
      setVotingsMap({});
      setMyVotesMap({});
      setMeetingSignature(null);
      return;
    }
    const agendaIds = items.map((i) => i.id);
    const votings = await fetchVotingsByAgendaItems(agendaIds);
    const vMap: Record<string, Voting> = {};
    const mvMap: Record<string, Vote> = {};
    for (const v of votings) {
      vMap[v.agenda_item_id] = v;
      const myVote = (v.votes || []).find((vote) => vote.voter_id === profile.id);
      if (myVote) mvMap[v.id] = myVote;
    }
    setVotingsMap(vMap);
    setMyVotesMap(mvMap);
    const sig = await fetchMeetingSignature(meetingId, profile.id);
    setMeetingSignature(sig);
  };

  const loadAgenda = async (meetingId: string) => {
    const items = await fetchAgendaItems(meetingId);
    setAgendaItems(items);
    // Load materials for all agenda items
    const mMap: Record<string, Material[]> = {};
    await Promise.all(
      items.map(async (item) => {
        mMap[item.id] = await fetchMaterialsByAgenda(item.id);
      })
    );
    setMaterialsMap(mMap);
    // Load saved briefs (all languages)
    if (items.length > 0) {
      const briefsByAgenda = await fetchBriefsForMeeting(items.map((i) => i.id));
      const newMap: Record<string, AgendaBrief> = {};
      for (const [agId, arr] of Object.entries(briefsByAgenda)) {
        for (const b of arr) {
          newMap[`${agId}_${b.lang}`] = b;
        }
      }
      setBriefsMap(newMap);
    }
    // Load voting data
    await loadVotingData(items, meetingId);
  };

  // ---------- Meeting CRUD ----------

  const getSourceTitle = (src: SupportedLang = formSourceLang) =>
    src === "ru" ? formTitleRu : src === "uz" ? formTitleUz : formTitleEn;

  const openCreateForm = () => {
    setEditingMeeting(null);
    setFormSourceLang("ru");
    setFormLangTab("ru");
    setFormTitleRu(""); setFormTitleUz(""); setFormTitleEn("");
    setFormStatusRu("original"); setFormStatusUz("missing"); setFormStatusEn("missing");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStatus("scheduled");
    setTranslationStale(false);
    setTranslationError("");
    setSaveError("");
    setShowMeetingForm(true);
  };

  const openEditForm = (m: NSMeeting) => {
    const src = (m.source_language || "ru") as SupportedLang;
    setEditingMeeting(m);
    setFormSourceLang(src);
    setFormLangTab(src);
    setFormTitleRu(m.title_ru || m.title || "");
    setFormTitleUz(m.title_uz || "");
    setFormTitleEn(m.title_en || "");
    setFormStatusRu((m.translation_status_ru || "original") as TranslationStatus);
    setFormStatusUz((m.translation_status_uz || "missing") as TranslationStatus);
    setFormStatusEn((m.translation_status_en || "missing") as TranslationStatus);
    setFormDate(m.start_at.slice(0, 10));
    setFormStatus(m.status);
    setTranslationStale(false);
    setTranslationError("");
    setSaveError("");
    setShowMeetingForm(true);
  };

  const handleGenerateTranslations = async () => {
    const sourceText = getSourceTitle();
    if (!sourceText.trim()) return;
    setTranslating(true);
    setTranslationError("");
    try {
      const draft = await generateMeetingTranslations(formSourceLang, sourceText.trim());
      setFormTitleRu(draft.title_ru);
      setFormTitleUz(draft.title_uz);
      setFormTitleEn(draft.title_en);
      setFormStatusRu(draft.status_ru);
      setFormStatusUz(draft.status_uz);
      setFormStatusEn(draft.status_en);
      setTranslationStale(false);
    } catch (e) {
      console.error("[translate] error:", e);
      setTranslationError(e instanceof Error ? e.message : t("nsMeetings.translationError"));
    } finally {
      setTranslating(false);
    }
  };

  const handleSaveMeeting = async () => {
    const sourceText = getSourceTitle();
    if (!sourceText.trim() || !formDate || !org || !profile) return;
    setSaving(true);

    // If user manually typed in a non-source tab but status is still "missing", promote to "reviewed"
    const getFieldValue = (lang: SupportedLang) =>
      lang === "ru" ? formTitleRu : lang === "uz" ? formTitleUz : formTitleEn;
    const markReviewed = (status: TranslationStatus, lang: SupportedLang): TranslationStatus => {
      if (lang !== formSourceLang && status === "missing" && getFieldValue(lang).trim()) {
        return "reviewed";
      }
      return status;
    };

    const payload = {
      title: sourceText.trim(),
      title_ru: formTitleRu.trim() || null,
      title_uz: formTitleUz.trim() || null,
      title_en: formTitleEn.trim() || null,
      source_language: formSourceLang,
      translation_status_ru: markReviewed(formStatusRu, "ru"),
      translation_status_uz: markReviewed(formStatusUz, "uz"),
      translation_status_en: markReviewed(formStatusEn, "en"),
      start_at: new Date(formDate).toISOString(),
      status: formStatus,
    };

    try {
      if (editingMeeting) {
        await updateNSMeeting(editingMeeting.id, payload);
      } else {
        await createNSMeeting(org.id, profile.id, payload);
      }
      setShowMeetingForm(false);
      await loadMeetings();
    } catch (e) {
      console.error(e);
      setSaveError(e instanceof Error ? e.message : t("common.saveFailed", "Не удалось сохранить. Попробуйте ещё раз."));
    }
    setSaving(false);
  };

  // Detect stale translations when user edits source title in edit mode
  const handleSourceTitleChange = (val: string, lang: SupportedLang) => {
    if (lang === "ru") setFormTitleRu(val);
    else if (lang === "uz") setFormTitleUz(val);
    else setFormTitleEn(val);

    // When user manually types in a non-source tab, update its translation status
    if (lang !== formSourceLang) {
      const newStatus: TranslationStatus = val.trim() ? "reviewed" : "missing";
      if (lang === "ru") setFormStatusRu(newStatus);
      else if (lang === "uz") setFormStatusUz(newStatus);
      else setFormStatusEn(newStatus);
    }

    if (editingMeeting && lang === formSourceLang) {
      setTranslationStale(
        isTranslationStale(editingMeeting as unknown as Record<string, unknown>, lang, val)
      );
    }
  };

  const handleDeleteMeeting = async () => {
    if (!selected) return;
    if (!window.confirm(t("nsMeetings.confirmDelete"))) return;
    try {
      await deleteNSMeeting(selected.id);
      setSelectedId(null);
      await loadMeetings();
    } catch (e) {
      console.error(e);
    }
  };

  // ---------- Agenda CRUD ----------

  const getAgendaSourceTitle = () =>
    agendaSourceLang === "ru" ? agendaTitleRu : agendaSourceLang === "uz" ? agendaTitleUz : agendaTitleEn;

  const openCreateAgendaForm = () => {
    setEditingAgendaItem(null);
    setAgendaSourceLang("ru");
    setAgendaLangTab("ru");
    setAgendaTitleRu(""); setAgendaTitleUz(""); setAgendaTitleEn("");
    setAgendaPresenterRu(""); setAgendaPresenterUz(""); setAgendaPresenterEn("");
    setAgendaStatusRu("original"); setAgendaStatusUz("missing"); setAgendaStatusEn("missing");
    setAgendaTranslationError("");
    setAgendaSaveError("");
    setShowAgendaModal(true);
  };

  const openEditAgendaForm = (item: AgendaItem) => {
    const src = (item.source_language || "ru") as SupportedLang;
    setEditingAgendaItem(item);
    setAgendaSourceLang(src);
    setAgendaLangTab(src);
    setAgendaTitleRu(item.title_ru || item.title || "");
    setAgendaTitleUz(item.title_uz || "");
    setAgendaTitleEn(item.title_en || "");
    setAgendaPresenterRu(item.presenter_ru || item.presenter || "");
    setAgendaPresenterUz(item.presenter_uz || "");
    setAgendaPresenterEn(item.presenter_en || "");
    setAgendaStatusRu((item.translation_status_ru || "original") as TranslationStatus);
    setAgendaStatusUz((item.translation_status_uz || "missing") as TranslationStatus);
    setAgendaStatusEn((item.translation_status_en || "missing") as TranslationStatus);
    setAgendaTranslationError("");
    setAgendaSaveError("");
    setShowAgendaModal(true);
  };

  const handleAgendaTitleChange = (val: string, lang: SupportedLang) => {
    if (lang === "ru") setAgendaTitleRu(val);
    else if (lang === "uz") setAgendaTitleUz(val);
    else setAgendaTitleEn(val);

    if (lang !== agendaSourceLang) {
      const presVal = lang === "ru" ? agendaPresenterRu : lang === "uz" ? agendaPresenterUz : agendaPresenterEn;
      const newStatus: TranslationStatus = (val.trim() || presVal.trim()) ? "reviewed" : "missing";
      if (lang === "ru") setAgendaStatusRu(newStatus);
      else if (lang === "uz") setAgendaStatusUz(newStatus);
      else setAgendaStatusEn(newStatus);
    }
  };

  const handleAgendaPresenterChange = (val: string, lang: SupportedLang) => {
    if (lang === "ru") setAgendaPresenterRu(val);
    else if (lang === "uz") setAgendaPresenterUz(val);
    else setAgendaPresenterEn(val);

    if (lang !== agendaSourceLang) {
      const titleVal = lang === "ru" ? agendaTitleRu : lang === "uz" ? agendaTitleUz : agendaTitleEn;
      const newStatus: TranslationStatus = (titleVal.trim() || val.trim()) ? "reviewed" : "missing";
      if (lang === "ru") setAgendaStatusRu(newStatus);
      else if (lang === "uz") setAgendaStatusUz(newStatus);
      else setAgendaStatusEn(newStatus);
    }
  };

  const handleGenerateAgendaTranslations = async () => {
    const sourceTitle = getAgendaSourceTitle();
    if (!sourceTitle.trim()) return;
    const sourcePresenter = (agendaSourceLang === "ru" ? agendaPresenterRu : agendaSourceLang === "uz" ? agendaPresenterUz : agendaPresenterEn);
    setAgendaTranslating(true);
    setAgendaTranslationError("");
    try {
      const draft = await generateAgendaTranslations(agendaSourceLang, sourceTitle.trim(), sourcePresenter.trim());
      setAgendaTitleRu(draft.title_ru);
      setAgendaTitleUz(draft.title_uz);
      setAgendaTitleEn(draft.title_en);
      setAgendaPresenterRu(draft.presenter_ru);
      setAgendaPresenterUz(draft.presenter_uz);
      setAgendaPresenterEn(draft.presenter_en);
      setAgendaStatusRu(draft.status_ru);
      setAgendaStatusUz(draft.status_uz);
      setAgendaStatusEn(draft.status_en);
    } catch (e) {
      console.error("[translate agenda] error:", e);
      setAgendaTranslationError(e instanceof Error ? e.message : t("nsMeetings.translationError"));
    } finally {
      setAgendaTranslating(false);
    }
  };

  const handleSaveAgendaItem = async () => {
    if (!getAgendaSourceTitle().trim() || !selected || !org || !profile) return;
    setAgendaSaving(true);
    setAgendaSaveError("");

    const resolveStatus = (lang: SupportedLang, status: TranslationStatus): TranslationStatus => {
      if (lang === agendaSourceLang) return status;
      const titleVal = lang === "ru" ? agendaTitleRu : lang === "uz" ? agendaTitleUz : agendaTitleEn;
      const presVal = lang === "ru" ? agendaPresenterRu : lang === "uz" ? agendaPresenterUz : agendaPresenterEn;
      if (status === "missing" && (titleVal.trim() || presVal.trim())) return "reviewed";
      return status;
    };

    const sourceTitle = getAgendaSourceTitle().trim();
    const sourcePresenter = (agendaSourceLang === "ru" ? agendaPresenterRu : agendaSourceLang === "uz" ? agendaPresenterUz : agendaPresenterEn).trim() || null;

    const payload = {
      title: sourceTitle,
      title_ru: agendaTitleRu.trim() || null,
      title_uz: agendaTitleUz.trim() || null,
      title_en: agendaTitleEn.trim() || null,
      presenter: sourcePresenter,
      presenter_ru: agendaPresenterRu.trim() || null,
      presenter_uz: agendaPresenterUz.trim() || null,
      presenter_en: agendaPresenterEn.trim() || null,
      source_language: agendaSourceLang,
      translation_status_ru: resolveStatus("ru", agendaStatusRu),
      translation_status_uz: resolveStatus("uz", agendaStatusUz),
      translation_status_en: resolveStatus("en", agendaStatusEn),
    };

    try {
      if (editingAgendaItem) {
        await updateAgendaItem(editingAgendaItem.id, payload);
      } else {
        await createAgendaItem(selected.id, org.id, agendaItems.length + 1, payload);
      }
      setShowAgendaModal(false);
      await loadAgenda(selected.id);
    } catch (e) {
      setAgendaSaveError(e instanceof Error ? e.message : t("common.saveFailed", "Не удалось сохранить. Попробуйте ещё раз."));
    }
    setAgendaSaving(false);
  };

  const handleDeleteAgenda = async (itemId: string) => {
    try {
      await deleteAgendaItem(itemId);
      if (selected) await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  // ---------- Materials ----------

  const handleUploadFile = async (agendaItemId: string, file: File) => {
    if (!org || !profile || !selected) return;
    try {
      await uploadMaterial(file, org.id, profile.id, selected.id, agendaItemId, file.name);
      await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMaterial = async (mat: Material) => {
    try {
      await deleteMaterial(mat);
      if (selected) await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async (mat: Material) => {
    const url = await getMaterialUrl(mat.storage_path);
    if (url) window.open(url, "_blank");
  };

  // ---------- AI Brief ----------

  const handleGenerateBrief = async (agendaId: string) => {
    const lang = getCurrentLang(agendaId);
    const key = briefKey(agendaId, lang);
    setBriefLoading((prev) => ({ ...prev, [key]: true }));
    setBriefError((prev) => ({ ...prev, [key]: "" }));
    try {
      const result = await generateBrief(agendaId, lang);
      setBriefsMap((prev) => ({
        ...prev,
        [key]: {
          id: "",
          agenda_id: agendaId,
          lang,
          brief_text: result.brief,
          files_used: result.files_used,
          docx_path: null,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id || "",
        },
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("nsMeetings.briefError");
      setBriefError((prev) => ({ ...prev, [key]: msg }));
    }
    setBriefLoading((prev) => ({ ...prev, [key]: false }));
  };

  const handleCopyBrief = (agendaId: string) => {
    const key = briefKey(agendaId, getCurrentLang(agendaId));
    const brief = briefsMap[key];
    if (!brief) return;
    navigator.clipboard.writeText(brief.brief_text);
    setBriefCopied((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setBriefCopied((prev) => ({ ...prev, [key]: false })), 2000);
  };

  const handleDownloadDocx = (agendaId: string) => {
    const lang = getCurrentLang(agendaId);
    const key = briefKey(agendaId, lang);
    const brief = briefsMap[key];
    if (!brief) return;

    // Find the agenda item for title/presenter
    const item = agendaItems.find((a) => a.id === agendaId);
    const title = item ? getLocalizedField(item as unknown as Record<string, unknown>, "title") : "";
    const presenter = item ? getLocalizedField(item as unknown as Record<string, unknown>, "presenter") : "";

    const docxBlob = buildDocxBlob(title, presenter, brief.brief_text, lang);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(docxBlob);
    a.download = `AI-Brief_${title.slice(0, 30).replace(/[^a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9]/g, "_")}_${lang}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  // ---------- Voting handlers ----------

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const handleActivateVoting = async (item: AgendaItem) => {
    if (!org || !profile) return;
    if (!window.confirm(t("nsVoting.activateConfirm"))) return;
    try {
      const existing = votingsMap[item.id];
      const title = getLocalizedField(item as unknown as Record<string, unknown>, "title") || item.title;
      if (existing && existing.status === "draft") {
        await activateVoting(existing.id, profile.id);
      } else if (!existing) {
        await createAndActivateVoting(item.id, org.id, profile.id, title);
      }
      await loadVotingData(agendaItems, selected!.id);
      showToast(t("nsVoting.activateSuccess"));
    } catch (e) {
      console.error("handleActivateVoting error:", e);
    }
  };

  const handleCloseVoting = async (votingId: string) => {
    if (!window.confirm(t("nsVoting.closeConfirm"))) return;
    try {
      await closeVotingItem(votingId);
      if (selected) await loadVotingData(agendaItems, selected.id);
      showToast(t("nsVoting.closeSuccess"));
    } catch (e) {
      console.error("handleCloseVoting error:", e);
    }
  };

  const handleCastVote = async (votingId: string, choice: "for" | "against" | "abstain") => {
    if (!org || !profile) return;
    try {
      await castVote(votingId, org.id, profile.id, choice);
      if (selected) await loadVotingData(agendaItems, selected.id);
      showToast(t("nsVoting.voteSaved"));
    } catch (e) {
      console.error("handleCastVote error:", e);
    }
  };

  const handleSignVotes = async () => {
    if (!selected || !profile || !org) return;
    if (!window.confirm(t("nsVoting.signConfirm"))) return;
    setSigningInProgress(true);
    setSignError("");
    try {
      await signMeetingVotes(selected.id, profile.id, org.id);
      await loadVotingData(agendaItems, selected.id);
      showToast(t("nsVoting.signSuccess"));
    } catch (e) {
      setSignError(e instanceof Error ? e.message : t("nsVoting.signError"));
    }
    setSigningInProgress(false);
  };

  // ---------- Status helpers ----------

  const statusLabel = (s: string) => {
    if (s === "draft") return t("nsMeetings.statusDraft");
    if (s === "scheduled") return t("nsMeetings.statusScheduled");
    return t("nsMeetings.statusCompleted");
  };

  const statusColor = (s: string) => {
    if (s === "completed") return { bg: "#DCFCE7", color: "#166534" };
    if (s === "scheduled") return { bg: "#DBEAFE", color: "#1E40AF" };
    return { bg: "#F3F4F6", color: "#6B7280" };
  };

  const fileTypeIcon = (mime: string) => {
    const label = getFileTypeLabel(mime);
    const colors: Record<string, string> = { PDF: "#DC2626", Word: "#2563EB", Excel: "#16A34A", PowerPoint: "#EA580C" };
    return { label, color: colors[label] || "#6B7280" };
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t("nsMeetings.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
        {t("nsMeetings.subtitle")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, alignItems: "start" }}>
        {/* ===== LEFT COLUMN — Meeting List ===== */}
        <div style={panelStyle}>
          {isAdmin && (
            <button onClick={openCreateForm} style={primaryBtnStyle}>
              + {t("nsMeetings.createMeeting")}
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: isAdmin ? 16 : 0 }}>
            {meetings.length === 0 && (
              <p style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", padding: 20 }}>
                {t("nsMeetings.noMeetingSelected")}
              </p>
            )}
            {meetings.map((m) => {
              const active = m.id === selectedId;
              const sc = statusColor(m.status);
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    ...meetingCardStyle,
                    borderColor: active ? "#3B82F6" : "#E5E7EB",
                    background: active ? "#EFF6FF" : "#FFFFFF",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 4 }}>
                    {getLocalizedField(m as unknown as Record<string, unknown>, "title")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>
                      {new Date(m.start_at).toLocaleDateString(getIntlLocale(), {
                        day: "2-digit", month: "2-digit", year: "numeric",
                      })}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                      background: sc.bg, color: sc.color,
                    }}>
                      {statusLabel(m.status)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== RIGHT COLUMN — Meeting Details ===== */}
        <div style={panelStyle}>
          {!selected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                {t("nsMeetings.noMeetingSelected")}
              </div>
              <p style={{ fontSize: 13, textAlign: "center", maxWidth: 320 }}>
                {t("nsMeetings.noMeetingSelectedHint")}
              </p>
            </div>
          ) : (
            <div>
              {/* Meeting Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>
                    {getLocalizedField(selected as unknown as Record<string, unknown>, "title")}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>
                      {new Date(selected.start_at).toLocaleDateString(getIntlLocale(), {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </span>
                    {(() => { const sc = statusColor(selected.status); return (
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.color }}>
                        {statusLabel(selected.status)}
                      </span>
                    ); })()}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEditForm(selected)} style={smallBtnStyle}>
                      {t("nsMeetings.editMeeting")}
                    </button>
                    <button onClick={handleDeleteMeeting} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FECACA" }}>
                      {t("nsMeetings.deleteMeeting")}
                    </button>
                  </div>
                )}
              </div>

              {/* Agenda Section */}
              <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{t("nsMeetings.agenda")}</h3>
                  {isAdmin && (
                    <button onClick={openCreateAgendaForm} style={smallBtnStyle}>
                      + {t("nsMeetings.addAgendaItem")}
                    </button>
                  )}
                </div>

                {agendaItems.length === 0 && (
                  <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("nsMeetings.noAgenda")}</p>
                )}

                {/* Agenda list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {agendaItems.map((item, idx) => {
                    const mats = materialsMap[item.id] || [];
                    return (
                      <div key={item.id} style={agendaItemStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>
                              {idx + 1}. {getLocalizedField(item as unknown as Record<string, unknown>, "title")}
                            </div>
                            {(item.presenter_ru || item.presenter) && (
                              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                                <span style={{ fontWeight: 500 }}>{t("nsMeetings.speaker")}:</span>{" "}
                                {getLocalizedField(item as unknown as Record<string, unknown>, "presenter")}
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => openEditAgendaForm(item)}
                                style={{ ...smallBtnStyle, fontSize: 12, padding: "3px 10px" }}
                                title={t("common.edit")}
                              >
                                {t("common.edit")}
                              </button>
                              <button
                                onClick={() => handleDeleteAgenda(item.id)}
                                style={{ ...deleteBtnStyle }}
                                title={t("common.delete")}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Materials for this agenda item */}
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                              {t("nsMeetings.materials")}
                            </span>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => fileInputRefs.current[item.id]?.click()}
                                  style={uploadBtnStyle}
                                >
                                  + {t("nsMeetings.uploadFile")}
                                </button>
                                <input
                                  ref={(el) => { fileInputRefs.current[item.id] = el; }}
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadFile(item.id, f);
                                    e.target.value = "";
                                  }}
                                />
                              </>
                            )}
                          </div>

                          {mats.length === 0 && (
                            <p style={{ color: "#D1D5DB", fontSize: 13, margin: 0 }}>
                              {t("nsMeetings.noMaterials")}
                            </p>
                          )}

                          {mats.map((mat) => {
                            const ft = fileTypeIcon(mat.mime_type);
                            return (
                              <div key={mat.id} style={materialCardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    width: 36, height: 36, borderRadius: 8, display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                    background: ft.color + "18", color: ft.color,
                                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                                  }}>
                                    {ft.label}
                                  </div>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {mat.file_name}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                                      {formatFileSize(mat.file_size)} · {new Date(mat.created_at).toLocaleDateString(getIntlLocale())}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                  <button onClick={() => handleDownload(mat)} style={downloadBtnStyle}>
                                    ↓ {t("nsMeetings.download")}
                                  </button>
                                  {isAdmin && (
                                    <button onClick={() => handleDeleteMaterial(mat)} style={{ ...deleteBtnStyle, fontSize: 12 }}>
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* AI-Brief Section */}
                        <div style={{ marginTop: 14 }}>
                          {(() => {
                            const lang = getCurrentLang(item.id);
                            const key = briefKey(item.id, lang);
                            const brief = briefsMap[key];
                            const isLoading = briefLoading[key];
                            const error = briefError[key];
                            return (
                              <>
                                {/* Language selector + Generate button */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <select
                                    value={lang}
                                    onChange={(e) => setBriefLang((prev) => ({ ...prev, [item.id]: e.target.value as BriefLang }))}
                                    style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff" }}
                                  >
                                    {LANG_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                  {!isLoading && (
                                    <button
                                      onClick={() => handleGenerateBrief(item.id)}
                                      disabled={mats.length === 0}
                                      style={{
                                        ...aiBriefBtnStyle,
                                        opacity: mats.length === 0 ? 0.5 : 1,
                                        cursor: mats.length === 0 ? "not-allowed" : "pointer",
                                      }}
                                      title={mats.length === 0 ? t("nsMeetings.noMaterialsForBrief") : ""}
                                    >
                                      {brief ? "↻ " + t("nsMeetings.refreshBrief") : "✨ " + t("nsMeetings.generateBrief")}
                                    </button>
                                  )}
                                </div>

                                {isLoading && (
                                  <div style={{ fontSize: 13, color: "#6B7280", padding: "8px 0" }}>
                                    ⏳ {t("nsMeetings.briefLoading")}
                                  </div>
                                )}

                                {error && (
                                  <div style={{ fontSize: 13, color: "#DC2626", padding: "4px 0" }}>
                                    {error}
                                  </div>
                                )}

                                {brief && !isLoading && (
                                  <div style={briefBlockStyle}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED" }}>
                                        ✨ {t("nsMeetings.aiBrief")} ({LANG_OPTIONS.find((o) => o.value === lang)?.label})
                                      </span>
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => handleCopyBrief(item.id)} style={briefActionBtnStyle}>
                                          {briefCopied[key] ? t("nsMeetings.briefCopied") : t("nsMeetings.copyBrief")}
                                        </button>
                                        <button onClick={() => handleDownloadDocx(item.id)} style={{ ...briefActionBtnStyle, color: "#2563EB" }}>
                                          ↓ {t("nsMeetings.downloadDocx")}
                                        </button>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "#374151", whiteSpace: "pre-wrap" }}>
                                      {brief.brief_text}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
                                      {t("nsMeetings.briefFilesUsed")}: {brief.files_used}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* ===== Voting Section per agenda item ===== */}
                        {(() => {
                          const voting = votingsMap[item.id] ?? null;
                          const isVotingOpen = voting?.status === "open";
                          const isVotingClosed = voting?.status === "closed";
                          const myVote = voting ? (myVotesMap[voting.id] ?? null) : null;
                          const tally = voting ? tallyBoardVotes(voting.votes || []) : null;
                          return (
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F3F4F6" }}>
                              {/* Header row */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                                  🗳 {t("nsVoting.title")}
                                </span>
                                {voting && (
                                  <span style={getVotingStatusBadgeStyle(voting.status)}>
                                    {voting.status === "draft" ? t("nsVoting.notStarted")
                                      : voting.status === "open" ? t("nsVoting.active")
                                      : t("nsVoting.closed")}
                                  </span>
                                )}
                              </div>

                              {/* Admin controls */}
                              {isAdmin && !voting && (
                                <button onClick={() => handleActivateVoting(item)} style={activateVotingBtnStyle}>
                                  + {t("nsVoting.activate")}
                                </button>
                              )}
                              {isAdmin && voting?.status === "draft" && (
                                <button onClick={() => handleActivateVoting(item)} style={activateVotingBtnStyle}>
                                  {t("nsVoting.activate")}
                                </button>
                              )}
                              {isAdmin && isVotingOpen && (
                                <button
                                  onClick={() => handleCloseVoting(voting!.id)}
                                  style={{ ...smallBtnStyle, fontSize: 12, padding: "3px 10px", color: "#DC2626", borderColor: "#FECACA" }}
                                >
                                  {t("nsVoting.closeVoting")}
                                </button>
                              )}

                              {/* No voting for non-admin */}
                              {!voting && !isAdmin && (
                                <span style={{ fontSize: 13, color: "#9CA3AF" }}>{t("nsVoting.notStarted")}</span>
                              )}

                              {/* Tally */}
                              {tally && (
                                <div style={{ display: "flex", gap: 16, fontSize: 13, marginTop: 6, marginBottom: 8 }}>
                                  <span style={{ color: "#059669", fontWeight: 500 }}>✓ {t("nsVoting.voteFor")}: {tally.forCount}</span>
                                  <span style={{ color: "#DC2626", fontWeight: 500 }}>✗ {t("nsVoting.voteAgainst")}: {tally.againstCount}</span>
                                  <span style={{ color: "#9CA3AF", fontWeight: 500 }}>– {t("nsVoting.voteAbstain")}: {tally.abstainCount}</span>
                                </div>
                              )}

                              {/* Member vote buttons */}
                              {isVotingOpen && !meetingSignature && (
                                <div style={{ marginTop: 6 }}>
                                  {myVote ? (
                                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                      <span style={{ fontSize: 13, color: "#6B7280" }}>{t("nsVoting.myVote")}:</span>
                                      {(["for", "against", "abstain"] as const).map((c) => (
                                        <button
                                          key={c}
                                          onClick={() => handleCastVote(voting!.id, c)}
                                          style={getVoteButtonStyle(c, myVote.choice === c)}
                                        >
                                          {c === "for" ? t("nsVoting.voteFor")
                                            : c === "against" ? t("nsVoting.voteAgainst")
                                            : t("nsVoting.voteAbstain")}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {(["for", "against", "abstain"] as const).map((c) => (
                                        <button
                                          key={c}
                                          onClick={() => handleCastVote(voting!.id, c)}
                                          style={getVoteButtonStyle(c, false)}
                                        >
                                          {c === "for" ? t("nsVoting.voteFor")
                                            : c === "against" ? t("nsVoting.voteAgainst")
                                            : t("nsVoting.voteAbstain")}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* After signing — show confirmed vote */}
                              {meetingSignature && myVote && (
                                <div style={{ fontSize: 13, color: "#059669", marginTop: 4 }}>
                                  ✓ {t("nsVoting.myVote")}: {
                                    myVote.choice === "for" ? t("nsVoting.voteFor")
                                      : myVote.choice === "against" ? t("nsVoting.voteAgainst")
                                      : t("nsVoting.voteAbstain")
                                  } · {t("nsVoting.signed")}
                                </div>
                              )}

                              {/* Closed: no signed but show final state */}
                              {isVotingClosed && !meetingSignature && myVote && (
                                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                                  {t("nsVoting.myVote")}: {
                                    myVote.choice === "for" ? t("nsVoting.voteFor")
                                      : myVote.choice === "against" ? t("nsVoting.voteAgainst")
                                      : t("nsVoting.voteAbstain")
                                  }
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* ===== Final Signature Block ===== */}
                {selected && profile && (() => {
                  const openVotings = Object.values(votingsMap).filter((v) => v?.status === "open") as Voting[];
                  if (openVotings.length === 0 && !meetingSignature) return null;
                  const votedCount = openVotings.filter((v) => !!myVotesMap[v.id]).length;
                  const allVoted = openVotings.length > 0 && votedCount === openVotings.length;
                  return (
                    <div style={{
                      marginTop: 24,
                      padding: "18px 20px",
                      background: meetingSignature ? "#F0FDF4" : "#F9FAFB",
                      borderRadius: 12,
                      border: `1px solid ${meetingSignature ? "#BBF7D0" : "#E5E7EB"}`,
                    }}>
                      {meetingSignature ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 24 }}>✅</span>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#059669" }}>
                              {t("nsVoting.signed")}
                            </div>
                            <div style={{ fontSize: 13, color: "#6B7280" }}>
                              {t("nsVoting.signedAt")}: {new Date(meetingSignature.signed_at).toLocaleString(getIntlLocale(), {
                                day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                              🗳 {t("nsVoting.title")} — {votedCount}/{openVotings.length}
                            </span>
                            {allVoted && (
                              <span style={{ fontSize: 13, color: "#059669", fontWeight: 500 }}>
                                {t("nsVoting.allVotedReady")}
                              </span>
                            )}
                          </div>
                          {signError && (
                            <p style={{ color: "#DC2626", fontSize: 13, margin: "0 0 8px 0" }}>{signError}</p>
                          )}
                          <button
                            onClick={handleSignVotes}
                            disabled={!allVoted || signingInProgress}
                            style={{
                              padding: "11px 28px",
                              fontSize: 14,
                              fontWeight: 600,
                              borderRadius: 10,
                              border: "none",
                              background: allVoted ? "#1F2937" : "#E5E7EB",
                              color: allVoted ? "#FFFFFF" : "#9CA3AF",
                              cursor: allVoted && !signingInProgress ? "pointer" : "not-allowed",
                              transition: "all 0.2s",
                            }}
                          >
                            {signingInProgress ? "..." : t("nsVoting.signPackage")}
                          </button>
                          {!allVoted && openVotings.length > 0 && (
                            <p style={{ fontSize: 13, color: "#9CA3AF", margin: "8px 0 0 0" }}>
                              {t("nsVoting.notAllVoted")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Create/Edit Agenda Item Modal ===== */}
      {showAgendaModal && (
        <div style={overlayStyle} onClick={() => setShowAgendaModal(false)}>
          <div style={{ ...modalStyle, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>
              {editingAgendaItem ? t("nsMeetings.editAgendaItem") : t("nsMeetings.addAgendaItem")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Source language selector */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.sourceLanguage")}</label>
                <select
                  value={agendaSourceLang}
                  onChange={(e) => {
                    const l = e.target.value as SupportedLang;
                    setAgendaSourceLang(l);
                    setAgendaLangTab(l);
                    setAgendaStatusRu(l === "ru" ? "original" : agendaStatusRu === "original" ? "reviewed" : agendaStatusRu);
                    setAgendaStatusUz(l === "uz" ? "original" : agendaStatusUz === "original" ? "reviewed" : agendaStatusUz);
                    setAgendaStatusEn(l === "en" ? "original" : agendaStatusEn === "original" ? "reviewed" : agendaStatusEn);
                  }}
                  style={inputStyle}
                >
                  <option value="ru">Русский</option>
                  <option value="uz">Ўзбекча</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Language tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB" }}>
                {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => {
                  const status = lang === "ru" ? agendaStatusRu : lang === "uz" ? agendaStatusUz : agendaStatusEn;
                  const isSource = lang === agendaSourceLang;
                  const isActive = lang === agendaLangTab;
                  const titleVal = lang === "ru" ? agendaTitleRu : lang === "uz" ? agendaTitleUz : agendaTitleEn;
                  const isEmpty = titleVal.trim() === "";
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setAgendaLangTab(lang)}
                      style={{
                        padding: "6px 16px", fontSize: 13, cursor: "pointer",
                        borderBottom: isActive ? "2px solid #3B82F6" : "2px solid transparent",
                        background: "none", fontWeight: isActive ? 600 : 400,
                        color: isActive ? "#3B82F6" : "#6B7280",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {lang.toUpperCase()}
                      {isSource && <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", borderRadius: 4, padding: "1px 5px" }}>src</span>}
                      {!isSource && isEmpty && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D1D5DB", display: "inline-block" }} />}
                      {!isSource && !isEmpty && <span style={getStatusBadgeStyle(status)}>{status === "auto_translated" ? "✦" : "✓"}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Title field */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.agendaTitle")}</label>
                {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => (
                  agendaLangTab === lang && (
                    <input
                      key={lang}
                      value={lang === "ru" ? agendaTitleRu : lang === "uz" ? agendaTitleUz : agendaTitleEn}
                      onChange={(e) => handleAgendaTitleChange(e.target.value, lang)}
                      placeholder={lang === agendaSourceLang ? t("nsMeetings.agendaTitle") : t("nsMeetings.translationPlaceholder")}
                      style={inputStyle}
                    />
                  )
                ))}
              </div>

              {/* Presenter/Speaker field */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.speakerPlaceholder")}</label>
                {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => (
                  agendaLangTab === lang && (
                    <input
                      key={lang}
                      value={lang === "ru" ? agendaPresenterRu : lang === "uz" ? agendaPresenterUz : agendaPresenterEn}
                      onChange={(e) => handleAgendaPresenterChange(e.target.value, lang)}
                      placeholder={lang === agendaSourceLang ? t("nsMeetings.speakerPlaceholder") : t("nsMeetings.translationPlaceholder")}
                      style={inputStyle}
                    />
                  )
                ))}
              </div>

              {/* Generate translations button */}
              <button
                type="button"
                onClick={handleGenerateAgendaTranslations}
                disabled={agendaTranslating || !getAgendaSourceTitle().trim()}
                style={{
                  ...smallBtnStyle,
                  opacity: agendaTranslating || !getAgendaSourceTitle().trim() ? 0.5 : 1,
                  fontSize: 13, display: "flex", alignItems: "center", gap: 6,
                }}
              >
                ✦ {agendaTranslating ? t("nsMeetings.generating") : t("nsMeetings.generateTranslations")}
              </button>
              {!agendaTranslating && !agendaTranslationError && (
                <p style={{ fontSize: 11, color: "#7C3AED", margin: "-4px 0 0" }}>
                  {t("nsMeetings.translationProviderNote")}
                </p>
              )}
              {agendaTranslationError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: "-4px 0 0", background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {agendaTranslationError}
                </p>
              )}

              {/* Save error */}
              {agendaSaveError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0, background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {agendaSaveError}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setAgendaSaveError(""); handleSaveAgendaItem(); }}
                  disabled={agendaSaving || !getAgendaSourceTitle().trim()}
                  style={{ ...primaryBtnStyle, opacity: agendaSaving || !getAgendaSourceTitle().trim() ? 0.5 : 1 }}
                >
                  {agendaSaving ? t("common.saving") : t("nsMeetings.save")}
                </button>
                <button onClick={() => setShowAgendaModal(false)} style={smallBtnStyle}>
                  {t("nsMeetings.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Create/Edit Meeting Modal ===== */}
      {showMeetingForm && (
        <div style={overlayStyle} onClick={() => setShowMeetingForm(false)}>
          <div style={{ ...modalStyle, maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>
              {editingMeeting ? t("nsMeetings.editMeeting") : t("nsMeetings.createMeeting")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Source language selector */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.sourceLanguage")}</label>
                <select
                  value={formSourceLang}
                  onChange={(e) => {
                    const l = e.target.value as SupportedLang;
                    setFormSourceLang(l);
                    setFormLangTab(l);
                    setFormStatusRu(l === "ru" ? "original" : formStatusRu === "original" ? "reviewed" : formStatusRu);
                    setFormStatusUz(l === "uz" ? "original" : formStatusUz === "original" ? "reviewed" : formStatusUz);
                    setFormStatusEn(l === "en" ? "original" : formStatusEn === "original" ? "reviewed" : formStatusEn);
                  }}
                  style={inputStyle}
                >
                  <option value="ru">Русский</option>
                  <option value="uz">Ўзбекча</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Language tabs for title */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingTitle")}</label>
                {/* Tab buttons */}
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", marginBottom: 8 }}>
                  {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => {
                    const status = lang === "ru" ? formStatusRu : lang === "uz" ? formStatusUz : formStatusEn;
                    const isSource = lang === formSourceLang;
                    const isActive = lang === formLangTab;
                    const isEmpty = (lang === "ru" ? formTitleRu : lang === "uz" ? formTitleUz : formTitleEn).trim() === "";
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setFormLangTab(lang)}
                        style={{
                          padding: "6px 16px", fontSize: 13, cursor: "pointer",
                          borderBottom: isActive ? "2px solid #3B82F6" : "2px solid transparent",
                          background: "none", fontWeight: isActive ? 600 : 400,
                          color: isActive ? "#3B82F6" : "#6B7280",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        {lang.toUpperCase()}
                        {isSource && <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", borderRadius: 4, padding: "1px 5px" }}>src</span>}
                        {!isSource && isEmpty && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D1D5DB", display: "inline-block" }} />}
                        {!isSource && !isEmpty && <span style={getStatusBadgeStyle(status)}>{status === "auto_translated" ? "✦" : "✓"}</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Active tab input */}
                {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => (
                  formLangTab === lang && (
                    <input
                      key={lang}
                      value={lang === "ru" ? formTitleRu : lang === "uz" ? formTitleUz : formTitleEn}
                      onChange={(e) => handleSourceTitleChange(e.target.value, lang)}
                      placeholder={lang === formSourceLang ? t("nsMeetings.meetingTitle") : t("nsMeetings.translationPlaceholder")}
                      style={inputStyle}
                    />
                  )
                ))}
              </div>

              {/* Stale translation warning */}
              {translationStale && (
                <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#92400E" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠ {t("nsMeetings.translationStale")}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={handleGenerateTranslations} disabled={translating}
                      style={{ ...primaryBtnSmallStyle, fontSize: 12 }}>
                      {translating ? t("nsMeetings.generating") : t("nsMeetings.regenerateTranslations")}
                    </button>
                    <button type="button" onClick={() => setTranslationStale(false)}
                      style={{ ...smallBtnStyle, fontSize: 12 }}>
                      {t("nsMeetings.keepTranslations")}
                    </button>
                  </div>
                </div>
              )}

              {/* Generate translations button */}
              <button
                type="button"
                onClick={handleGenerateTranslations}
                disabled={translating || !getSourceTitle().trim()}
                style={{
                  ...smallBtnStyle,
                  opacity: translating || !getSourceTitle().trim() ? 0.5 : 1,
                  fontSize: 13, display: "flex", alignItems: "center", gap: 6,
                }}
              >
                ✦ {translating ? t("nsMeetings.generating") : t("nsMeetings.generateTranslations")}
              </button>
              {!translating && !translationError && (
                <p style={{ fontSize: 11, color: "#7C3AED", margin: "-4px 0 0" }}>
                  {t("nsMeetings.translationProviderNote")}
                </p>
              )}
              {translationError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: "-4px 0 0", background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {translationError}
                </p>
              )}

              {/* Date */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingDate")}</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inputStyle} />
              </div>

              {/* Status */}
              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingStatus")}</label>
                <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} style={inputStyle}>
                  <option value="draft">{t("nsMeetings.statusDraft")}</option>
                  <option value="scheduled">{t("nsMeetings.statusScheduled")}</option>
                  <option value="completed">{t("nsMeetings.statusCompleted")}</option>
                </select>
              </div>

              {/* Save error */}
              {saveError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0, background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {saveError}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setSaveError(""); handleSaveMeeting(); }}
                  disabled={saving || !getSourceTitle().trim() || !formDate}
                  style={{ ...primaryBtnStyle, opacity: saving || !getSourceTitle().trim() || !formDate ? 0.5 : 1 }}
                >
                  {saving ? t("common.saving") : t("nsMeetings.save")}
                </button>
                <button onClick={() => setShowMeetingForm(false)} style={smallBtnStyle}>
                  {t("nsMeetings.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Toast notification ===== */}
      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "#1F2937", color: "#FFFFFF",
          padding: "10px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 9999, pointerEvents: "none",
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ---------- Styles ----------

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 24,
};

const meetingCardStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  borderRadius: 10,
  border: "2px solid #E5E7EB",
  background: "#FFFFFF",
  cursor: "pointer",
  transition: "all 0.15s",
  width: "100%",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
};

const primaryBtnSmallStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#374151",
  cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#DC2626",
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const uploadBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  background: "#F9FAFB",
  color: "#374151",
  cursor: "pointer",
};

const downloadBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid #DBEAFE",
  background: "#EFF6FF",
  color: "#1E40AF",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const agendaItemStyle: React.CSSProperties = {
  padding: 16,
  background: "#F9FAFB",
  borderRadius: 10,
  border: "1px solid #F3F4F6",
};

const materialCardStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  marginBottom: 6,
};

const inlineFormStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 16,
  background: "#F9FAFB",
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6B7280",
  fontWeight: 500,
  display: "block",
  marginBottom: 4,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 14,
  padding: 28,
  width: 440,
  maxWidth: "90vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const aiBriefBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid #DDD6FE",
  background: "#F5F3FF",
  color: "#7C3AED",
  cursor: "pointer",
};

const briefBlockStyle: React.CSSProperties = {
  padding: 16,
  background: "#FAFAFE",
  borderRadius: 10,
  border: "1px solid #E9E5F5",
};

const briefActionBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid #DDD6FE",
  background: "#FFFFFF",
  color: "#7C3AED",
  cursor: "pointer",
};

// ─── Voting styles ────────────────────────────────────────────────────────────

const activateVotingBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  border: "1px solid #BFDBFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function getVotingStatusBadgeStyle(status: string): React.CSSProperties {
  if (status === "open") return { padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#D1FAE5", color: "#065F46" };
  if (status === "closed") return { padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#F3F4F6", color: "#6B7280" };
  return { padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#FEF9C3", color: "#92400E" };
}

function getVoteButtonStyle(choice: "for" | "against" | "abstain", selected: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 7,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };
  if (selected) {
    if (choice === "for") return { ...base, background: "#059669", color: "#FFFFFF", border: "1px solid #059669" };
    if (choice === "against") return { ...base, background: "#DC2626", color: "#FFFFFF", border: "1px solid #DC2626" };
    return { ...base, background: "#6B7280", color: "#FFFFFF", border: "1px solid #6B7280" };
  }
  return { ...base, background: "#FFFFFF", color: "#374151", border: "1px solid #D1D5DB" };
}

// ========== Client-side DOCX builder ==========

const DOCX_TITLES: Record<string, string> = {
  ru: "AI-Brief по вопросу повестки дня",
  uz_cyrl: "Кун тартиби масаласи бўйича AI-Brief",
  en: "AI-Brief for Agenda Item",
};

const DOCX_PRESENTER: Record<string, string> = {
  ru: "Докладчик",
  uz_cyrl: "Маърузачи",
  en: "Presenter",
};

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildDocxBlob(agendaTitle: string, presenter: string, briefText: string, lang: string): Blob {
  let body = "";
  body += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escXml(DOCX_TITLES[lang] || DOCX_TITLES.ru)}</w:t></w:r></w:p>`;
  body += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escXml(agendaTitle)}</w:t></w:r></w:p>`;
  if (presenter) {
    body += `<w:p><w:r><w:rPr><w:i/><w:sz w:val="24"/></w:rPr><w:t>${escXml((DOCX_PRESENTER[lang] || DOCX_PRESENTER.ru) + ": " + presenter)}</w:t></w:r></w:p>`;
  }
  body += `<w:p/>`;
  for (const line of briefText.split("\n")) {
    if (!line.trim()) { body += `<w:p/>`; }
    else { body += `<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`; }
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  const enc = new TextEncoder();
  const zipBytes = buildZipClient([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRels) },
    { name: "word/document.xml", data: enc.encode(docXml) },
  ]);
  return new Blob([zipBytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZipClient(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const cds: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const nb = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true); lv.setUint16(26, nb.length, true);
    lv.setUint16(28, 0, true); lh.set(nb, 30);
    const cd = new Uint8Array(46 + nb.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true); cv.setUint16(28, nb.length, true);
    cv.setUint32(42, off, true); cd.set(nb, 46);
    parts.push(lh, f.data); cds.push(cd);
    off += lh.length + f.data.length;
  }
  const cdOff = off;
  let cdSz = 0;
  for (const c of cds) { parts.push(c); cdSz += c.length; }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSz, true); ev.setUint32(16, cdOff, true);
  parts.push(eocd);
  const tot = parts.reduce((s, p) => s + p.length, 0);
  const res = new Uint8Array(tot);
  let p = 0;
  for (const b of parts) { res.set(b, p); p += b.length; }
  return res;
}
