import { useEffect, useState } from "react";
import { getAllProfiles, updateUserRole, type Profile } from "../lib/profile";

const roleOptions: Array<Profile["role"]> = ["admin", "corp_secretary", "board_member", "management"];

const roleLabels: Record<Profile["role"], string> = {
  admin: "Администратор",
  corp_secretary: "Секретарь",
  board_member: "Член совета",
  management: "Менеджмент",
};

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    const data = await getAllProfiles();
    setProfiles(data);
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: Profile["role"]) => {
    setUpdating(userId);
    const success = await updateUserRole(userId, newRole);
    if (success) {
      setProfiles(profiles.map(p => p.id === userId ? { ...p, role: newRole } : p));
      setError("");
    } else {
      setError("Ошибка при обновлении роли");
    }
    setUpdating(null);
  };

  if (loading) {
    return (
      <div style={{ color: "#9CA3AF" }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Управление пользователями</h1>
      <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 20px" }}>
        Просмотр и изменение ролей пользователей
      </p>

      {error && (
        <div style={{
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: 8,
          padding: 12,
          color: "#DC2626",
          fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {profiles.length === 0 ? (
        <p style={{ color: "#9CA3AF" }}>Нет пользователей</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            <thead>
              <tr style={{ background: "#F3F4F6", borderBottom: "1px solid #E5E7EB" }}>
                <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 600, color: "#6B7280" }}>Email</th>
                <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 600, color: "#6B7280" }}>ФИО</th>
                <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 600, color: "#6B7280" }}>Роль</th>
                <th style={{ padding: 12, textAlign: "left", fontSize: 13, fontWeight: 600, color: "#6B7280" }}>Дата создания</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <td style={{ padding: 12, fontSize: 14, color: "#111827" }}>{profile.email}</td>
                  <td style={{ padding: 12, fontSize: 14, color: "#111827" }}>{profile.full_name || "—"}</td>
                  <td style={{ padding: 12 }}>
                    <select
                      value={profile.role}
                      onChange={(e) => handleRoleChange(profile.id, e.target.value as Profile["role"])}
                      disabled={updating === profile.id}
                      style={{
                        padding: "6px 10px",
                        fontSize: 13,
                        border: "1px solid #D1D5DB",
                        borderRadius: 4,
                        background: "#fff",
                        cursor: updating === profile.id ? "not-allowed" : "pointer",
                        opacity: updating === profile.id ? 0.6 : 1,
                      }}
                    >
                      {roleOptions.map(role => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: 12, fontSize: 13, color: "#6B7280" }}>
                    {new Date(profile.created_at).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
