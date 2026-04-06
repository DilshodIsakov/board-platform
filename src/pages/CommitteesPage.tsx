import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import { getAllProfiles, getLocalizedName } from "../lib/profile";
import {
  fetchCommittees,
  fetchCommitteeMembers,
  addCommitteeMember,
  removeCommitteeMember,
  updateCommitteeMemberRole,
  committeeTypeIcon,
  committeeTypeColor,
  type Committee,
  type CommitteeMember,
} from "../lib/committees";
import { getLocalizedField } from "../lib/i18nHelpers";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function CommitteesPage({ profile }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, CommitteeMember[]>>({});
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [managingId, setManagingId] = useState<string | null>(null);
  const [addingProfileId, setAddingProfileId] = useState("");
  const [addingRole, setAddingRole] = useState<"chair" | "member">("member");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [cList, profiles] = await Promise.all([fetchCommittees(), getAllProfiles()]);
    setCommittees(cList);
    setAllProfiles(profiles);
    const mMap: Record<string, CommitteeMember[]> = {};
    await Promise.all(cList.map(async (c) => { mMap[c.id] = await fetchCommitteeMembers(c.id); }));
    setMembersMap(mMap);
    setLoading(false);
  };

  const handleAddMember = async (committeeId: string) => {
    if (!addingProfileId) return;
    setSaving(true);
    await addCommitteeMember(committeeId, addingProfileId, addingRole);
    const updated = await fetchCommitteeMembers(committeeId);
    setMembersMap((prev) => ({ ...prev, [committeeId]: updated }));
    setAddingProfileId("");
    setAddingRole("member");
    setSaving(false);
  };

  const handleRemoveMember = async (committeeId: string, profileId: string) => {
    await removeCommitteeMember(committeeId, profileId);
    const updated = await fetchCommitteeMembers(committeeId);
    setMembersMap((prev) => ({ ...prev, [committeeId]: updated }));
  };

  const handleChangeRole = async (committeeId: string, profileId: string, role: "chair" | "member") => {
    await updateCommitteeMemberRole(committeeId, profileId, role);
    const updated = await fetchCommitteeMembers(committeeId);
    setMembersMap((prev) => ({ ...prev, [committeeId]: updated }));
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#9CA3AF" }}>
      {t("common.loading")}
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#111827", margin: 0 }}>
          {t("committees.title")}
        </h1>
        <p style={{ color: "#6B7280", fontSize: 14, margin: "6px 0 0" }}>
          {t("committees.subtitle")}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
        {committees.map((c) => {
          const members = membersMap[c.id] || [];
          const chair = members.find((m) => m.role === "chair");
          const color = committeeTypeColor(c.type);
          const icon = committeeTypeIcon(c.type);
          const name = getLocalizedField(c as unknown as Record<string, unknown>, "name");
          const description = getLocalizedField(c as unknown as Record<string, unknown>, "description");
          const isManaging = managingId === c.id;
          const isMember = members.some((m) => m.profile_id === profile?.id);
          const myRole = members.find((m) => m.profile_id === profile?.id)?.role;

          return (
            <div key={c.id} style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderTop: `3px solid ${color}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}>
              {/* Card header */}
              <div style={{ padding: "18px 22px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                      {name}
                    </h2>
                  </div>
                  {myRole === "chair" && (
                    <span style={{
                      flexShrink: 0, marginLeft: 8,
                      fontSize: 11, fontWeight: 600, padding: "2px 9px",
                      borderRadius: 10, background: color + "18", color,
                    }}>
                      {t("committees.roleChair")}
                    </span>
                  )}
                </div>

                {description && (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
                    {description}
                  </p>
                )}

                {/* View meetings button */}
                <button
                  onClick={() => navigate(`/committees/${c.id}`)}
                  style={{
                    marginTop: 14, width: "100%",
                    background: "#F9FAFB", border: `1px solid #E5E7EB`,
                    color: color, borderRadius: 8,
                    padding: "8px 14px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = color + "0E")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F9FAFB")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {t("committees.viewMeetings")}
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#F3F4F6" }} />

              {/* Members section */}
              <div style={{ padding: "14px 22px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("committees.members")} ({members.length})
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => { setManagingId(isManaging ? null : c.id); setAddingProfileId(""); setAddingRole("member"); }}
                      style={{ fontSize: 12, color: isManaging ? "#6B7280" : color, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                    >
                      {isManaging ? t("common.close") : t("committees.manage")}
                    </button>
                  )}
                </div>

                {members.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#D1D5DB", margin: 0 }}>{t("committees.noMembers")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {members.map((m) => {
                      const p = m.profile;
                      const displayName = p ? getLocalizedName(p, i18n.language) || p.full_name || "—" : "—";
                      return (
                        <div key={m.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 8px", borderRadius: 8,
                          background: m.role === "chair" ? "#F9FAFB" : "transparent",
                        }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                            background: color + "18", color,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: m.role === "chair" ? 600 : 400, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {displayName}
                            </div>
                          </div>
                          {m.role === "chair" && (
                            <span style={{ fontSize: 11, color, fontWeight: 500, flexShrink: 0 }}>
                              {t("committees.roleChair")}
                            </span>
                          )}
                          {isAdmin && isManaging && (
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                              <select
                                value={m.role}
                                onChange={(e) => handleChangeRole(c.id, m.profile_id, e.target.value as "chair" | "member")}
                                style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid #D1D5DB", background: "#fff" }}
                              >
                                <option value="member">{t("committees.roleMember")}</option>
                                <option value="chair">{t("committees.roleChair")}</option>
                              </select>
                              <button
                                onClick={() => handleRemoveMember(c.id, m.profile_id)}
                                style={{ fontSize: 12, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
                              >✕</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add member form */}
                {isAdmin && isManaging && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <select
                      value={addingProfileId}
                      onChange={(e) => setAddingProfileId(e.target.value)}
                      style={{ flex: 1, minWidth: 130, fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff" }}
                    >
                      <option value="">{t("committees.selectMember")}</option>
                      {allProfiles
                        .filter((p) => !members.some((m) => m.profile_id === p.id))
                        .map((p) => <option key={p.id} value={p.id}>{getLocalizedName(p, i18n.language) || p.full_name || p.email}</option>)}
                    </select>
                    <select
                      value={addingRole}
                      onChange={(e) => setAddingRole(e.target.value as "chair" | "member")}
                      style={{ fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff" }}
                    >
                      <option value="member">{t("committees.roleMember")}</option>
                      <option value="chair">{t("committees.roleChair")}</option>
                    </select>
                    <button
                      onClick={() => handleAddMember(c.id)}
                      disabled={!addingProfileId || saving}
                      style={{
                        padding: "6px 14px", fontSize: 13, fontWeight: 600,
                        background: color, color: "#fff", border: "none",
                        borderRadius: 8, cursor: addingProfileId ? "pointer" : "not-allowed",
                        opacity: addingProfileId ? 1 : 0.5,
                      }}
                    >
                      {t("committees.addMember")}
                    </button>
                  </div>
                )}

                {/* Footer */}
                {!isManaging && (
                  <div style={{ marginTop: members.length > 0 ? 10 : 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {chair ? (
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                        {t("committees.chair")}: <span style={{ fontWeight: 600, color: "#374151" }}>{chair.profile?.full_name}</span>
                      </div>
                    ) : <span />}
                    {!isMember && !isAdmin && (
                      <div style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>{t("committees.notMember")}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
