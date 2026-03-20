import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import { downloadFileByUrl } from "../lib/format";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchConversationThreads,
  fetchContacts,
  fetchGroupsForMember,
  fetchProfileById,
  fetchConversation,
  sendMessage,
  deleteMessage,
  deleteGroupMessage,
  editMessage,
  editGroupMessage,
  markConversationAndNotificationsAsRead,
  subscribeToMessages,
  unsubscribeFromMessages,
  createGroup,
  deleteGroup,
  fetchGroupMessages,
  sendGroupMessage,
  fetchGroupMembers,
  addGroupMember,
  removeGroupMember,
  subscribeToGroupMessages,
  uploadChatFile,
  getChatFileUrl,
  isImageFile,
  formatFileSize,
  type Message,
  type ConversationThread,
  type ContactProfile,
  type ChatGroup,
  type GroupMessage,
  type ChatGroupMember,
} from "../lib/chat";
import { markNotificationsByMessageIds } from "../lib/notifications";
import { useNotifications } from "../components/Layout";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

type SidebarTab = "personal" | "groups";

const SS_CHAT_TAB = "chat_sidebarTab";
const SS_CHAT_CONTACT = "chat_selectedContactId";
const SS_CHAT_GROUP = "chat_selectedGroupId";

// ─── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = (name || "?").trim().split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name || "?").slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#10B981",
  "#F59E0B", "#EF4444", "#6366F1", "#0EA5E9",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (const c of name || "") hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor(
    (today.getTime() - msgDay.getTime()) / 86400000
  );
  if (diffDays === 0) {
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

function sortGroupsByLatest(groups: ChatGroup[]): ChatGroup[] {
  return [...groups].sort((a, b) => {
    const ta = a.last_message_at
      ? new Date(a.last_message_at).getTime()
      : new Date(a.created_at).getTime();
    const tb = b.last_message_at
      ? new Date(b.last_message_at).getTime()
      : new Date(b.created_at).getTime();
    return tb - ta;
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ChatPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refresh } = useNotifications();

  const [sidebarTab, setSidebarTabRaw] = useState<SidebarTab>(
    () => (sessionStorage.getItem(SS_CHAT_TAB) as SidebarTab) || "personal"
  );
  const setSidebarTab = (tab: SidebarTab) => {
    setSidebarTabRaw(tab);
    sessionStorage.setItem(SS_CHAT_TAB, tab);
  };

  // ── personal threads ──────────────────────────────────────────────────────
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [selectedContact, setSelectedContact] = useState<ConversationThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // ── new chat modal ────────────────────────────────────────────────────────
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [allUsers, setAllUsers] = useState<ContactProfile[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);

  // ── groups ────────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [newGroupMessage, setNewGroupMessage] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingGroupMessages, setLoadingGroupMessages] = useState(false);
  const [sendingGroup, setSendingGroup] = useState(false);
  const [groupMembers, setGroupMembers] = useState<ChatGroupMember[]>([]);
  const [showGroupMembers, setShowGroupMembers] = useState(false);

  // ── create group modal ────────────────────────────────────────────────────
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── file upload ───────────────────────────────────────────────────────────
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingGroupFile, setPendingGroupFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupFileInputRef = useRef<HTMLInputElement>(null);
  const [fileUrlCache, setFileUrlCache] = useState<Record<string, string>>({});

  // ── delete hover ──────────────────────────────────────────────────────────
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  // ── edit message ──────────────────────────────────────────────────────────
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // ── misc ──────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [chatError, setChatError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedContactRef = useRef<ConversationThread | null>(null);
  const groupChannelRef = useRef<ReturnType<typeof subscribeToGroupMessages> | null>(null);

  // ── sync refs/session ─────────────────────────────────────────────────────
  useEffect(() => {
    selectedContactRef.current = selectedContact;
    if (selectedContact) {
      sessionStorage.setItem(SS_CHAT_CONTACT, selectedContact.id);
    } else {
      sessionStorage.removeItem(SS_CHAT_CONTACT);
    }
  }, [selectedContact]);

  useEffect(() => {
    if (selectedGroup) {
      sessionStorage.setItem(SS_CHAT_GROUP, selectedGroup.id);
    } else {
      sessionStorage.removeItem(SS_CHAT_GROUP);
    }
  }, [selectedGroup]);

  // ── load threads ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    setLoadingThreads(true);
    fetchConversationThreads(profile.id).then((data) => {
      setThreads(data);
      setLoadingThreads(false);

      // Restore from URL > sessionStorage
      const urlUserId = searchParams.get("userId");
      const savedId = urlUserId || sessionStorage.getItem(SS_CHAT_CONTACT);
      if (savedId && !selectedContact) {
        const found = data.find((c) => c.id === savedId);
        if (found) {
          setSelectedContact(found);
          if (urlUserId) {
            setSidebarTab("personal");
            setSearchParams({}, { replace: true });
          }
        }
      }
    });
  }, [profile?.id]);

  // ── load groups ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    fetchGroupsForMember(profile.id).then((data) => {
      setGroups(data);
      setLoadingGroups(false);
      const savedGroupId = sessionStorage.getItem(SS_CHAT_GROUP);
      if (savedGroupId && !selectedGroup) {
        const found = data.find((g) => g.id === savedGroupId);
        if (found) setSelectedGroup(found);
      }
    });
  }, [profile?.id]);

  // ── load conversation on contact change ───────────────────────────────────
  useEffect(() => {
    if (!profile || !selectedContact) return;
    setLoadingMessages(true);
    (async () => {
      await markConversationAndNotificationsAsRead(profile.id, selectedContact.id);
      const data = await fetchConversation(profile.id, selectedContact.id);
      setMessages(data);
      setLoadingMessages(false);
      setThreads((prev) =>
        prev.map((c) =>
          c.id === selectedContact.id ? { ...c, unread_count: 0 } : c
        )
      );
      refresh();
    })();
  }, [profile?.id, selectedContact?.id]);

  // ── load group messages + subscribe ───────────────────────────────────────
  useEffect(() => {
    if (!selectedGroup) return;
    setLoadingGroupMessages(true);
    fetchGroupMessages(selectedGroup.id).then((data) => {
      setGroupMessages(data);
      setLoadingGroupMessages(false);
    });
    fetchGroupMembers(selectedGroup.id).then(setGroupMembers);

    if (groupChannelRef.current) {
      unsubscribeFromMessages(groupChannelRef.current);
    }
    groupChannelRef.current = subscribeToGroupMessages(
      selectedGroup.id,
      (msg) => {
        setGroupMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Update group's last message preview and bubble to top
        const preview = msg.file_name ? `📎 ${msg.file_name}` : msg.body;
        setGroups((prev) =>
          sortGroupsByLatest(
            prev.map((g) =>
              g.id === msg.group_id
                ? { ...g, last_message: preview, last_message_at: msg.created_at }
                : g
            )
          )
        );
      }
    );

    return () => {
      if (groupChannelRef.current) {
        unsubscribeFromMessages(groupChannelRef.current);
        groupChannelRef.current = null;
      }
    };
  }, [selectedGroup?.id]);

  // ── realtime for personal ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const channel = subscribeToMessages(profile.id, (msg) => {
      const current = selectedContactRef.current;
      if (current && msg.sender_id === current.id) {
        setMessages((prev) => [...prev, msg]);
        (async () => {
          try {
            await markConversationAndNotificationsAsRead(
              profile.id,
              msg.sender_id
            );
          } catch {
            await markNotificationsByMessageIds(profile.id, [String(msg.id)]);
          }
          refresh();
        })();
      } else {
        // Update thread preview and badge; or add new thread if first message
        const preview = msg.file_name ? `📎 ${msg.file_name}` : msg.body;
        setThreads((prev) => {
          const existing = prev.find((t) => t.id === msg.sender_id);
          if (existing) {
            const updated = prev.map((t) =>
              t.id === msg.sender_id
                ? {
                    ...t,
                    last_message: preview,
                    last_message_at: msg.created_at,
                    unread_count: (t.unread_count || 0) + 1,
                  }
                : t
            );
            return updated.sort(
              (a, b) =>
                new Date(b.last_message_at!).getTime() -
                new Date(a.last_message_at!).getTime()
            );
          }
          // New conversation — fetch profile then prepend
          fetchProfileById(msg.sender_id).then((p) => {
            if (!p) return;
            setThreads((prev2) => {
              if (prev2.find((t) => t.id === p.id)) return prev2;
              return [
                {
                  id: p.id,
                  full_name: p.full_name,
                  role: p.role,
                  last_message: preview,
                  last_message_at: msg.created_at,
                  unread_count: 1,
                },
                ...prev2,
              ];
            });
          });
          return prev;
        });
      }
    });
    return () => unsubscribeFromMessages(channel);
  }, [profile?.id]);

  // ── auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupMessages]);

  // ── file URL resolver ─────────────────────────────────────────────────────
  const resolveFileUrl = useCallback(
    async (storagePath: string) => {
      if (fileUrlCache[storagePath]) return fileUrlCache[storagePath];
      const url = await getChatFileUrl(storagePath);
      if (url) {
        setFileUrlCache((prev) => ({ ...prev, [storagePath]: url }));
        return url;
      }
      return null;
    },
    [fileUrlCache]
  );

  // ── lazy load all users (for modals) ─────────────────────────────────────
  const ensureAllUsers = async () => {
    if (allUsers.length || allUsersLoading || !profile) return;
    setAllUsersLoading(true);
    const users = await fetchContacts(profile.id);
    setAllUsers(users);
    setAllUsersLoading(false);
  };

  // ─── handlers ──────────────────────────────────────────────────────────────

  const handleSend = async (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    if (
      !profile ||
      !org ||
      !selectedContact ||
      (!newMessage.trim() && !pendingFile)
    )
      return;
    setSending(true);
    setUploading(!!pendingFile);
    setChatError("");
    try {
      let fileInfo:
        | { file_name: string; file_size: number; mime_type: string; storage_path: string }
        | undefined;
      if (pendingFile) {
        const storagePath = await uploadChatFile(pendingFile, org.id);
        fileInfo = {
          file_name: pendingFile.name,
          file_size: pendingFile.size,
          mime_type: pendingFile.type || "application/octet-stream",
          storage_path: storagePath,
        };
      }
      const msg = await sendMessage(
        org.id,
        profile.id,
        selectedContact.id,
        newMessage,
        fileInfo
      );
      if (msg) setMessages((prev) => [...prev, msg]);

      // Update / add thread and bubble to top
      const preview = fileInfo
        ? `📎 ${fileInfo.file_name}`
        : newMessage.trim();
      const now = new Date().toISOString();
      setThreads((prev) => {
        const existing = prev.find((t) => t.id === selectedContact.id);
        if (existing) {
          const updated = prev.map((t) =>
            t.id === selectedContact.id
              ? { ...t, last_message: preview, last_message_at: now }
              : t
          );
          return updated.sort(
            (a, b) =>
              new Date(b.last_message_at!).getTime() -
              new Date(a.last_message_at!).getTime()
          );
        }
        return [
          {
            ...selectedContact,
            last_message: preview,
            last_message_at: now,
          },
          ...prev,
        ];
      });

      setNewMessage("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : t("chat.sendError")
      );
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleSendGroupMsg = async (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    if (
      !profile ||
      !selectedGroup ||
      (!newGroupMessage.trim() && !pendingGroupFile)
    )
      return;
    setSendingGroup(true);
    setUploading(!!pendingGroupFile);
    setChatError("");
    try {
      let fileInfo:
        | { file_name: string; file_size: number; mime_type: string; storage_path: string }
        | undefined;
      if (pendingGroupFile) {
        const storagePath = await uploadChatFile(pendingGroupFile, "default");
        fileInfo = {
          file_name: pendingGroupFile.name,
          file_size: pendingGroupFile.size,
          mime_type: pendingGroupFile.type || "application/octet-stream",
          storage_path: storagePath,
        };
      }
      const msg = await sendGroupMessage(
        selectedGroup.id,
        profile.id,
        newGroupMessage,
        fileInfo
      );
      if (msg) setGroupMessages((prev) => [...prev, msg]);

      const preview = fileInfo
        ? `📎 ${fileInfo.file_name}`
        : newGroupMessage.trim();
      const now = new Date().toISOString();
      setGroups((prev) =>
        sortGroupsByLatest(
          prev.map((g) =>
            g.id === selectedGroup.id
              ? { ...g, last_message: preview, last_message_at: now }
              : g
          )
        )
      );

      setNewGroupMessage("");
      setPendingGroupFile(null);
      if (groupFileInputRef.current) groupFileInputRef.current.value = "";
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : t("chat.sendGroupError")
      );
    } finally {
      setSendingGroup(false);
      setUploading(false);
    }
  };

  const handleCreateGroup = async (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    if (!profile || !org || !groupName.trim()) return;
    setCreatingGroup(true);
    try {
      const g = await createGroup(
        org.id,
        profile.id,
        groupName.trim(),
        selectedMemberIds
      );
      if (g) {
        const newGroup: ChatGroup = {
          ...g,
          member_count: selectedMemberIds.length + 1,
        };
        setGroups((prev) => [newGroup, ...prev]);
        setSelectedGroup(newGroup);
      }
      setShowCreateGroup(false);
      setGroupName("");
      setSelectedMemberIds([]);
    } catch {
      /* logged */
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm(t("chat.deleteGroupConfirm"))) return;
    try {
      await deleteGroup(groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setGroupMessages([]);
      }
    } catch {
      /* logged */
    }
  };

  const handleAddMember = async (profileId: string) => {
    if (!selectedGroup) return;
    try {
      await addGroupMember(selectedGroup.id, profileId);
      const members = await fetchGroupMembers(selectedGroup.id);
      setGroupMembers(members);
    } catch {
      /* logged */
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!selectedGroup) return;
    try {
      await removeGroupMember(selectedGroup.id, profileId);
      setGroupMembers((prev) => prev.filter((m) => m.profile_id !== profileId));
    } catch {
      /* logged */
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleStartNewChat = (user: ContactProfile) => {
    const existing = threads.find((t) => t.id === user.id);
    if (existing) {
      setSelectedContact(existing);
    } else {
      setSelectedContact({
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        unread_count: 0,
      });
    }
    setShowNewChat(false);
    setNewChatSearch("");
    setSidebarTab("personal");
    setSelectedGroup(null);
    setGroupMessages([]);
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteMessage(msgId);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true } : m))
      );
    } catch (err) {
      console.error("handleDeleteMessage error:", err);
    }
  };

  const handleDeleteGroupMessage = async (msgId: string) => {
    try {
      await deleteGroupMessage(msgId);
      setGroupMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true } : m))
      );
    } catch (err) {
      console.error("handleDeleteGroupMessage error:", err);
    }
  };

  const handleStartEdit = (msgId: string, currentBody: string) => {
    setEditingMsgId(msgId);
    setEditingContent(currentBody);
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditingContent("");
  };

  const handleSaveEditMessage = async (msgId: string) => {
    const trimmed = editingContent.trim();
    if (!trimmed) return;
    try {
      await editMessage(msgId, trimmed);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, body: trimmed, is_edited: true } : m))
      );
    } catch (err) {
      console.error("handleSaveEditMessage error:", err);
    }
    handleCancelEdit();
  };

  const handleSaveEditGroupMessage = async (msgId: string) => {
    const trimmed = editingContent.trim();
    if (!trimmed) return;
    try {
      await editGroupMessage(msgId, trimmed);
      setGroupMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, body: trimmed, is_edited: true } : m))
      );
    } catch (err) {
      console.error("handleSaveEditGroupMessage error:", err);
    }
    handleCancelEdit();
  };

  const switchTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    setSearchQuery("");
    if (tab === "personal") {
      setSelectedGroup(null);
      setGroupMessages([]);
    } else {
      setSelectedContact(null);
      setMessages([]);
    }
  };

  // ─── sub-components ────────────────────────────────────────────────────────

  const AttachmentBubble = ({
    storagePath,
    fileName,
    fileSize,
    mimeType,
    isMine,
  }: {
    storagePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    isMine: boolean;
  }) => {
    const [url, setUrl] = useState<string | null>(
      fileUrlCache[storagePath] || null
    );
    const [loading, setLoading] = useState(!url);

    useEffect(() => {
      if (url) return;
      resolveFileUrl(storagePath).then((u) => {
        setUrl(u || null);
        setLoading(false);
      });
    }, [storagePath, url]);

    if (loading)
      return (
        <div
          style={{
            fontSize: 12,
            color: isMine ? "rgba(255,255,255,0.7)" : "#9ca3af",
          }}
        >
          {t("chat.loadingFile")}
        </div>
      );

    if (isImageFile(mimeType) && url) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", marginTop: 4 }}
        >
          <img
            src={url}
            alt={fileName}
            style={{
              maxWidth: 240,
              maxHeight: 200,
              borderRadius: 8,
              display: "block",
            }}
          />
        </a>
      );
    }

    return (
      <div
        onClick={() => {
          if (url) downloadFileByUrl(url, fileName).catch(console.error);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: isMine ? "rgba(255,255,255,0.15)" : "#e5e7eb",
          borderRadius: 8,
          marginTop: 4,
          color: isMine ? "#fff" : "#111827",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 20 }}>📎</span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: isMine ? "rgba(255,255,255,0.6)" : "#6b7280",
            }}
          >
            {formatFileSize(fileSize)}
          </div>
        </div>
      </div>
    );
  };

  if (!profile) {
    return <div style={{ color: "#9CA3AF" }}>{t("chat.loadingProfile")}</div>;
  }

  // ─── filtered lists ────────────────────────────────────────────────────────

  const filteredThreads = threads.filter(
    (c) =>
      !searchQuery.trim() ||
      c.full_name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const filteredGroups = groups.filter(
    (g) =>
      !searchQuery.trim() ||
      g.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const canManageGroup = (g: ChatGroup) =>
    profile &&
    (g.created_by === profile.id ||
      profile.role === "admin" ||
      profile.role === "corp_secretary");

  const filteredNewChatUsers = allUsers.filter(
    (u) =>
      !newChatSearch.trim() ||
      u.full_name.toLowerCase().includes(newChatSearch.trim().toLowerCase())
  );

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)" }}>
      {/* ══════════════ LEFT SIDEBAR ══════════════ */}
      <div style={sidebarStyle}>

        {/* Header */}
        <div style={sidebarHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
            {t("chat.title")}
          </h2>
        </div>

        {/* Tabs */}
        <div style={tabBarStyle}>
          <button
            onClick={() => switchTab("personal")}
            style={{
              ...tabBtnStyle,
              color: sidebarTab === "personal" ? "#2563eb" : "#6b7280",
              borderBottomColor:
                sidebarTab === "personal" ? "#2563eb" : "transparent",
              fontWeight: sidebarTab === "personal" ? 600 : 400,
            }}
          >
            {t("chat.personal")}
          </button>
          <button
            onClick={() => switchTab("groups")}
            style={{
              ...tabBtnStyle,
              color: sidebarTab === "groups" ? "#2563eb" : "#6b7280",
              borderBottomColor:
                sidebarTab === "groups" ? "#2563eb" : "transparent",
              fontWeight: sidebarTab === "groups" ? 600 : 400,
            }}
          >
            {t("chat.groups")}
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 12px 0" }}>
          <input
            type="text"
            placeholder={
              sidebarTab === "personal"
                ? t("chat.searchName")
                : t("chat.searchGroup")
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />
        </div>

        {/* Action buttons */}
        <div style={{ padding: "8px 12px 4px" }}>
          {sidebarTab === "personal" ? (
            <button
              onClick={async () => {
                setShowNewChat(true);
                await ensureAllUsers();
              }}
              style={actionBtnStyle}
            >
              + {t("chat.newChat", "Новый чат")}
            </button>
          ) : (
            <button
              onClick={async () => {
                setShowCreateGroup(true);
                await ensureAllUsers();
              }}
              style={actionBtnStyle}
            >
              + {t("chat.createGroup")}
            </button>
          )}
        </div>

        {/* Thread / Group list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidebarTab === "personal" ? (
            loadingThreads ? (
              <p style={listPlaceholderStyle}>{t("common.loading")}</p>
            ) : filteredThreads.length === 0 ? (
              <div style={emptyListStyle}>
                {threads.length === 0 ? (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                    <div style={{ marginBottom: 12, fontSize: 14 }}>
                      {t("chat.noPersonalChats", "У вас пока нет личных переписок")}
                    </div>
                    <button
                      onClick={async () => {
                        setShowNewChat(true);
                        await ensureAllUsers();
                      }}
                      style={startChatBtnStyle}
                    >
                      {t("chat.startChat", "Начать чат")}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 14 }}>{t("chat.noOneFound")}</div>
                )}
              </div>
            ) : (
              filteredThreads.map((c) => {
                const isActive = selectedContact?.id === c.id;
                const color = getAvatarColor(c.full_name);
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedContact(c);
                      setSelectedGroup(null);
                    }}
                    style={{
                      ...threadRowStyle,
                      background: isActive ? "#DBEAFE" : "transparent",
                    }}
                  >
                    <div
                      style={{
                        ...avatarStyle,
                        background: color,
                      }}
                    >
                      {getInitials(c.full_name)}
                    </div>
                    <div style={threadContentStyle}>
                      <div style={threadTopRowStyle}>
                        <span style={threadNameStyle}>{c.full_name || t("chat.noName")}</span>
                        {c.last_message_at && (
                          <span style={threadTimeStyle}>
                            {formatMsgTime(c.last_message_at)}
                          </span>
                        )}
                      </div>
                      <div style={threadBottomRowStyle}>
                        <span style={threadPreviewStyle}>
                          {c.last_message || (
                            <span style={{ fontStyle: "italic" }}>
                              {t(`chat.roles.${c.role}`, c.role)}
                            </span>
                          )}
                        </span>
                        {(c.unread_count ?? 0) > 0 && (
                          <span style={badgeStyle}>{c.unread_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : loadingGroups ? (
            <p style={listPlaceholderStyle}>{t("common.loading")}</p>
          ) : filteredGroups.length === 0 ? (
            <div style={emptyListStyle}>
              {groups.length === 0 ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                  <div style={{ fontSize: 14 }}>
                    {t("chat.noGroupsYet", "Вы не состоите ни в одной группе")}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14 }}>{t("chat.nothingFound")}</div>
              )}
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isActive = selectedGroup?.id === g.id;
              return (
                <div
                  key={g.id}
                  onClick={() => {
                    setSelectedGroup(g);
                    setSelectedContact(null);
                  }}
                  style={{
                    ...threadRowStyle,
                    background: isActive ? "#DBEAFE" : "transparent",
                  }}
                >
                  {/* Group avatar: icon */}
                  <div style={{ ...avatarStyle, background: "#6366F1", fontSize: 18 }}>
                    #
                  </div>
                  <div style={threadContentStyle}>
                    <div style={threadTopRowStyle}>
                      <span style={threadNameStyle}>{g.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {g.last_message_at && (
                          <span style={threadTimeStyle}>
                            {formatMsgTime(g.last_message_at)}
                          </span>
                        )}
                        {canManageGroup(g) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(g.id);
                            }}
                            style={deleteGroupBtnStyle}
                            title={t("chat.deleteGroup")}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={threadBottomRowStyle}>
                      <span style={threadPreviewStyle}>
                        {g.last_message || (
                          <span style={{ fontStyle: "italic" }}>
                            {g.member_count || 0} {t("chat.members")}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══════════════ RIGHT PANEL ══════════════ */}
      <div style={chatPanelStyle}>

        {/* ── Personal: no selection ── */}
        {sidebarTab === "personal" && !selectedContact && (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 6 }}>
              {t("chat.selectContact")}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              {t("chat.selectContactHint", "Выберите чат слева или начните новый")}
            </div>
          </div>
        )}

        {/* ── Personal: conversation ── */}
        {sidebarTab === "personal" && selectedContact && (
          <>
            <div style={chatHeaderStyle}>
              <div
                style={{
                  ...avatarStyle,
                  width: 36,
                  height: 36,
                  fontSize: 13,
                  background: getAvatarColor(selectedContact.full_name),
                  flexShrink: 0,
                }}
              >
                {getInitials(selectedContact.full_name)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {selectedContact.full_name || t("chat.noName")}
                </div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  {t(`chat.roles.${selectedContact.role}`, selectedContact.role)}
                </div>
              </div>
            </div>

            <div style={messagesAreaStyle}>
              {loadingMessages ? (
                <p style={{ color: "#888", textAlign: "center" }}>
                  {t("common.loading")}
                </p>
              ) : messages.length === 0 ? (
                <p style={{ color: "#888", textAlign: "center" }}>
                  {t("chat.noMessages")}
                </p>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === profile.id;
                  const isHovered = hoveredMsgId === m.id;
                  return (
                    <div
                      key={m.id}
                      onMouseEnter={() => setHoveredMsgId(m.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                      style={{
                        display: "flex",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                        alignItems: "flex-end",
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {/* Action buttons — левее пузыря для своих сообщений */}
                      {isMine && !m.is_deleted && isHovered && editingMsgId !== m.id && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button
                            onClick={() => handleStartEdit(m.id, m.body)}
                            style={editMsgBtnStyle}
                            title="Редактировать сообщение"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(m.id)}
                            style={deleteMsgBtnStyle}
                            title="Удалить сообщение"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                      {editingMsgId === m.id ? (
                        <div style={{ ...bubbleBaseStyle, background: isMine ? "#2563eb" : "#f3f4f6", color: isMine ? "#fff" : "#111827", minWidth: 220 }}>
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEditMessage(m.id); }
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            autoFocus
                            rows={2}
                            style={{
                              width: "100%",
                              background: "rgba(255,255,255,0.15)",
                              border: "1px solid rgba(255,255,255,0.3)",
                              borderRadius: 6,
                              color: "inherit",
                              fontSize: 14,
                              padding: "4px 6px",
                              resize: "none",
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                            <button onClick={handleCancelEdit} style={editCancelBtnStyle}>✕</button>
                            <button onClick={() => handleSaveEditMessage(m.id)} style={editSaveBtnStyle}>✓</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={
                            m.is_deleted
                              ? deletedBubbleStyle
                              : {
                                  ...bubbleBaseStyle,
                                  background: isMine ? "#2563eb" : "#f3f4f6",
                                  color: isMine ? "#fff" : "#111827",
                                }
                          }
                        >
                          {m.is_deleted ? (
                            <span style={{ fontStyle: "italic" }}>
                              {t("chat.messageDeleted")}
                            </span>
                          ) : (
                            <>
                              {m.body && <div>{m.body}</div>}
                              {m.storage_path && m.file_name && (
                                <AttachmentBubble
                                  storagePath={m.storage_path}
                                  fileName={m.file_name}
                                  fileSize={m.file_size || 0}
                                  mimeType={m.mime_type || ""}
                                  isMine={isMine}
                                />
                              )}
                            </>
                          )}
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 4,
                              color: m.is_deleted
                                ? "#9ca3af"
                                : isMine
                                ? "rgba(255,255,255,0.7)"
                                : "#9ca3af",
                              textAlign: "right",
                            }}
                          >
                            {m.is_edited && !m.is_deleted && (
                              <span style={{ marginRight: 4, fontStyle: "italic" }}>
                                {t("chat.messageEdited")}
                              </span>
                            )}
                            {new Date(m.created_at).toLocaleTimeString(
                              getIntlLocale(),
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div
                style={{
                  padding: "8px 20px",
                  background: "#FEE2E2",
                  color: "#991B1B",
                  fontSize: 13,
                }}
              >
                {chatError}
                <button
                  onClick={() => setChatError("")}
                  style={{
                    float: "right",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#991B1B",
                  }}
                >
                  &times;
                </button>
              </div>
            )}
            {pendingFile && (
              <div style={pendingFileBarStyle}>
                <span style={{ fontSize: 14 }}>
                  📎 {pendingFile.name} ({formatFileSize(pendingFile.size)})
                </span>
                <button
                  onClick={() => {
                    setPendingFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  style={removePendingBtnStyle}
                >
                  &times;
                </button>
              </div>
            )}
            <form onSubmit={handleSend} style={inputAreaStyle}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) setPendingFile(e.target.files[0]);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={attachBtnStyle}
                title={t("chat.attachFile")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t("chat.messagePlaceholder")}
                style={inputStyle}
                autoFocus
              />
              <button
                type="submit"
                disabled={
                  sending ||
                  uploading ||
                  (!newMessage.trim() && !pendingFile)
                }
                style={sendBtnStyle}
              >
                {uploading
                  ? t("chat.uploading")
                  : sending
                  ? "..."
                  : t("chat.send")}
              </button>
            </form>
          </>
        )}

        {/* ── Group: no selection ── */}
        {sidebarTab === "groups" && !selectedGroup && (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 16, color: "#6b7280" }}>
              {t("chat.selectGroup")}
            </div>
          </div>
        )}

        {/* ── Group: chat ── */}
        {sidebarTab === "groups" && selectedGroup && (
          <>
            <div
              style={{
                ...chatHeaderStyle,
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    ...avatarStyle,
                    width: 36,
                    height: 36,
                    fontSize: 16,
                    background: "#6366F1",
                    flexShrink: 0,
                  }}
                >
                  #
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {selectedGroup.name}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    {groupMembers.length} {t("chat.members")}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowGroupMembers(true)}
                style={membersBtnStyle}
              >
                {t("chat.membersBtnLabel")}
              </button>
            </div>

            <div style={messagesAreaStyle}>
              {loadingGroupMessages ? (
                <p style={{ color: "#888", textAlign: "center" }}>
                  {t("common.loading")}
                </p>
              ) : groupMessages.length === 0 ? (
                <p style={{ color: "#888", textAlign: "center" }}>
                  {t("chat.noGroupMessages")}
                </p>
              ) : (
                groupMessages.map((m) => {
                  const isMine = m.sender_id === profile.id;
                  const isHovered = hoveredMsgId === m.id;
                  const senderName =
                    (m.sender as { full_name: string } | undefined)
                      ?.full_name || "—";
                  return (
                    <div
                      key={m.id}
                      onMouseEnter={() => setHoveredMsgId(m.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                      style={{
                        display: "flex",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                        alignItems: "flex-end",
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {isMine && !m.is_deleted && isHovered && editingMsgId !== m.id && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button
                            onClick={() => handleStartEdit(m.id, m.body)}
                            style={editMsgBtnStyle}
                            title="Редактировать сообщение"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteGroupMessage(m.id)}
                            style={deleteMsgBtnStyle}
                            title="Удалить сообщение"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                      {editingMsgId === m.id ? (
                        <div style={{ ...bubbleBaseStyle, background: isMine ? "#2563eb" : "#f3f4f6", color: isMine ? "#fff" : "#111827", minWidth: 220 }}>
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEditGroupMessage(m.id); }
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            autoFocus
                            rows={2}
                            style={{
                              width: "100%",
                              background: "rgba(255,255,255,0.15)",
                              border: "1px solid rgba(255,255,255,0.3)",
                              borderRadius: 6,
                              color: "inherit",
                              fontSize: 14,
                              padding: "4px 6px",
                              resize: "none",
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                            <button onClick={handleCancelEdit} style={editCancelBtnStyle}>✕</button>
                            <button onClick={() => handleSaveEditGroupMessage(m.id)} style={editSaveBtnStyle}>✓</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={
                            m.is_deleted
                              ? deletedBubbleStyle
                              : {
                                  ...bubbleBaseStyle,
                                  background: isMine ? "#2563eb" : "#f3f4f6",
                                  color: isMine ? "#fff" : "#111827",
                                }
                          }
                        >
                          {m.is_deleted ? (
                            <span style={{ fontStyle: "italic" }}>
                              {t("chat.messageDeleted")}
                            </span>
                          ) : (
                            <>
                              {!isMine && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    marginBottom: 2,
                                    color: "#3B82F6",
                                  }}
                                >
                                  {senderName}
                                </div>
                              )}
                              {m.body && <div>{m.body}</div>}
                              {m.storage_path && m.file_name && (
                                <AttachmentBubble
                                  storagePath={m.storage_path}
                                  fileName={m.file_name}
                                  fileSize={m.file_size || 0}
                                  mimeType={m.mime_type || ""}
                                  isMine={isMine}
                                />
                              )}
                            </>
                          )}
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 4,
                              color: m.is_deleted
                                ? "#9ca3af"
                                : isMine
                                ? "rgba(255,255,255,0.7)"
                                : "#9ca3af",
                              textAlign: "right",
                            }}
                          >
                            {m.is_edited && !m.is_deleted && (
                              <span style={{ marginRight: 4, fontStyle: "italic" }}>
                                {t("chat.messageEdited")}
                              </span>
                            )}
                            {new Date(m.created_at).toLocaleTimeString(
                              getIntlLocale(),
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div
                style={{
                  padding: "8px 20px",
                  background: "#FEE2E2",
                  color: "#991B1B",
                  fontSize: 13,
                }}
              >
                {chatError}
                <button
                  onClick={() => setChatError("")}
                  style={{
                    float: "right",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#991B1B",
                  }}
                >
                  &times;
                </button>
              </div>
            )}
            {pendingGroupFile && (
              <div style={pendingFileBarStyle}>
                <span style={{ fontSize: 14 }}>
                  📎 {pendingGroupFile.name} ({formatFileSize(pendingGroupFile.size)})
                </span>
                <button
                  onClick={() => {
                    setPendingGroupFile(null);
                    if (groupFileInputRef.current)
                      groupFileInputRef.current.value = "";
                  }}
                  style={removePendingBtnStyle}
                >
                  &times;
                </button>
              </div>
            )}
            <form onSubmit={handleSendGroupMsg} style={inputAreaStyle}>
              <input
                type="file"
                ref={groupFileInputRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0])
                    setPendingGroupFile(e.target.files[0]);
                }}
              />
              <button
                type="button"
                onClick={() => groupFileInputRef.current?.click()}
                style={attachBtnStyle}
                title={t("chat.attachFile")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                type="text"
                value={newGroupMessage}
                onChange={(e) => setNewGroupMessage(e.target.value)}
                placeholder={t("chat.groupMessagePlaceholder")}
                style={inputStyle}
                autoFocus
              />
              <button
                type="submit"
                disabled={
                  sendingGroup ||
                  uploading ||
                  (!newGroupMessage.trim() && !pendingGroupFile)
                }
                style={sendBtnStyle}
              >
                {uploading
                  ? t("chat.uploading")
                  : sendingGroup
                  ? "..."
                  : t("chat.send")}
              </button>
            </form>
          </>
        )}
      </div>

      {/* ══════════════ NEW CHAT MODAL ══════════════ */}
      {showNewChat && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {t("chat.newChat", "Новый чат")}
              </h3>
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setNewChatSearch("");
                }}
                style={closeBtnStyle}
              >
                &times;
              </button>
            </div>
            <input
              type="text"
              placeholder={t("chat.searchName")}
              value={newChatSearch}
              onChange={(e) => setNewChatSearch(e.target.value)}
              style={{ ...modalInputStyle, marginBottom: 12 }}
              autoFocus
            />
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {allUsersLoading ? (
                <p style={{ color: "#888", fontSize: 14, padding: "8px 0" }}>
                  {t("common.loading")}
                </p>
              ) : filteredNewChatUsers.length === 0 ? (
                <p style={{ color: "#888", fontSize: 14, padding: "8px 0" }}>
                  {t("chat.noOneFound")}
                </p>
              ) : (
                filteredNewChatUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => handleStartNewChat(u)}
                    style={newChatUserRowStyle}
                  >
                    <div
                      style={{
                        ...avatarStyle,
                        width: 36,
                        height: 36,
                        fontSize: 13,
                        background: getAvatarColor(u.full_name),
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(u.full_name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {u.full_name}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {t(`chat.roles.${u.role}`, u.role)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ CREATE GROUP MODAL ══════════════ */}
      {showCreateGroup && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>{t("chat.newGroup")}</h3>
              <button
                onClick={() => setShowCreateGroup(false)}
                style={closeBtnStyle}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <label style={labelStyle}>{t("chat.groupNameLabel")}</label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder={t("chat.groupNamePlaceholder")}
                style={modalInputStyle}
                required
              />
              <label style={labelStyle}>{t("chat.membersLabel")}</label>
              <div style={memberListStyle}>
                {allUsers.map((c) => (
                  <label key={c.id} style={memberItemStyle}>
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(c.id)}
                      onChange={() => toggleMember(c.id)}
                      style={{ marginRight: 8 }}
                    />
                    <span>{c.full_name}</span>
                    <span
                      style={{
                        color: "#9CA3AF",
                        fontSize: 12,
                        marginLeft: 6,
                      }}
                    >
                      ({t(`chat.roles.${c.role}`, c.role)})
                    </span>
                  </label>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 16,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  style={cancelBtnStyle}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup || !groupName.trim()}
                  style={submitBtnStyle}
                >
                  {creatingGroup ? t("common.creating") : t("common.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ GROUP MEMBERS MODAL ══════════════ */}
      {showGroupMembers && selectedGroup && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {t("chat.membersTitle", { name: selectedGroup.name })}
              </h3>
              <button
                onClick={() => setShowGroupMembers(false)}
                style={closeBtnStyle}
              >
                &times;
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              {groupMembers.map((m) => {
                const p = m.profile as
                  | { full_name: string; role: string }
                  | undefined;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {p?.full_name || "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "#9CA3AF",
                          marginLeft: 8,
                        }}
                      >
                        {t(`chat.roles.${p?.role || ""}`, p?.role || "")}
                      </span>
                    </div>
                    {canManageGroup(selectedGroup) &&
                      m.profile_id !== profile.id && (
                        <button
                          onClick={() => handleRemoveMember(m.profile_id)}
                          style={{ ...deleteBtnSmall, fontSize: 12 }}
                        >
                          {t("chat.remove")}
                        </button>
                      )}
                  </div>
                );
              })}
            </div>

            {canManageGroup(selectedGroup) && (
              <>
                <label style={labelStyle}>{t("chat.addMember")}</label>
                <div style={memberListStyle}>
                  {(allUsers.length ? allUsers : threads).filter(
                    (c) => !groupMembers.some((m) => m.profile_id === c.id)
                  ).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 4px",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>
                        {c.full_name}
                        <span
                          style={{
                            color: "#9CA3AF",
                            fontSize: 12,
                            marginLeft: 6,
                          }}
                        >
                          ({t(`chat.roles.${c.role}`, c.role)})
                        </span>
                      </span>
                      <button
                        onClick={() => handleAddMember(c.id)}
                        style={addMemberBtnStyle}
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════

const sidebarStyle: React.CSSProperties = {
  width: 320,
  borderRight: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  background: "#fafafa",
};

const sidebarHeaderStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #e5e7eb",
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  borderBottom: "1px solid #e5e7eb",
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 0",
  fontSize: 14,
  cursor: "pointer",
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  transition: "all 0.15s",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 14,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  boxSizing: "border-box",
  outline: "none",
  background: "#f3f4f6",
};

const actionBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 0",
  fontSize: 13,
  fontWeight: 500,
  background: "#EFF6FF",
  color: "#2563EB",
  border: "1px solid #BFDBFE",
  borderRadius: 8,
  cursor: "pointer",
};

// Telegram-like thread row
const threadRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  cursor: "pointer",
  borderBottom: "1px solid #f3f4f6",
  transition: "background 0.12s",
};

const avatarStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
  fontWeight: 600,
  color: "#fff",
  flexShrink: 0,
  userSelect: "none",
};

const threadContentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const threadTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 4,
  marginBottom: 2,
};

const threadNameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};

const threadTimeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const threadBottomRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 4,
};

const threadPreviewStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};

const badgeStyle: React.CSSProperties = {
  background: "#EF4444",
  color: "#fff",
  borderRadius: 10,
  minWidth: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  padding: "0 5px",
  flexShrink: 0,
};

const listPlaceholderStyle: React.CSSProperties = {
  padding: 16,
  color: "#888",
  fontSize: 14,
};

const emptyListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 20px",
  color: "#9ca3af",
  textAlign: "center",
};

const startChatBtnStyle: React.CSSProperties = {
  padding: "8px 20px",
  background: "#2563EB",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
};

const deleteGroupBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#9ca3af",
  cursor: "pointer",
  fontSize: 16,
  padding: "0 2px",
  lineHeight: 1,
  flexShrink: 0,
};

// Right panel
const chatPanelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
};

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "#9ca3af",
};

const chatHeaderStyle: React.CSSProperties = {
  padding: "12px 20px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#fff",
};

const messagesAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 20,
  background: "#f9fafb",
};

const bubbleBaseStyle: React.CSSProperties = {
  maxWidth: "70%",
  padding: "10px 14px",
  borderRadius: 12,
  fontSize: 15,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const inputAreaStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid #e5e7eb",
  display: "flex",
  gap: 10,
  background: "#fff",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #d1d5db",
  borderRadius: 24,
  outline: "none",
  background: "#f3f4f6",
};

const sendBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 14,
  borderRadius: 20,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontWeight: 500,
};

const membersBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  color: "#374151",
};

const deleteBtnSmall: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#DC2626",
  cursor: "pointer",
  fontSize: 16,
  padding: "2px 6px",
  lineHeight: 1,
};

const addMemberBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 16,
  color: "#3B82F6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "24px 28px",
  width: "100%",
  maxWidth: 460,
  maxHeight: "80vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 24,
  cursor: "pointer",
  color: "#9CA3AF",
  padding: 0,
  lineHeight: 1,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 500,
  color: "#374151",
  marginBottom: 6,
  marginTop: 14,
};

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
};

const memberListStyle: React.CSSProperties = {
  maxHeight: 200,
  overflowY: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 8,
};

const memberItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 4px",
  cursor: "pointer",
  fontSize: 14,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "9px 20px",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
  color: "#374151",
};

const submitBtnStyle: React.CSSProperties = {
  padding: "9px 24px",
  background: "#3B82F6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const attachBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#6b7280",
  padding: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  flexShrink: 0,
};

const pendingFileBarStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#EFF6FF",
  borderTop: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const removePendingBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 18,
  cursor: "pointer",
  color: "#DC2626",
  padding: "2px 6px",
  lineHeight: 1,
};

const newChatUserRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 4px",
  cursor: "pointer",
  borderRadius: 8,
  borderBottom: "1px solid #f3f4f6",
  transition: "background 0.1s",
};

const deleteMsgBtnStyle: React.CSSProperties = {
  background: "rgba(220, 38, 38, 0.08)",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  padding: "4px 7px",
  borderRadius: 6,
  color: "#EF4444",
  flexShrink: 0,
  lineHeight: 1,
};

const editMsgBtnStyle: React.CSSProperties = {
  background: "rgba(37, 99, 235, 0.08)",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  padding: "4px 7px",
  borderRadius: 6,
  color: "#2563eb",
  flexShrink: 0,
  lineHeight: 1,
};

const editSaveBtnStyle: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: 6,
  color: "#fff",
  lineHeight: 1,
};

const editCancelBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.2)",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  padding: "3px 8px",
  borderRadius: 6,
  color: "inherit",
  lineHeight: 1,
};

const deletedBubbleStyle: React.CSSProperties = {
  maxWidth: "70%",
  padding: "8px 12px",
  borderRadius: 12,
  fontSize: 14,
  background: "#f3f4f6",
  color: "#9ca3af",
  border: "1px solid #e5e7eb",
};
