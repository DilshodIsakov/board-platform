import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchContacts,
  fetchConversation,
  sendMessage,
  markAsRead,
  subscribeToMessages,
  unsubscribeFromMessages,
  fetchGroups,
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
  type ContactProfile,
  type ChatGroup,
  type GroupMessage,
  type ChatGroupMember,
} from "../lib/chat";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

type SidebarTab = "personal" | "groups";

export default function ChatPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("personal");

  // --- Personal chat state ---
  const [contacts, setContacts] = useState<ContactProfile[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // --- Group chat state ---
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [newGroupMessage, setNewGroupMessage] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingGroupMessages, setLoadingGroupMessages] = useState(false);
  const [sendingGroup, setSendingGroup] = useState(false);
  const [groupMembers, setGroupMembers] = useState<ChatGroupMember[]>([]);
  const [showGroupMembers, setShowGroupMembers] = useState(false);

  // --- Create group modal ---
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // --- File upload ---
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingGroupFile, setPendingGroupFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupFileInputRef = useRef<HTMLInputElement>(null);
  const [fileUrlCache, setFileUrlCache] = useState<Record<string, string>>({});

  // --- Error ---
  const [chatError, setChatError] = useState("");

  // --- Filters ---
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedContactRef = useRef<ContactProfile | null>(null);
  const groupChannelRef = useRef<ReturnType<typeof subscribeToGroupMessages> | null>(null);

  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  // Load contacts
  useEffect(() => {
    if (!profile) return;
    fetchContacts(profile.id).then((data) => {
      setContacts(data);
      setLoadingContacts(false);
    });
  }, [profile]);

  // Load groups
  useEffect(() => {
    if (!profile) return;
    fetchGroups().then((data) => {
      setGroups(data);
      setLoadingGroups(false);
    });
  }, [profile]);

  // Load personal conversation
  useEffect(() => {
    if (!profile || !selectedContact) return;
    setLoadingMessages(true);
    fetchConversation(profile.id, selectedContact.id).then((data) => {
      setMessages(data);
      setLoadingMessages(false);
      const unread = data
        .filter((m) => m.receiver_id === profile.id && !m.is_read)
        .map((m) => String(m.id));
      markAsRead(unread);
    });
  }, [profile, selectedContact]);

  // Load group messages + subscribe
  useEffect(() => {
    if (!selectedGroup) return;
    setLoadingGroupMessages(true);
    fetchGroupMessages(selectedGroup.id).then((data) => {
      setGroupMessages(data);
      setLoadingGroupMessages(false);
    });
    fetchGroupMembers(selectedGroup.id).then(setGroupMembers);

    // Subscribe to group
    if (groupChannelRef.current) {
      unsubscribeFromMessages(groupChannelRef.current);
    }
    groupChannelRef.current = subscribeToGroupMessages(selectedGroup.id, (msg) => {
      setGroupMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      if (groupChannelRef.current) {
        unsubscribeFromMessages(groupChannelRef.current);
        groupChannelRef.current = null;
      }
    };
  }, [selectedGroup]);

  // Realtime for personal
  useEffect(() => {
    if (!profile) return;
    const channel = subscribeToMessages(profile.id, (msg) => {
      const current = selectedContactRef.current;
      if (current && msg.sender_id === current.id) {
        setMessages((prev) => [...prev, msg]);
        markAsRead([String(msg.id)]);
      }
    });
    return () => unsubscribeFromMessages(channel);
  }, [profile]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, groupMessages]);

  // --- File URL resolver ---
  const resolveFileUrl = useCallback(async (storagePath: string) => {
    if (fileUrlCache[storagePath]) return fileUrlCache[storagePath];
    const url = await getChatFileUrl(storagePath);
    if (url) {
      setFileUrlCache((prev) => ({ ...prev, [storagePath]: url }));
      return url;
    }
    return null;
  }, [fileUrlCache]);

  // --- Handlers ---

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !org || !selectedContact || (!newMessage.trim() && !pendingFile)) return;
    setSending(true);
    setUploading(!!pendingFile);
    setChatError("");
    try {
      let fileInfo: { file_name: string; file_size: number; mime_type: string; storage_path: string } | undefined;
      if (pendingFile) {
        const storagePath = await uploadChatFile(pendingFile, org.id);
        fileInfo = {
          file_name: pendingFile.name,
          file_size: pendingFile.size,
          mime_type: pendingFile.type || "application/octet-stream",
          storage_path: storagePath,
        };
      }
      const msg = await sendMessage(org.id, profile.id, selectedContact.id, newMessage, fileInfo);
      if (msg) setMessages((prev) => [...prev, msg]);
      setNewMessage("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setChatError(err instanceof Error ? err.message : t("chat.sendError"));
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleSendGroupMsg = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedGroup || (!newGroupMessage.trim() && !pendingGroupFile)) return;
    setSendingGroup(true);
    setUploading(!!pendingGroupFile);
    setChatError("");
    try {
      let fileInfo: { file_name: string; file_size: number; mime_type: string; storage_path: string } | undefined;
      if (pendingGroupFile) {
        const storagePath = await uploadChatFile(pendingGroupFile, profile.organization_id || "");
        fileInfo = {
          file_name: pendingGroupFile.name,
          file_size: pendingGroupFile.size,
          mime_type: pendingGroupFile.type || "application/octet-stream",
          storage_path: storagePath,
        };
      }
      const msg = await sendGroupMessage(selectedGroup.id, profile.id, newGroupMessage, fileInfo);
      if (msg) setGroupMessages((prev) => [...prev, msg]);
      setNewGroupMessage("");
      setPendingGroupFile(null);
      if (groupFileInputRef.current) groupFileInputRef.current.value = "";
    } catch (err) {
      setChatError(err instanceof Error ? err.message : t("chat.sendGroupError"));
    } finally {
      setSendingGroup(false);
      setUploading(false);
    }
  };

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !org || !groupName.trim()) return;
    setCreatingGroup(true);
    try {
      const g = await createGroup(org.id, profile.id, groupName.trim(), selectedMemberIds);
      if (g) {
        setGroups((prev) => [{ ...g, member_count: selectedMemberIds.length + 1 }, ...prev]);
        setSelectedGroup({ ...g, member_count: selectedMemberIds.length + 1 });
      }
      setShowCreateGroup(false);
      setGroupName("");
      setSelectedMemberIds([]);
    } catch { /* logged */ } finally {
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
    } catch { /* logged */ }
  };

  const handleAddMember = async (profileId: string) => {
    if (!selectedGroup) return;
    try {
      await addGroupMember(selectedGroup.id, profileId);
      const members = await fetchGroupMembers(selectedGroup.id);
      setGroupMembers(members);
    } catch { /* logged */ }
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!selectedGroup) return;
    try {
      await removeGroupMember(selectedGroup.id, profileId);
      setGroupMembers((prev) => prev.filter((m) => m.profile_id !== profileId));
    } catch { /* logged */ }
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const switchTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    setSearchQuery("");
    setRoleFilter("all");
    if (tab === "personal") {
      setSelectedGroup(null);
      setGroupMessages([]);
    } else {
      setSelectedContact(null);
      setMessages([]);
    }
  };

  // --- Attachment bubble component ---
  const AttachmentBubble = ({ storagePath, fileName, fileSize, mimeType, isMine }: {
    storagePath: string; fileName: string; fileSize: number; mimeType: string; isMine: boolean;
  }) => {
    const [url, setUrl] = useState<string | null>(fileUrlCache[storagePath] || null);
    const [loading, setLoading] = useState(!url);

    useEffect(() => {
      if (url) return;
      resolveFileUrl(storagePath).then((u) => { setUrl(u || null); setLoading(false); });
    }, [storagePath, url]);

    if (loading) return <div style={{ fontSize: 12, color: isMine ? "rgba(255,255,255,0.7)" : "#9ca3af" }}>{t("chat.loadingFile")}</div>;

    if (isImageFile(mimeType) && url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 4 }}>
          <img src={url} alt={fileName} style={{ maxWidth: 240, maxHeight: 200, borderRadius: 8, display: "block" }} />
        </a>
      );
    }

    return (
      <a
        href={url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
          background: isMine ? "rgba(255,255,255,0.15)" : "#e5e7eb",
          borderRadius: 8, marginTop: 4, textDecoration: "none",
          color: isMine ? "#fff" : "#111827", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 20 }}>📎</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
          <div style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.6)" : "#6b7280" }}>{formatFileSize(fileSize)}</div>
        </div>
      </a>
    );
  };

  if (!profile) {
    return <div style={{ color: "#9CA3AF" }}>{t("chat.loadingProfile")}</div>;
  }

  // Filtered contacts
  const filteredContacts = contacts.filter((c) => {
    if (roleFilter !== "all" && c.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      return c.full_name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }
    return true;
  });

  const filteredGroups = groups.filter((g) => {
    if (searchQuery.trim()) {
      return g.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }
    return true;
  });

  const availableRoles = [...new Set(contacts.map((c) => c.role))];

  const canManageGroup = (g: ChatGroup) =>
    profile && (g.created_by === profile.id || profile.role === "admin" || profile.role === "chairman");

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)" }}>
      {/* === Left sidebar === */}
      <div style={sidebarStyle}>
        <div style={sidebarHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("chat.title")}</h2>
        </div>

        {/* Tabs: Личные / Группы */}
        <div style={tabBarStyle}>
          <button
            onClick={() => switchTab("personal")}
            style={{
              ...tabBtnStyle,
              color: sidebarTab === "personal" ? "#2563eb" : "#6b7280",
              borderBottomColor: sidebarTab === "personal" ? "#2563eb" : "transparent",
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
              borderBottomColor: sidebarTab === "groups" ? "#2563eb" : "transparent",
              fontWeight: sidebarTab === "groups" ? 600 : 400,
            }}
          >
            {t("chat.groups")}
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "8px 12px 0" }}>
          <input
            type="text"
            placeholder={sidebarTab === "personal" ? t("chat.searchName") : t("chat.searchGroup")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />
        </div>

        {/* Role filter for personal */}
        {sidebarTab === "personal" && (
          <div style={{ padding: "8px 12px 4px" }}>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={roleSelectStyle}
            >
              <option value="all">{t("chat.allRoles")}</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>{t(`roles.${r}`, r)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Create group button */}
        {sidebarTab === "groups" && (
          <div style={{ padding: "8px 12px 4px" }}>
            <button onClick={() => setShowCreateGroup(true)} style={createGroupBtnStyle}>
              {t("chat.createGroup")}
            </button>
          </div>
        )}

        {/* Contact / Group list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sidebarTab === "personal" ? (
            loadingContacts ? (
              <p style={{ padding: 16, color: "#888", fontSize: 14 }}>{t("common.loading")}</p>
            ) : filteredContacts.length === 0 ? (
              <p style={{ padding: 16, color: "#888", fontSize: 14 }}>
                {contacts.length === 0 ? t("chat.noContacts") : t("chat.noOneFound")}
              </p>
            ) : (
              filteredContacts.map((c) => (
                <div
                  key={c.id}
                  onClick={() => { setSelectedContact(c); setSelectedGroup(null); }}
                  style={{
                    ...contactItemStyle,
                    background: selectedContact?.id === c.id ? "#dbeafe" : "transparent",
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 15 }}>{c.full_name || t("chat.noName")}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {t(`chat.roles.${c.role}`, c.role)}
                  </div>
                </div>
              ))
            )
          ) : (
            loadingGroups ? (
              <p style={{ padding: 16, color: "#888", fontSize: 14 }}>{t("common.loading")}</p>
            ) : filteredGroups.length === 0 ? (
              <p style={{ padding: 16, color: "#888", fontSize: 14 }}>
                {groups.length === 0 ? t("chat.noGroups") : t("chat.nothingFound")}
              </p>
            ) : (
              filteredGroups.map((g) => (
                <div
                  key={g.id}
                  onClick={() => { setSelectedGroup(g); setSelectedContact(null); }}
                  style={{
                    ...contactItemStyle,
                    background: selectedGroup?.id === g.id ? "#dbeafe" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{g.name}</div>
                    {canManageGroup(g) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                        style={deleteBtnSmall}
                        title={t("chat.deleteGroup")}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {g.member_count || 0} {t("chat.members")}
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* === Right panel === */}
      <div style={chatPanelStyle}>
        {/* Personal chat */}
        {sidebarTab === "personal" && !selectedContact && (
          <div style={emptyStateStyle}>{t("chat.selectContact")}</div>
        )}

        {sidebarTab === "personal" && selectedContact && (
          <>
            <div style={chatHeaderStyle}>
              <strong>{selectedContact.full_name || t("chat.noName")}</strong>
              <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 8 }}>
                {t(`chat.roles.${selectedContact.role}`, selectedContact.role)}
              </span>
            </div>

            <div style={messagesAreaStyle}>
              {loadingMessages ? (
                <p style={{ color: "#888", textAlign: "center" }}>{t("common.loading")}</p>
              ) : messages.length === 0 ? (
                <p style={{ color: "#888", textAlign: "center" }}>{t("chat.noMessages")}</p>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id === profile.id;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                      <div style={{ ...bubbleBaseStyle, background: isMine ? "#2563eb" : "#f3f4f6", color: isMine ? "#fff" : "#111827" }}>
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
                        <div style={{ fontSize: 11, marginTop: 4, color: isMine ? "rgba(255,255,255,0.7)" : "#9ca3af", textAlign: "right" }}>
                          {new Date(m.created_at).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div style={{ padding: "8px 20px", background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
                {chatError}
                <button onClick={() => setChatError("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#991B1B" }}>&times;</button>
              </div>
            )}
            {pendingFile && (
              <div style={pendingFileBarStyle}>
                <span style={{ fontSize: 14 }}>📎 {pendingFile.name} ({formatFileSize(pendingFile.size)})</span>
                <button onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={removePendingBtnStyle}>&times;</button>
              </div>
            )}
            <form onSubmit={handleSend} style={inputAreaStyle}>
              <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) setPendingFile(e.target.files[0]); }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={attachBtnStyle} title={t("chat.attachFile")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={t("chat.messagePlaceholder")} style={inputStyle} autoFocus />
              <button type="submit" disabled={sending || uploading || (!newMessage.trim() && !pendingFile)} style={sendBtnStyle}>{uploading ? t("chat.uploading") : sending ? "..." : t("chat.send")}</button>
            </form>
          </>
        )}

        {/* Group chat */}
        {sidebarTab === "groups" && !selectedGroup && (
          <div style={emptyStateStyle}>{t("chat.selectGroup")}</div>
        )}

        {sidebarTab === "groups" && selectedGroup && (
          <>
            <div style={{ ...chatHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{selectedGroup.name}</strong>
                <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 8 }}>
                  {groupMembers.length} {t("chat.members")}
                </span>
              </div>
              <button onClick={() => setShowGroupMembers(true)} style={membersBtnStyle}>
                {t("chat.membersBtnLabel")}
              </button>
            </div>

            <div style={messagesAreaStyle}>
              {loadingGroupMessages ? (
                <p style={{ color: "#888", textAlign: "center" }}>{t("common.loading")}</p>
              ) : groupMessages.length === 0 ? (
                <p style={{ color: "#888", textAlign: "center" }}>{t("chat.noGroupMessages")}</p>
              ) : (
                groupMessages.map((m) => {
                  const isMine = m.sender_id === profile.id;
                  const senderName = (m.sender as { full_name: string } | undefined)?.full_name || "—";
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                      <div style={{ ...bubbleBaseStyle, background: isMine ? "#2563eb" : "#f3f4f6", color: isMine ? "#fff" : "#111827" }}>
                        {!isMine && (
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: isMine ? "rgba(255,255,255,0.85)" : "#3B82F6" }}>
                            {senderName}
                          </div>
                        )}
                        {m.content && <div>{m.content}</div>}
                        {m.storage_path && m.file_name && (
                          <AttachmentBubble
                            storagePath={m.storage_path}
                            fileName={m.file_name}
                            fileSize={m.file_size || 0}
                            mimeType={m.mime_type || ""}
                            isMine={isMine}
                          />
                        )}
                        <div style={{ fontSize: 11, marginTop: 4, color: isMine ? "rgba(255,255,255,0.7)" : "#9ca3af", textAlign: "right" }}>
                          {new Date(m.created_at).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div style={{ padding: "8px 20px", background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
                {chatError}
                <button onClick={() => setChatError("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#991B1B" }}>&times;</button>
              </div>
            )}
            {pendingGroupFile && (
              <div style={pendingFileBarStyle}>
                <span style={{ fontSize: 14 }}>📎 {pendingGroupFile.name} ({formatFileSize(pendingGroupFile.size)})</span>
                <button onClick={() => { setPendingGroupFile(null); if (groupFileInputRef.current) groupFileInputRef.current.value = ""; }} style={removePendingBtnStyle}>&times;</button>
              </div>
            )}
            <form onSubmit={handleSendGroupMsg} style={inputAreaStyle}>
              <input type="file" ref={groupFileInputRef} style={{ display: "none" }} onChange={(e) => { if (e.target.files?.[0]) setPendingGroupFile(e.target.files[0]); }} />
              <button type="button" onClick={() => groupFileInputRef.current?.click()} style={attachBtnStyle} title={t("chat.attachFile")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <input type="text" value={newGroupMessage} onChange={(e) => setNewGroupMessage(e.target.value)} placeholder={t("chat.groupMessagePlaceholder")} style={inputStyle} autoFocus />
              <button type="submit" disabled={sendingGroup || uploading || (!newGroupMessage.trim() && !pendingGroupFile)} style={sendBtnStyle}>{uploading ? t("chat.uploading") : sendingGroup ? "..." : t("chat.send")}</button>
            </form>
          </>
        )}
      </div>

      {/* === Create Group Modal === */}
      {showCreateGroup && (
        <div style={overlayStyle} onClick={() => setShowCreateGroup(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{t("chat.newGroup")}</h3>
              <button onClick={() => setShowCreateGroup(false)} style={closeBtnStyle}>&times;</button>
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
                {contacts.map((c) => (
                  <label key={c.id} style={memberItemStyle}>
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(c.id)}
                      onChange={() => toggleMember(c.id)}
                      style={{ marginRight: 8 }}
                    />
                    <span>{c.full_name}</span>
                    <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 6 }}>
                      ({t(`chat.roles.${c.role}`, c.role)})
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowCreateGroup(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
                <button type="submit" disabled={creatingGroup || !groupName.trim()} style={submitBtnStyle}>
                  {creatingGroup ? t("common.creating") : t("common.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === Group Members Modal === */}
      {showGroupMembers && selectedGroup && (
        <div style={overlayStyle} onClick={() => setShowGroupMembers(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{t("chat.membersTitle", { name: selectedGroup.name })}</h3>
              <button onClick={() => setShowGroupMembers(false)} style={closeBtnStyle}>&times;</button>
            </div>

            {/* Current members */}
            <div style={{ marginBottom: 16 }}>
              {groupMembers.map((m) => {
                const p = m.profile as { full_name: string; role: string } | undefined;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{p?.full_name || "—"}</span>
                      <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 8 }}>{t(`chat.roles.${p?.role || ""}`, p?.role || "")}</span>
                    </div>
                    {canManageGroup(selectedGroup) && m.profile_id !== profile.id && (
                      <button onClick={() => handleRemoveMember(m.profile_id)} style={{ ...deleteBtnSmall, fontSize: 12 }}>
                        {t("chat.remove")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add members */}
            {canManageGroup(selectedGroup) && (
              <>
                <label style={labelStyle}>{t("chat.addMember")}</label>
                <div style={memberListStyle}>
                  {contacts
                    .filter((c) => !groupMembers.some((m) => m.profile_id === c.id))
                    .map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 4px" }}>
                        <span style={{ fontSize: 14 }}>
                          {c.full_name}
                          <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 6 }}>({t(`chat.roles.${c.role}`, c.role)})</span>
                        </span>
                        <button onClick={() => handleAddMember(c.id)} style={addMemberBtnStyle}>+</button>
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

// ============================================================
// Styles
// ============================================================

const sidebarStyle: React.CSSProperties = {
  width: 300,
  borderRight: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  background: "#fafafa",
};

const sidebarHeaderStyle: React.CSSProperties = {
  padding: "16px",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  alignItems: "center",
  gap: 12,
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
};

const roleSelectStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
  boxSizing: "border-box",
};

const createGroupBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 0",
  fontSize: 13,
  fontWeight: 500,
  background: "#3B82F6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const contactItemStyle: React.CSSProperties = {
  padding: "12px 16px",
  cursor: "pointer",
  borderBottom: "1px solid #f3f4f6",
  transition: "background 0.15s",
};

const chatPanelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
};

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#9ca3af",
  fontSize: 16,
};

const chatHeaderStyle: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 16,
};

const messagesAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 20,
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
  padding: 16,
  borderTop: "1px solid #e5e7eb",
  display: "flex",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  outline: "none",
};

const sendBtnStyle: React.CSSProperties = {
  padding: "10px 24px",
  fontSize: 15,
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  whiteSpace: "nowrap",
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
  background: "rgba(0,0,0,0.4)",
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
