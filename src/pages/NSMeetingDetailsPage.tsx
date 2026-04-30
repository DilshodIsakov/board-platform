import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import { getLocalizedName } from "../lib/profile";
import {
  fetchNSMeetingById,
  updateNSMeeting,
  deleteNSMeeting,
  fetchAgendaItems,
  createAgendaItem,
  updateAgendaItem,
  deleteAgendaItem,
  fetchMaterialsByAgenda,
  fetchMaterialsByMeeting,
  uploadMaterial,
  deleteMaterial,
  getMaterialUrl,
  formatFileSize,
  getFileTypeLabel,
  fetchBriefsForMeeting,
  generateBrief,
  updateMeetingVideoConference,
  activateMeetingVideoConference,
  deactivateMeetingVideoConference,
  type NSMeeting,
  type AgendaItem,
  type Material,
  type MaterialLang,
  type AgendaBrief,
  type BriefLang,
} from "../lib/nsMeetings";
import { getLocalizedField, isTranslationStale, getStatusBadgeStyle } from "../lib/i18nHelpers";
import {
  fetchCommentsByAgendaItems,
  addComment,
  editComment,
  softDeleteComment,
  type AgendaItemComment,
} from "../lib/agendaComments";
import { downloadFileByUrl } from "../lib/format";
import { supabase } from "../lib/supabaseClient";
import { logAuditEvent } from "../lib/auditLog";
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

export default function NSMeetingDetailsPage({ profile, org }: Props) {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [meeting, setMeeting] = useState<NSMeeting | null>(null);
  const [loading, setLoading] = useState(true);

  // Meeting edit form
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
  const [agendaAiBriefEnabled, setAgendaAiBriefEnabled] = useState(true);
  const [agendaSaving, setAgendaSaving] = useState(false);

  // Materials
  const [materialsMap, setMaterialsMap] = useState<Record<string, Material[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [protocolDoc, setProtocolDoc] = useState<Material | null>(null);
  const protocolInputRef = useRef<HTMLInputElement | null>(null);
  const [agendaDoc, setAgendaDoc] = useState<Material | null>(null);
  const agendaDocInputRef = useRef<HTMLInputElement | null>(null);

  // Archive download
  const [archiveBuilding, setArchiveBuilding] = useState(false);

  // Voting
  const [votingsMap, setVotingsMap] = useState<Record<string, Voting>>({});
  const [myVotesMap, setMyVotesMap] = useState<Record<string, Vote>>({});
  const [meetingSignature, setMeetingSignature] = useState<MeetingVoteSignature | null>(null);
  const [voterProfiles, setVoterProfiles] = useState<Record<string, { full_name: string; full_name_en?: string | null; full_name_uz?: string | null }>>({});
  const [signingInProgress, setSigningInProgress] = useState(false);
  const [signError, setSignError] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  // AI Briefs
  const [briefsMap, setBriefsMap] = useState<Record<string, AgendaBrief>>({});
  const [briefLoading, setBriefLoading] = useState<Record<string, boolean>>({});
  const [briefError, setBriefError] = useState<Record<string, string>>({});
  const [briefCopied, setBriefCopied] = useState<Record<string, boolean>>({});
  const [briefLang, setBriefLang] = useState<Record<string, BriefLang>>({});
  const [briefExpanded, setBriefExpanded] = useState<Record<string, boolean>>({});

  // Discussion / Comments
  const [commentsMap, setCommentsMap] = useState<Record<string, AgendaItemComment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | null>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [commentSending, setCommentSending] = useState<Record<string, boolean>>({});
  const [discussionAgendaId, setDiscussionAgendaId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [userAvatars, setUserAvatars] = useState<Record<string, string | null>>({});

  const LANG_OPTIONS: { value: BriefLang; label: string }[] = [
    { value: "ru", label: "Русский" },
    { value: "uz_cyrl", label: "Ўзбекча (кириллица)" },
    { value: "en", label: "English" },
  ];

  const briefKey = (agendaId: string, lang: BriefLang) => `${agendaId}_${lang}`;
  const getCurrentLang = (agendaId: string): BriefLang => briefLang[agendaId] || "ru";

  // Video conference form state
  const [showVcForm, setShowVcForm] = useState(false);
  const [vcFormUrl, setVcFormUrl] = useState("");
  const [vcFormProvider, setVcFormProvider] = useState("google_meet");
  const [vcFormTitle, setVcFormTitle] = useState("");
  const [vcFormNotes, setVcFormNotes] = useState("");
  const [vcSaving, setVcSaving] = useState(false);
  const [vcError, setVcError] = useState("");

  useEffect(() => {
    if (!profile || !id) { setLoading(false); return; }
    loadMeeting();
    loadAgenda(id);
  }, [profile?.id, id]);

  const loadMeeting = async () => {
    if (!id) return;
    setLoading(true);
    const data = await fetchNSMeetingById(id);
    setMeeting(data);
    if (data) {
      logAuditEvent({ actionType: "meeting_view", actionLabel: "Просмотр заседания", entityType: "meeting", entityId: data.id, entityTitle: data.title, meetingId: data.id });
    }
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

    // Load voter profiles for displaying who voted
    const allVoterIds = new Set<string>();
    for (const v of votings) {
      for (const vote of v.votes || []) allVoterIds.add(vote.voter_id);
    }
    if (allVoterIds.size > 0) {
      const { data: vpData } = await supabase
        .from("profiles")
        .select("id, full_name, full_name_en, full_name_uz")
        .in("id", Array.from(allVoterIds));
      if (vpData) {
        const vpMap: Record<string, { full_name: string; full_name_en?: string | null; full_name_uz?: string | null }> = {};
        for (const p of vpData) vpMap[p.id] = p;
        setVoterProfiles(vpMap);
      }
    }

    const sig = await fetchMeetingSignature(meetingId, profile.id);
    setMeetingSignature(sig);
  };

  const loadAgenda = async (meetingId: string) => {
    const items = await fetchAgendaItems(meetingId);
    setAgendaItems(items);
    const mMap: Record<string, Material[]> = {};
    await Promise.all(
      items.map(async (item) => {
        mMap[item.id] = await fetchMaterialsByAgenda(item.id);
      })
    );
    setMaterialsMap(mMap);
    const meetingDocs = await fetchMaterialsByMeeting(meetingId);
    const meetingLevel = meetingDocs.filter((d) => !d.agenda_item_id);
    setAgendaDoc(meetingLevel.find((d) => d.doc_type === "agenda" || d.title === "__agenda__") || null);
    setProtocolDoc(meetingLevel.find((d) => d.title !== "__agenda__" && d.doc_type !== "agenda") || null);
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
    await loadVotingData(items, meetingId);
    // Load comments
    if (items.length > 0) {
      const cMap = await fetchCommentsByAgendaItems(items.map((i) => i.id));
      setCommentsMap(cMap);
      // Load avatars for comment authors
      const allUserIds = new Set<string>();
      for (const comments of Object.values(cMap)) {
        for (const c of comments) allUserIds.add(c.user_id);
      }
      if (allUserIds.size > 0) {
        const { data: avatarData } = await supabase
          .from("profiles")
          .select("id, avatar_url")
          .in("id", Array.from(allUserIds));
        if (avatarData) {
          const aMap: Record<string, string | null> = {};
          for (const p of avatarData) aMap[p.id] = p.avatar_url;
          setUserAvatars(aMap);
        }
      }
    }
  };

  // ---------- Discussion / Comments ----------

  const canWriteComment = profile && ["admin", "corp_secretary", "board_member", "chairman"].includes(profile.role);
  const canVote = profile && ["board_member", "chairman"].includes(profile.role);
  const isMeetingCompleted = meeting?.status === "completed";

  const handleAddComment = async (agendaItemId: string, parentId?: string | null) => {
    if (!profile || !meeting) return;
    const text = parentId ? (replyText[agendaItemId] || "").trim() : (commentText[agendaItemId] || "").trim();
    if (!text) return;

    setCommentSending((p) => ({ ...p, [agendaItemId]: true }));
    const result = await addComment({
      meeting_id: meeting.id,
      agenda_item_id: agendaItemId,
      user_id: profile.id,
      user_name: profile.full_name || profile.email,
      user_role: profile.role,
      parent_comment_id: parentId || null,
      content: text,
    });
    setCommentSending((p) => ({ ...p, [agendaItemId]: false }));

    if (result) {
      setCommentsMap((prev) => ({
        ...prev,
        [agendaItemId]: [...(prev[agendaItemId] || []), result],
      }));
      logAuditEvent({ actionType: "comment_add", actionLabel: "Добавление комментария", entityType: "comment", entityId: result.id, meetingId: meeting?.id, agendaItemId });
      if (parentId) {
        setReplyText((p) => ({ ...p, [agendaItemId]: "" }));
        setReplyTo((p) => ({ ...p, [agendaItemId]: null }));
      } else {
        setCommentText((p) => ({ ...p, [agendaItemId]: "" }));
      }
    }
  };

  const handleDeleteComment = async (agendaItemId: string, commentId: string) => {
    const ok = await softDeleteComment(commentId);
    if (ok) {
      setCommentsMap((prev) => ({
        ...prev,
        [agendaItemId]: (prev[agendaItemId] || []).map((c) =>
          c.id === commentId ? { ...c, is_deleted: true, content: "" } : c
        ),
      }));
      logAuditEvent({ actionType: "comment_delete", actionLabel: "Удаление комментария", entityType: "comment", entityId: commentId, meetingId: meeting?.id, agendaItemId });
    }
  };

  const handleEditComment = async (agendaItemId: string, commentId: string) => {
    const text = editingCommentText.trim();
    if (!text) return;
    const result = await editComment(commentId, text);
    if (result) {
      setCommentsMap((prev) => ({
        ...prev,
        [agendaItemId]: (prev[agendaItemId] || []).map((c) =>
          c.id === commentId ? { ...c, content: result.content, updated_at: result.updated_at } : c
        ),
      }));
      logAuditEvent({ actionType: "comment_edit", actionLabel: "Редактирование комментария", entityType: "comment", entityId: commentId, meetingId: meeting?.id, agendaItemId });
      setEditingCommentId(null);
      setEditingCommentText("");
    }
  };

  const isEdited = (c: AgendaItemComment) =>
    !c.is_deleted && c.updated_at && c.created_at && c.updated_at !== c.created_at &&
    new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 2000;

  // ---------- Meeting Edit ----------

  const getSourceTitle = (src: SupportedLang = formSourceLang) =>
    src === "ru" ? formTitleRu : src === "uz" ? formTitleUz : formTitleEn;

  const openEditForm = () => {
    if (!meeting) return;
    const src = (meeting.source_language || "ru") as SupportedLang;
    setEditingMeeting(meeting);
    setFormSourceLang(src);
    setFormLangTab(src);
    setFormTitleRu(meeting.title_ru || meeting.title || "");
    setFormTitleUz(meeting.title_uz || "");
    setFormTitleEn(meeting.title_en || "");
    setFormStatusRu((meeting.translation_status_ru || "original") as TranslationStatus);
    setFormStatusUz((meeting.translation_status_uz || "missing") as TranslationStatus);
    setFormStatusEn((meeting.translation_status_en || "missing") as TranslationStatus);
    setFormDate(meeting.start_at.slice(0, 10));
    setFormStatus(meeting.status);
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
    if (!editingMeeting) return;
    const sourceText = getSourceTitle();
    if (!sourceText.trim() || !formDate) return;
    setSaving(true);

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
      await updateNSMeeting(editingMeeting.id, payload);
      setShowMeetingForm(false);
      await loadMeeting();
    } catch (e) {
      console.error(e);
      setSaveError(e instanceof Error ? e.message : t("common.saveFailed", "Не удалось сохранить. Попробуйте ещё раз."));
    }
    setSaving(false);
  };

  const handleSourceTitleChange = (val: string, lang: SupportedLang) => {
    if (lang === "ru") setFormTitleRu(val);
    else if (lang === "uz") setFormTitleUz(val);
    else setFormTitleEn(val);

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
    if (!meeting) return;
    if (!window.confirm(t("nsMeetings.confirmDelete"))) return;
    try {
      await deleteNSMeeting(meeting.id);
      navigate("/ns-meetings");
    } catch (e) {
      console.error(e);
    }
  };

  // ---------- Agenda CRUD ----------

  const getAgendaSourceTitle = () =>
    agendaSourceLang === "ru" ? agendaTitleRu : agendaSourceLang === "uz" ? agendaTitleUz : agendaTitleEn;

  const hasAnyAgendaTitle = () =>
    !!(agendaTitleRu.trim() || agendaTitleUz.trim() || agendaTitleEn.trim());

  const openCreateAgendaForm = () => {
    setEditingAgendaItem(null);
    setAgendaSourceLang("ru");
    setAgendaLangTab("ru");
    setAgendaTitleRu(""); setAgendaTitleUz(""); setAgendaTitleEn("");
    setAgendaPresenterRu(""); setAgendaPresenterUz(""); setAgendaPresenterEn("");
    setAgendaStatusRu("original"); setAgendaStatusUz("missing"); setAgendaStatusEn("missing");
    setAgendaAiBriefEnabled(true);
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
    setAgendaAiBriefEnabled(item.ai_brief_enabled !== false);
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
    if (!hasAnyAgendaTitle() || !meeting || !org || !profile) return;
    setAgendaSaving(true);
    setAgendaSaveError("");

    const resolveStatus = (lang: SupportedLang, status: TranslationStatus): TranslationStatus => {
      if (lang === agendaSourceLang) return status;
      const titleVal = lang === "ru" ? agendaTitleRu : lang === "uz" ? agendaTitleUz : agendaTitleEn;
      const presVal = lang === "ru" ? agendaPresenterRu : lang === "uz" ? agendaPresenterUz : agendaPresenterEn;
      if (status === "missing" && (titleVal.trim() || presVal.trim())) return "reviewed";
      return status;
    };

    const sourceTitle = getAgendaSourceTitle().trim() || agendaTitleRu.trim() || agendaTitleUz.trim() || agendaTitleEn.trim();
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
      ai_brief_enabled: agendaAiBriefEnabled,
    };

    try {
      if (editingAgendaItem) {
        await updateAgendaItem(editingAgendaItem.id, payload);
      } else {
        await createAgendaItem(meeting.id, org.id, agendaItems.length + 1, payload);
      }
      setShowAgendaModal(false);
      await loadAgenda(meeting.id);
    } catch (e) {
      setAgendaSaveError(e instanceof Error ? e.message : t("common.saveFailed", "Не удалось сохранить. Попробуйте ещё раз."));
    }
    setAgendaSaving(false);
  };

  const handleDeleteAgenda = async (itemId: string) => {
    try {
      await deleteAgendaItem(itemId);
      if (meeting) await loadAgenda(meeting.id);
    } catch (e) {
      console.error(e);
    }
  };

  // ---------- Materials ----------

  const handleUploadFile = async (agendaItemId: string, file: File, language?: MaterialLang) => {
    if (!org || !profile || !meeting) return;
    try {
      await uploadMaterial(file, org.id, profile.id, meeting.id, agendaItemId, file.name, language);
      await loadAgenda(meeting.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMaterial = async (mat: Material) => {
    try {
      await deleteMaterial(mat);
      if (meeting) await loadAgenda(meeting.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async (mat: Material) => {
    try {
      const url = await getMaterialUrl(mat.storage_path);
      if (url) {
        await downloadFileByUrl(url, mat.file_name);
        logAuditEvent({ actionType: "file_download", actionLabel: "Скачивание файла", entityType: "material", entityId: mat.id, entityTitle: mat.file_name, meetingId: meeting?.id });
      }
    } catch (e) {
      console.error("Download error:", e);
    }
  };

  const handleDownloadArchive = async (lang: MaterialLang) => {
    if (!meeting) return;
    setArchiveBuilding(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Collect all materials
      const agendaMats = Object.values(materialsMap).flat();
      const allMats: Material[] = [
        ...agendaMats,
        ...(protocolDoc ? [protocolDoc] : []),
      ];

      // Filter by language
      const filtered = allMats.filter((m) => m.language === lang);

      if (filtered.length === 0) {
        setArchiveBuilding(false);
        return;
      }

      // Track duplicates to avoid name collisions
      const nameCount: Record<string, number> = {};

      for (const mat of filtered) {
        const url = await getMaterialUrl(mat.storage_path);
        if (!url) continue;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const blob = await resp.blob();

        // Organise into sub-folders by language
        const folder = mat.language ? mat.language.toUpperCase() : t("nsMeetings.matLangGeneral", "Общие");
        const base = mat.file_name;
        const key = `${folder}/${base}`;
        nameCount[key] = (nameCount[key] || 0) + 1;
        const fileName = nameCount[key] > 1
          ? base.replace(/(\.[^.]+)$/, `_${nameCount[key]}$1`)
          : base;

        zip.file(`${folder}/${fileName}`, blob);
      }

      const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const rawTitle = getLocalizedField(meeting as unknown as Record<string, unknown>, "title") || meeting.title || "meeting";
      const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "-").slice(0, 50);
      const filename = `${safeTitle}_${lang.toUpperCase()}.zip`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      logAuditEvent({ actionType: "file_download", actionLabel: "Скачивание архива материалов", entityType: "meeting", entityId: meeting.id, entityTitle: rawTitle });
    } catch (e) {
      console.error("Archive download error:", e);
    }
    setArchiveBuilding(false);
  };

  // ---------- Protocol draft ----------

  const handleUploadProtocol = async (file: File) => {
    if (!org || !profile || !meeting) return;
    try {
      await uploadMaterial(file, org.id, profile.id, meeting.id, null, file.name);
      await loadAgenda(meeting.id);
    } catch (e) {
      console.error("Protocol upload error:", e);
    }
  };

  const handleDeleteProtocol = async () => {
    if (!protocolDoc || !meeting) return;
    try {
      await deleteMaterial(protocolDoc);
      await loadAgenda(meeting.id);
    } catch (e) {
      console.error("Protocol delete error:", e);
    }
  };

  const handleUploadAgendaDoc = async (file: File) => {
    if (!org || !profile || !meeting) return;
    try {
      if (agendaDoc) await deleteMaterial(agendaDoc); // replace existing
      // title "__agenda__" is used as a marker to identify this as the agenda doc
      // (avoids requiring a DB migration for a new column)
      await uploadMaterial(file, org.id, profile.id, meeting.id, null, "__agenda__", undefined);
      await loadAgenda(meeting.id);
    } catch (e) {
      console.error("Agenda doc upload error:", e);
    }
  };

  const handleDeleteAgendaDoc = async () => {
    if (!agendaDoc || !meeting) return;
    try {
      await deleteMaterial(agendaDoc);
      await loadAgenda(meeting.id);
    } catch (e) {
      console.error("Agenda doc delete error:", e);
    }
  };

  const handleDownloadAgendaDoc = async () => {
    if (!agendaDoc) return;
    try {
      const url = await getMaterialUrl(agendaDoc.storage_path);
      if (url) {
        await downloadFileByUrl(url, agendaDoc.file_name);
        logAuditEvent({ actionType: "file_download", actionLabel: "Скачивание повестки дня", entityType: "material", entityId: agendaDoc.id, entityTitle: agendaDoc.file_name, meetingId: meeting?.id });
      }
    } catch (e) {
      console.error("Agenda doc download error:", e);
    }
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
      setBriefExpanded((prev) => ({ ...prev, [agendaId]: true }));
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

  // ---------- Voting ----------

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const handleActivateAllVoting = async () => {
    if (!org || !profile || !meeting) return;
    if (!window.confirm(t("nsVoting.activateConfirm"))) return;
    try {
      for (const item of agendaItems) {
        const existing = votingsMap[item.id];
        if (existing && (existing.status === "open" || existing.status === "closed")) continue;
        const title = getLocalizedField(item as unknown as Record<string, unknown>, "title") || item.title;
        if (existing && existing.status === "draft") {
          await activateVoting(existing.id, profile.id);
        } else if (!existing) {
          await createAndActivateVoting(item.id, org.id, profile.id, title);
        }
      }
      await loadVotingData(agendaItems, meeting.id);
      logAuditEvent({ actionType: "voting_activate", actionLabel: "Активация голосования", entityType: "voting", meetingId: meeting.id, entityTitle: meeting.title });
      showToast(t("nsVoting.activateSuccess"));
    } catch (e) {
      console.error("handleActivateAllVoting error:", e);
    }
  };

  const handleCloseVoting = async (votingId: string) => {
    if (!window.confirm(t("nsVoting.closeConfirm"))) return;
    try {
      await closeVotingItem(votingId);
      if (meeting) await loadVotingData(agendaItems, meeting.id);
      logAuditEvent({ actionType: "voting_close", actionLabel: "Завершение голосования", entityType: "voting", entityId: votingId, meetingId: meeting?.id });
      showToast(t("nsVoting.closeSuccess"));
    } catch (e) {
      console.error("handleCloseVoting error:", e);
    }
  };

  const handleCastVote = async (votingId: string, choice: "for" | "against" | "abstain") => {
    if (!org || !profile || !meeting) return;
    try {
      await castVote(votingId, org.id, profile.id, choice);
      await loadVotingData(agendaItems, meeting.id);
      logAuditEvent({ actionType: "vote_cast", actionLabel: "Голосование", entityType: "vote", entityId: votingId, meetingId: meeting.id, metadata: { choice } });
      showToast(t("nsVoting.voteSaved"));
    } catch (e: unknown) {
      console.error("handleCastVote error:", e);
      showToast((e instanceof Error ? e.message : String(e)) || t("common.error"));
    }
  };

  const handleSignVotes = async () => {
    if (!meeting || !profile || !org) return;
    if (!window.confirm(t("nsVoting.signConfirm"))) return;
    setSigningInProgress(true);
    setSignError("");
    try {
      await signMeetingVotes(meeting.id, profile.id, org.id);
      await loadVotingData(agendaItems, meeting.id);
      logAuditEvent({ actionType: "vote_sign", actionLabel: "Подписание результатов голосования", entityType: "voting", meetingId: meeting.id, entityTitle: meeting.title });
      showToast(t("nsVoting.signSuccess"));
    } catch (e) {
      setSignError(e instanceof Error ? e.message : t("nsVoting.signError"));
    }
    setSigningInProgress(false);
  };

  // ---------- Video Conference ----------

  const openVcForm = () => {
    setVcFormUrl(meeting?.video_conference_url || "");
    setVcFormProvider(meeting?.video_conference_provider || "google_meet");
    setVcFormTitle(meeting?.video_conference_title || "");
    setVcFormNotes(meeting?.video_conference_notes || "");
    setVcError("");
    setShowVcForm(true);
  };

  const handleSaveVc = async () => {
    if (!meeting) return;
    const url = vcFormUrl.trim();
    if (!url) { setVcError(t("nsVideoConf.urlRequired")); return; }
    if (!url.startsWith("https://")) { setVcError(t("nsVideoConf.urlInvalid")); return; }
    setVcSaving(true);
    try {
      await updateMeetingVideoConference(meeting.id, {
        video_conference_url: url,
        video_conference_provider: vcFormProvider || null,
        video_conference_title: vcFormTitle.trim() || null,
        video_conference_notes: vcFormNotes.trim() || null,
      });
      await loadMeeting();
      setShowVcForm(false);
      showToast(t("nsVideoConf.savedSuccess"));
    } catch (e) {
      setVcError(e instanceof Error ? e.message : t("common.error"));
    }
    setVcSaving(false);
  };

  const handleActivateVc = async () => {
    if (!meeting || !profile) return;
    if (!window.confirm(t("nsVideoConf.activateConfirm"))) return;
    try {
      await activateMeetingVideoConference(meeting.id, profile.id);
      await loadMeeting();
      logAuditEvent({ actionType: "video_conf_create", actionLabel: "Активация видеоконференции", entityType: "video_conference", meetingId: meeting.id, entityTitle: meeting.title });
      showToast(t("nsVideoConf.activatedSuccess"));
    } catch (e) {
      console.error("handleActivateVc error:", e);
      showToast((e instanceof Error ? e.message : String(e)) || t("common.error"));
    }
  };

  const handleDeactivateVc = async () => {
    if (!meeting) return;
    if (!window.confirm(t("nsVideoConf.deactivateConfirm"))) return;
    try {
      await deactivateMeetingVideoConference(meeting.id);
      await loadMeeting();
      showToast(t("nsVideoConf.deactivatedSuccess"));
    } catch (e) {
      console.error("handleDeactivateVc error:", e);
      showToast((e instanceof Error ? e.message : String(e)) || t("common.error"));
    }
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

  const fileTypeIcon = (mime: string, fileName?: string) => {
    const label = getFileTypeLabel(mime, fileName);
    const colors: Record<string, string> = { PDF: "#DC2626", Word: "#2563EB", Excel: "#16A34A", PowerPoint: "#EA580C", ZIP: "#7C3AED", RAR: "#7C3AED", "7Z": "#7C3AED" };
    return { label, color: colors[label] || "#6B7280" };
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  }

  if (!meeting) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "#9CA3AF" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#374151", marginBottom: 8 }}>
          {t("nsMeetings.noMeetingSelected")}
        </div>
        <button onClick={() => navigate("/ns-meetings")} style={smallBtnStyle}>
          ← {t("nsMeetings.backToList")}
        </button>
      </div>
    );
  }

  // ── Full-page Discussion View ──
  if (discussionAgendaId && meeting) {
    const dItem = agendaItems.find((a) => a.id === discussionAgendaId);
    const dTitle = dItem
      ? getLocalizedField(dItem as unknown as Record<string, unknown>, "title") || dItem.title || ""
      : "";
    const meetingTitle = getLocalizedField(meeting as unknown as Record<string, unknown>, "title") || meeting.title || "";
    const allComments = commentsMap[discussionAgendaId] || [];
    const rootComments = allComments.filter((c) => !c.parent_comment_id);
    const repliesOf = (parentId: string) => allComments.filter((c) => c.parent_comment_id === parentId);
    const commentCount = allComments.filter((c) => !c.is_deleted).length;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - var(--header-height))" }}>
        {/* Header */}
        <div style={{
          background: "#FFFFFF", borderBottom: "1px solid #E5E7EB",
          padding: "16px 32px", flexShrink: 0,
        }}>
          <button
            onClick={() => setDiscussionAgendaId(null)}
            style={{ ...smallBtnStyle, marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {"\u2190"} {t("nsMeetings.backToMeeting") || meetingTitle}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
              {t("nsMeetings.discussion")}
            </div>
            {commentCount > 0 && (
              <span style={{
                background: "#EFF6FF", color: "#2563EB", fontSize: 13, fontWeight: 600,
                borderRadius: 12, padding: "2px 10px",
              }}>{commentCount}</span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{dTitle}</div>
          {isMeetingCompleted && (
            <div style={{
              marginTop: 8, padding: "6px 14px", background: "#FEF3C7", borderRadius: 8,
              fontSize: 13, color: "#92400E", display: "inline-block",
            }}>
              {t("nsMeetings.discussionClosed")}
            </div>
          )}
        </div>

        {/* Comments list — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
          {rootComments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{"\uD83D\uDCAC"}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#6B7280" }}>{t("nsMeetings.noComments")}</div>
              {canWriteComment && !isMeetingCompleted && (
                <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>{t("nsMeetings.addComment")}</div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 800 }}>
              {rootComments.map((comment) => (
                <div key={comment.id} style={{ marginBottom: 20 }}>
                  {comment.is_deleted ? (
                    <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic", padding: "8px 0" }}>
                      {t("nsMeetings.commentDeleted")}
                    </div>
                  ) : (
                    <div style={{
                      background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 14,
                      padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}>
                      {/* Comment header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          {userAvatars[comment.user_id] ? (
                            <img src={userAvatars[comment.user_id]!} alt="" style={{
                              width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                            }} />
                          ) : (
                            <div style={{
                              width: 36, height: 36, borderRadius: "50%",
                              background: comment.user_role === "admin" ? "#2563EB" : comment.user_role === "chairman" ? "#D97706" : comment.user_role === "corp_secretary" ? "#7C3AED" : "#3B82F6",
                              color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 14, fontWeight: 700, flexShrink: 0,
                            }}>
                              {(comment.user_name || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{comment.user_name}</span>
                              <span style={{
                                fontSize: 11, padding: "1px 8px", borderRadius: 10,
                                background: comment.user_role === "admin" ? "#DBEAFE" : comment.user_role === "chairman" ? "#FEF3C7" : comment.user_role === "corp_secretary" ? "#EDE9FE" : "#E0E7FF",
                                color: comment.user_role === "admin" ? "#1E40AF" : comment.user_role === "chairman" ? "#92400E" : comment.user_role === "corp_secretary" ? "#6D28D9" : "#3730A3",
                                fontWeight: 500,
                              }}>
                                {t(`roles.${comment.user_role}`, comment.user_role)}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 1 }}>
                              {new Date(comment.created_at).toLocaleString(getIntlLocale(), {
                                day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          {!isMeetingCompleted && canWriteComment && (
                            <button
                              onClick={() => setReplyTo((p) => ({ ...p, [discussionAgendaId]: comment.id }))}
                              style={{ fontSize: 13, color: "#3B82F6", cursor: "pointer", background: "none", border: "none", fontWeight: 500 }}
                            >
                              {t("nsMeetings.reply")}
                            </button>
                          )}
                          {comment.user_id === profile?.id && !isMeetingCompleted && (
                            <button
                              onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }}
                              style={{ fontSize: 13, color: "#D97706", cursor: "pointer", background: "none", border: "none", fontWeight: 500 }}
                            >
                              {t("nsMeetings.editComment")}
                            </button>
                          )}
                          {(comment.user_id === profile?.id || profile?.role === "admin") && !isMeetingCompleted && (
                            <button
                              onClick={() => handleDeleteComment(discussionAgendaId, comment.id)}
                              style={{ fontSize: 13, color: "#EF4444", cursor: "pointer", background: "none", border: "none", fontWeight: 500 }}
                            >
                              {t("nsMeetings.deleteComment")}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Comment body */}
                      {editingCommentId === comment.id ? (
                        <div style={{ paddingLeft: 46, marginTop: 4 }}>
                          <textarea
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            rows={4}
                            autoFocus
                            style={{
                              width: "100%", padding: "10px 14px", fontSize: 15, border: "1px solid #D1D5DB",
                              borderRadius: 10, resize: "vertical", fontFamily: "inherit", outline: "none",
                              boxSizing: "border-box",
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.boxShadow = "none"; }}
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button
                              onClick={() => handleEditComment(discussionAgendaId, comment.id)}
                              disabled={!editingCommentText.trim()}
                              style={{
                                padding: "7px 18px", fontSize: 13, fontWeight: 500, borderRadius: 8, border: "none",
                                background: editingCommentText.trim() ? "#2563EB" : "#D1D5DB", color: "#FFF",
                                cursor: editingCommentText.trim() ? "pointer" : "default",
                              }}
                            >
                              {t("nsMeetings.saveEdit")}
                            </button>
                            <button
                              onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}
                              style={{ padding: "7px 18px", fontSize: 13, color: "#6B7280", background: "none", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer" }}
                            >
                              {t("common.cancel") || "Отмена"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ paddingLeft: 46 }}>
                          <div style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                            {comment.content}
                          </div>
                          {isEdited(comment) && (
                            <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
                              {t("nsMeetings.edited")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Replies */}
                  {repliesOf(comment.id).map((reply) => (
                    <div key={reply.id} style={{ marginLeft: 46, marginTop: 10 }}>
                      {reply.is_deleted ? (
                        <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic", padding: "6px 0" }}>
                          {t("nsMeetings.commentDeleted")}
                        </div>
                      ) : (
                        <div style={{
                          background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 12,
                          padding: "12px 16px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {userAvatars[reply.user_id] ? (
                                <img src={userAvatars[reply.user_id]!} alt="" style={{
                                  width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                                }} />
                              ) : (
                                <div style={{
                                  width: 28, height: 28, borderRadius: "50%",
                                  background: reply.user_role === "admin" ? "#2563EB" : "#6B7280",
                                  color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                                }}>
                                  {(reply.user_name || "?").charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{reply.user_name}</span>
                              <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                                {new Date(reply.created_at).toLocaleString(getIntlLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              {reply.user_id === profile?.id && !isMeetingCompleted && (
                                <button
                                  onClick={() => { setEditingCommentId(reply.id); setEditingCommentText(reply.content); }}
                                  style={{ fontSize: 11, color: "#D97706", cursor: "pointer", background: "none", border: "none", fontWeight: 500 }}
                                >
                                  {t("nsMeetings.editComment")}
                                </button>
                              )}
                              {(reply.user_id === profile?.id || profile?.role === "admin") && !isMeetingCompleted && (
                                <button
                                  onClick={() => handleDeleteComment(discussionAgendaId, reply.id)}
                                  style={{ fontSize: 11, color: "#EF4444", cursor: "pointer", background: "none", border: "none" }}
                                >
                                  {t("nsMeetings.deleteComment")}
                                </button>
                              )}
                            </div>
                          </div>
                          {editingCommentId === reply.id ? (
                            <div style={{ paddingLeft: 36, marginTop: 4 }}>
                              <textarea
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                rows={3}
                                autoFocus
                                style={{
                                  width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #D1D5DB",
                                  borderRadius: 8, resize: "vertical", fontFamily: "inherit", outline: "none",
                                  boxSizing: "border-box",
                                }}
                              />
                              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                <button
                                  onClick={() => handleEditComment(discussionAgendaId, reply.id)}
                                  disabled={!editingCommentText.trim()}
                                  style={{
                                    padding: "5px 14px", fontSize: 12, fontWeight: 500, borderRadius: 8, border: "none",
                                    background: editingCommentText.trim() ? "#2563EB" : "#D1D5DB", color: "#FFF",
                                    cursor: editingCommentText.trim() ? "pointer" : "default",
                                  }}
                                >
                                  {t("nsMeetings.saveEdit")}
                                </button>
                                <button
                                  onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}
                                  style={{ padding: "5px 14px", fontSize: 12, color: "#6B7280", background: "none", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer" }}
                                >
                                  {t("common.cancel") || "Отмена"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ paddingLeft: 36 }}>
                              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                {reply.content}
                              </div>
                              {isEdited(reply) && (
                                <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
                                  {t("nsMeetings.edited")}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Reply input */}
                  {replyTo[discussionAgendaId] === comment.id && canWriteComment && !isMeetingCompleted && (
                    <div style={{ marginLeft: 46, marginTop: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <textarea
                        value={replyText[discussionAgendaId] || ""}
                        onChange={(e) => setReplyText((p) => ({ ...p, [discussionAgendaId]: e.target.value }))}
                        placeholder={t("nsMeetings.replyPlaceholder")}
                        rows={3}
                        autoFocus
                        style={{
                          flex: 1, padding: "10px 14px", fontSize: 14, border: "1px solid #D1D5DB",
                          borderRadius: 10, resize: "vertical", fontFamily: "inherit", outline: "none",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.boxShadow = "none"; }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button
                          onClick={() => handleAddComment(discussionAgendaId, comment.id)}
                          disabled={commentSending[discussionAgendaId] || !(replyText[discussionAgendaId] || "").trim()}
                          style={{
                            padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 8, border: "none",
                            background: (replyText[discussionAgendaId] || "").trim() ? "#2563EB" : "#D1D5DB",
                            color: "#FFF", cursor: (replyText[discussionAgendaId] || "").trim() ? "pointer" : "default",
                          }}
                        >
                          {t("nsMeetings.send")}
                        </button>
                        <button
                          onClick={() => setReplyTo((p) => ({ ...p, [discussionAgendaId]: null }))}
                          style={{ padding: "6px 12px", fontSize: 12, color: "#6B7280", background: "none", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer" }}
                        >
                          {t("common.cancel") || "Отмена"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input area — fixed at bottom */}
        {!isMeetingCompleted && canWriteComment && (
          <div style={{
            padding: "16px 32px", borderTop: "1px solid #E5E7EB", background: "#FFFFFF", flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 12, maxWidth: 800, alignItems: "flex-end" }}>
              <textarea
                value={commentText[discussionAgendaId] || ""}
                onChange={(e) => setCommentText((p) => ({ ...p, [discussionAgendaId]: e.target.value }))}
                placeholder={t("nsMeetings.commentPlaceholder")}
                rows={3}
                style={{
                  flex: 1, padding: "12px 16px", fontSize: 15, border: "1px solid #D1D5DB",
                  borderRadius: 12, resize: "vertical", fontFamily: "inherit", outline: "none",
                  minHeight: 60,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.boxShadow = "none"; }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleAddComment(discussionAgendaId);
                  }
                }}
              />
              <button
                onClick={() => handleAddComment(discussionAgendaId)}
                disabled={commentSending[discussionAgendaId] || !(commentText[discussionAgendaId] || "").trim()}
                style={{
                  padding: "12px 28px", fontSize: 15, fontWeight: 600, borderRadius: 12, border: "none",
                  background: (commentText[discussionAgendaId] || "").trim() ? "#2563EB" : "#D1D5DB",
                  color: "#FFF", cursor: (commentText[discussionAgendaId] || "").trim() ? "pointer" : "default",
                  whiteSpace: "nowrap", height: 48,
                }}
              >
                {commentSending[discussionAgendaId] ? "..." : t("nsMeetings.send")}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Ctrl+Enter</div>
          </div>
        )}

        {!canWriteComment && !isMeetingCompleted && (
          <div style={{ padding: "14px 32px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA", flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: "#9CA3AF", fontStyle: "italic" }}>
              {t("nsMeetings.noWriteAccess")}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate("/ns-meetings")}
        style={{ ...smallBtnStyle, marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        ← {t("nsMeetings.backToList")}
      </button>

      <div style={panelStyle}>
        {/* Meeting Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              {getLocalizedField(meeting as unknown as Record<string, unknown>, "title")}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 14, color: "#6B7280" }}>
                {new Date(meeting.start_at).toLocaleDateString(getIntlLocale(), {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </span>
              {(() => { const sc = statusColor(meeting.status); return (
                <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.color }}>
                  {statusLabel(meeting.status)}
                </span>
              ); })()}
            </div>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={openEditForm} style={smallBtnStyle}>
                {t("nsMeetings.editMeeting")}
              </button>
              <button onClick={handleDeleteMeeting} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FECACA" }}>
                {t("nsMeetings.deleteMeeting")}
              </button>
            </div>
          )}
        </div>

        {/* Protocol Draft */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16, marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
              {t("nsMeetings.protocolDraft")}
            </span>
            {isAdmin && !protocolDoc && (
              <>
                <button onClick={() => protocolInputRef.current?.click()} style={uploadBtnStyle}>
                  + {t("nsMeetings.uploadFile")}
                </button>
                <input
                  ref={protocolInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadProtocol(f);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>

          {!protocolDoc && (
            <p style={{ color: "#D1D5DB", fontSize: 13, margin: 0 }}>
              {t("nsMeetings.noProtocol")}
            </p>
          )}

          {protocolDoc && (() => {
            const ft = fileTypeIcon(protocolDoc.mime_type, protocolDoc.file_name);
            return (
              <div style={materialCardStyle}>
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
                      {protocolDoc.file_name}
                    </div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {formatFileSize(protocolDoc.file_size)} · {new Date(protocolDoc.created_at).toLocaleDateString(getIntlLocale())}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleDownload(protocolDoc)} style={downloadBtnStyle}>
                    ↓ {t("nsMeetings.download")}
                  </button>
                  {isAdmin && (
                    <button onClick={handleDeleteProtocol} style={{ ...deleteBtnStyle, fontSize: 12 }}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Agenda Document */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16, marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
              {t("nsMeetings.agendaDocSection")}
            </span>
            {isAdmin && !agendaDoc && (
              <>
                <button onClick={() => agendaDocInputRef.current?.click()} style={uploadBtnStyle}>
                  + {t("nsMeetings.uploadFile")}
                </button>
                <input
                  ref={agendaDocInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadAgendaDoc(f);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>

          {!agendaDoc && (
            <p style={{ color: "#D1D5DB", fontSize: 13, margin: 0 }}>
              {t("nsMeetings.noAgendaDoc")}
            </p>
          )}

          {agendaDoc && (() => {
            const ft = fileTypeIcon(agendaDoc.mime_type);
            return (
              <div style={materialCardStyle}>
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
                      {agendaDoc.file_name}
                    </div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {formatFileSize(agendaDoc.file_size)} · {new Date(agendaDoc.created_at).toLocaleDateString(getIntlLocale())}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={handleDownloadAgendaDoc} style={downloadBtnStyle}>
                    ↓ {t("nsMeetings.download")}
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => agendaDocInputRef.current?.click()} style={{ ...downloadBtnStyle, color: "#6B7280" }}
                        title={t("nsMeetings.uploadAgendaDoc")}>
                        ↑
                      </button>
                      <input
                        ref={agendaDocInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadAgendaDoc(f);
                          e.target.value = "";
                        }}
                      />
                      <button onClick={handleDeleteAgendaDoc} style={{ ...deleteBtnStyle, fontSize: 12 }}>
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ===== Video Conference Block ===== */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16, marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                📹 {t("nsVideoConf.title")}
              </span>
              {!meeting.video_conference_url && (
                <span style={getVcBadgeStyle("none")}>{t("nsVideoConf.statusNotSet")}</span>
              )}
              {meeting.video_conference_url && meeting.video_conference_enabled && (
                <span style={getVcBadgeStyle("active")}>✓ {t("nsVideoConf.statusActive")}</span>
              )}
              {meeting.video_conference_url && !meeting.video_conference_enabled && (
                <span style={getVcBadgeStyle("ready")}>{t("nsVideoConf.statusReady")}</span>
              )}
              {meeting.video_conference_url && meeting.video_conference_provider && (
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {t(`nsVideoConf.provider_${meeting.video_conference_provider}`)}
                </span>
              )}
            </div>

            {isAdmin && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {!meeting.video_conference_url && (
                  <button onClick={openVcForm} style={smallBtnStyle}>
                    + {t("nsVideoConf.setup")}
                  </button>
                )}
                {meeting.video_conference_url && !meeting.video_conference_enabled && (
                  <>
                    <button onClick={openVcForm} style={smallBtnStyle}>
                      {t("nsVideoConf.edit")}
                    </button>
                    <button onClick={handleActivateVc} style={vcActivateBtnStyle}>
                      ▶ {t("nsVideoConf.activate")}
                    </button>
                  </>
                )}
                {meeting.video_conference_url && meeting.video_conference_enabled && (
                  <>
                    <button onClick={openVcForm} style={smallBtnStyle}>
                      {t("nsVideoConf.edit")}
                    </button>
                    <button onClick={handleDeactivateVc} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FECACA" }}>
                      {t("nsVideoConf.deactivate")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {showVcForm && isAdmin && (
            <div style={{ background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB", padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={labelStyle}>{t("nsVideoConf.urlLabel")}</label>
                  <input
                    type="url"
                    value={vcFormUrl}
                    onChange={(e) => { setVcFormUrl(e.target.value); setVcError(""); }}
                    placeholder={t("nsVideoConf.urlPlaceholder")}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("nsVideoConf.providerLabel")}</label>
                  <select value={vcFormProvider} onChange={(e) => setVcFormProvider(e.target.value)} style={inputStyle}>
                    <option value="google_meet">{t("nsVideoConf.provider_google_meet")}</option>
                    <option value="zoom">{t("nsVideoConf.provider_zoom")}</option>
                    <option value="teams">{t("nsVideoConf.provider_teams")}</option>
                    <option value="other">{t("nsVideoConf.provider_other")}</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t("nsVideoConf.titleLabel")}</label>
                  <input
                    type="text"
                    value={vcFormTitle}
                    onChange={(e) => setVcFormTitle(e.target.value)}
                    placeholder={t("nsVideoConf.titleLabel")}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("nsVideoConf.notesLabel")}</label>
                  <input
                    type="text"
                    value={vcFormNotes}
                    onChange={(e) => setVcFormNotes(e.target.value)}
                    placeholder={t("nsVideoConf.notesPlaceholder")}
                    style={inputStyle}
                  />
                </div>
                {vcError && (
                  <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>⚠ {vcError}</p>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSaveVc}
                    disabled={vcSaving}
                    style={{ ...primaryBtnSmallStyle, opacity: vcSaving ? 0.6 : 1 }}
                  >
                    {vcSaving ? t("common.saving") : t("common.save")}
                  </button>
                  <button onClick={() => { setShowVcForm(false); setVcError(""); }} style={smallBtnStyle}>
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {meeting.video_conference_notes && !showVcForm && (
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 10px", fontStyle: "italic" }}>
              {meeting.video_conference_notes}
            </p>
          )}

          {meeting.video_conference_enabled && meeting.video_conference_url && (
            <div>
              <a
                href={meeting.video_conference_url}
                target="_blank"
                rel="noopener noreferrer"
                style={vcJoinBtnStyle}
              >
                🎥 {t("nsVideoConf.join")}
              </a>
              {meeting.video_conference_started_at && (
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                  {t("nsVideoConf.startedAt")}: {new Date(meeting.video_conference_started_at).toLocaleString(getIntlLocale(), {
                    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          )}

          {!meeting.video_conference_enabled && !isAdmin && (
            <button disabled style={vcDisabledBtnStyle}>
              {t("nsVideoConf.notStarted")}
            </button>
          )}
        </div>

        {/* Agenda Section */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{t("nsMeetings.agenda")}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(["ru", "uz", "en"] as MaterialLang[])
                .filter(lang => Object.values(materialsMap).flat().some(m => m.language === lang))
                .map(lang => {
                  const langCode = lang.toUpperCase();
                  return (
                    <button
                      key={lang}
                      disabled={archiveBuilding}
                      onClick={() => handleDownloadArchive(lang)}
                      style={{ ...smallBtnStyle, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, opacity: archiveBuilding ? 0.6 : 1 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8"/>
                        <rect x="1" y="3" width="22" height="5" rx="1"/>
                        <line x1="10" y1="12" x2="14" y2="12"/>
                      </svg>
                      {t("nsMeetings.downloadArchive")} ({langCode})
                    </button>
                  );
                })}

              {isAdmin && agendaItems.length > 0 && agendaItems.some(item => {
                const v = votingsMap[item.id];
                return !v || v.status === "draft";
              }) && (
                <button onClick={handleActivateAllVoting} style={activateVotingBtnStyle}>
                  🗳 {t("nsVoting.activate")}
                </button>
              )}
              {isAdmin && (
                <button onClick={openCreateAgendaForm} style={smallBtnStyle}>
                  + {t("nsMeetings.addAgendaItem")}
                </button>
              )}
            </div>
          </div>

          {agendaItems.length === 0 && (
            <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("nsMeetings.noAgenda")}</p>
          )}

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

                  {/* Materials — only render if admin (can upload) or if there are actual files */}
                  {(isAdmin || mats.length > 0) && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
                      {t("nsMeetings.materials")}
                    </span>

                    {(["ru", "uz", "en"] as MaterialLang[]).map((lang) => {
                      const langMats = mats.filter((m) => m.language === lang);
                      // Non-admins only see language sections that have at least one file
                      if (langMats.length === 0 && !isAdmin) return null;
                      const refKey = `${item.id}_${lang}`;
                      const langLabel = lang === "ru" ? t("nsMeetings.matLangRu") : lang === "uz" ? t("nsMeetings.matLangUz") : t("nsMeetings.matLangEn");

                      return (
                        <div key={lang} style={{ marginBottom: 10, padding: "8px 10px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F3F4F6" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              {langLabel}
                            </span>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => fileInputRefs.current[refKey]?.click()}
                                  style={uploadBtnStyle}
                                >
                                  + {t("nsMeetings.uploadFile")}
                                </button>
                                <input
                                  ref={(el) => { fileInputRefs.current[refKey] = el; }}
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadFile(item.id, f, lang);
                                    e.target.value = "";
                                  }}
                                />
                              </>
                            )}
                          </div>

                          {langMats.length === 0 && isAdmin && (
                            <p style={{ color: "#D1D5DB", fontSize: 12, margin: 0 }}>
                              {t("nsMeetings.noMaterialsLang")}
                            </p>
                          )}

                          {langMats.map((mat) => {
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
                      );
                    })}

                    {/* Legacy materials without language */}
                    {mats.filter((m) => !m.language).length > 0 && (
                      <div style={{ marginBottom: 10, padding: "8px 10px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F3F4F6" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 6, display: "block" }}>
                          {t("nsMeetings.matLangGeneral")}
                        </span>
                        {mats.filter((m) => !m.language).map((mat) => {
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
                    )}
                  </div>
                  )}

                  {/* AI-Brief Section */}
                  {item.ai_brief_enabled !== false && <div style={{ marginTop: 14 }}>
                    {(() => {
                      const lang = getCurrentLang(item.id);
                      const key = briefKey(item.id, lang);
                      const brief = briefsMap[key];
                      const isLoading = briefLoading[key];
                      const error = briefError[key];
                      const isExpanded = !!briefExpanded[item.id];
                      return (
                        <>
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
                            {brief && !isLoading && (
                              <button
                                onClick={() => setBriefExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#059669", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}
                              >
                                <span style={{ display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▶</span>
                                {isExpanded ? t("nsMeetings.briefCollapse") : t("nsMeetings.briefExpand")}
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

                          {brief && !isLoading && isExpanded && (
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
                  </div>}

                  {/* Voting Section */}
                  {(() => {
                    const voting = votingsMap[item.id] ?? null;
                    const isVotingOpen = voting?.status === "open";
                    const isVotingClosed = voting?.status === "closed";
                    const myVote = voting ? (myVotesMap[voting.id] ?? null) : null;
                    const tally = voting ? tallyBoardVotes(voting.votes || []) : null;
                    return (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F3F4F6" }}>
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

                        {isAdmin && isVotingOpen && (
                          <button
                            onClick={() => handleCloseVoting(voting!.id)}
                            style={{ ...smallBtnStyle, fontSize: 12, padding: "3px 10px", color: "#DC2626", borderColor: "#FECACA" }}
                          >
                            {t("nsVoting.closeVoting")}
                          </button>
                        )}

                        {!voting && !isAdmin && (
                          <span style={{ fontSize: 13, color: "#9CA3AF" }}>{t("nsVoting.notStarted")}</span>
                        )}

                        {tally && (
                          <div style={{ display: "flex", gap: 16, fontSize: 13, marginTop: 6, marginBottom: 8 }}>
                            <span style={{ color: "#059669", fontWeight: 500 }}>✓ {t("nsVoting.voteFor")}: {tally.forCount}</span>
                            <span style={{ color: "#DC2626", fontWeight: 500 }}>✗ {t("nsVoting.voteAgainst")}: {tally.againstCount}</span>
                            <span style={{ color: "#9CA3AF", fontWeight: 500 }}>– {t("nsVoting.voteAbstain")}: {tally.abstainCount}</span>
                          </div>
                        )}

                        {/* Individual votes list */}
                        {voting && (voting.votes || []).length > 0 && (
                          <div style={{ marginTop: 4, marginBottom: 8, padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F3F4F6" }}>
                            {(voting.votes || []).map((vote) => {
                              const vp = voterProfiles[vote.voter_id];
                              const name = vp ? getLocalizedName(vp, i18n.language) : vote.voter_id.slice(0, 8);
                              const choiceIcon = vote.choice === "for" ? "✓" : vote.choice === "against" ? "✗" : "–";
                              const choiceColor = vote.choice === "for" ? "#059669" : vote.choice === "against" ? "#DC2626" : "#9CA3AF";
                              const choiceLabel = vote.choice === "for" ? t("nsVoting.voteFor")
                                : vote.choice === "against" ? t("nsVoting.voteAgainst")
                                : t("nsVoting.voteAbstain");
                              return (
                                <div key={vote.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                                  <span style={{ color: "#374151" }}>{name}</span>
                                  <span style={{ color: choiceColor, fontWeight: 600 }}>{choiceIcon} {choiceLabel}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isVotingOpen && !meetingSignature && canVote && (
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

                        {meetingSignature && myVote && (
                          <div style={{ fontSize: 13, color: "#059669", marginTop: 4 }}>
                            ✓ {t("nsVoting.myVote")}: {
                              myVote.choice === "for" ? t("nsVoting.voteFor")
                                : myVote.choice === "against" ? t("nsVoting.voteAgainst")
                                : t("nsVoting.voteAbstain")
                            } · {t("nsVoting.signed")}
                          </div>
                        )}

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

                  {/* ── Discussion Button ── */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F3F4F6" }}>
                    <button
                      onClick={() => setDiscussionAgendaId(item.id)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "7px 16px", fontSize: 13, fontWeight: 500,
                        background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8,
                        color: "#374151", cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
                    >
                      <span style={{ fontSize: 15 }}>{"\uD83D\uDCAC"}</span>
                      {t("nsMeetings.discussion")}
                      {(() => {
                        const count = (commentsMap[item.id] || []).filter((c) => !c.is_deleted).length;
                        return count > 0 ? (
                          <span style={{
                            background: "#2563EB", color: "#FFF", fontSize: 11, fontWeight: 600,
                            borderRadius: 10, padding: "1px 7px", minWidth: 18, textAlign: "center" as const,
                          }}>{count}</span>
                        ) : null;
                      })()}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Final Signature Block */}
          {profile && (() => {
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

        {/* "Ready" button */}
        {isAdmin && (
          <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 20, marginTop: 20, display: "flex", justifyContent: "center" }}>
            <button
              onClick={async () => {
                const next = !meeting.materials_ready;
                await updateNSMeeting(meeting.id, { materials_ready: next } as any);
                await loadMeeting();
              }}
              style={{
                padding: "12px 48px",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 10,
                border: meeting.materials_ready ? "2px solid #16A34A" : "2px solid #D1D5DB",
                background: meeting.materials_ready ? "#F0FDF4" : "#FFFFFF",
                color: meeting.materials_ready ? "#16A34A" : "#374151",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {meeting.materials_ready ? "✓ " : ""}{t("nsMeetings.ready")}
            </button>
          </div>
        )}
      </div>

      {/* ===== Agenda Item Modal ===== */}
      {showAgendaModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 560 }}>
            <h3 style={{ margin: "0 0 16px" }}>
              {editingAgendaItem ? t("nsMeetings.editAgendaItem") : t("nsMeetings.addAgendaItem")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

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

              <button
                type="button"
                onClick={handleGenerateAgendaTranslations}
                disabled={agendaTranslating || !hasAnyAgendaTitle()}
                style={{
                  ...smallBtnStyle,
                  opacity: agendaTranslating || !hasAnyAgendaTitle() ? 0.5 : 1,
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

              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                background: agendaAiBriefEnabled ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${agendaAiBriefEnabled ? "#BBF7D0" : "#FECACA"}`,
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={agendaAiBriefEnabled}
                    onChange={(e) => setAgendaAiBriefEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#7C3AED", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>
                    {t("nsMeetings.aiBriefEnabled")}
                  </span>
                </label>
              </div>
              {!agendaAiBriefEnabled && (
                <p style={{ fontSize: 12, color: "#92400E", margin: "-4px 0 0", background: "#FEF3C7", padding: "6px 10px", borderRadius: 6 }}>
                  {t("nsMeetings.aiBriefDisabledHint")}
                </p>
              )}

              {agendaSaveError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0, background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {agendaSaveError}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setAgendaSaveError(""); handleSaveAgendaItem(); }}
                  disabled={agendaSaving || !hasAnyAgendaTitle()}
                  style={{ ...primaryBtnStyle, opacity: agendaSaving || !hasAnyAgendaTitle() ? 0.5 : 1 }}
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

      {/* ===== Edit Meeting Modal ===== */}
      {showMeetingForm && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 540 }}>
            <h3 style={{ margin: "0 0 16px" }}>
              {t("nsMeetings.editMeeting")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

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

              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingTitle")}</label>
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

              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingDate")}</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingStatus")}</label>
                <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} style={inputStyle}>
                  <option value="draft">{t("nsMeetings.statusDraft")}</option>
                  <option value="scheduled">{t("nsMeetings.statusScheduled")}</option>
                  <option value="completed">{t("nsMeetings.statusCompleted")}</option>
                </select>
              </div>

              {saveError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0, background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {saveError}
                </p>
              )}

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


      {/* Toast */}
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

function getVcBadgeStyle(status: "none" | "ready" | "active"): React.CSSProperties {
  if (status === "active") return { padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#D1FAE5", color: "#065F46" };
  if (status === "ready") return { padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#DBEAFE", color: "#1E40AF" };
  return { padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: "#F3F4F6", color: "#9CA3AF" };
}

const vcActivateBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#059669",
  color: "#FFFFFF",
  cursor: "pointer",
};

const vcJoinBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 22px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#059669",
  color: "#FFFFFF",
  cursor: "pointer",
  textDecoration: "none",
};

const vcDisabledBtnStyle: React.CSSProperties = {
  padding: "9px 22px",
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  color: "#9CA3AF",
  cursor: "not-allowed",
};

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
