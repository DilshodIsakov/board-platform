import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "./lib/supabaseClient";
import { getMyProfile, getMyOrg, type Profile, type Organization } from "./lib/profile";
import type { User } from "@supabase/supabase-js";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import ConfirmEmailPage from "./pages/ConfirmEmailPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import DashboardPage from "./pages/DashboardPage";
import MeetingPage from "./pages/MeetingPage";
import ChatPage from "./pages/ChatPage";
import CalendarPage from "./pages/CalendarPage";
import DocumentsPage from "./pages/DocumentsPage";
import ProtocolPage from "./pages/ProtocolPage";
import StatsPage from "./pages/StatsPage";
import CompanyInfoPage from "./pages/CompanyInfoPage";
import VotingPage from "./pages/VotingPage";
import ProtocolsPage from "./pages/ProtocolsPage";
import NSMeetingsPage from "./pages/NSMeetingsPage";
import VideoConferencePage from "./pages/VideoConferencePage";
import ShareholderMeetingPage from "./pages/ShareholderMeetingPage";
import TasksListPage from "./pages/TasksListPage";
import TaskDetailsPage from "./pages/TaskDetailsPage";
import BoardWorkPlanPage from "./pages/BoardWorkPlanPage";
import i18n from "./i18n";

export default function App() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileAndOrg = async () => {
    try {
      const [p, o] = await Promise.all([getMyProfile(), getMyOrg()]);
      console.log("[DEBUG] Loaded profile:", p);
      console.log("[DEBUG] Profile role:", p?.role);
      setProfile(p);
      // Sync locale from profile
      if (p?.created_at && p.created_at !== i18n.language) {
        // Try to load locale from localStorage or user preferences
        const savedLocale = localStorage.getItem("locale");
        if (savedLocale && savedLocale !== i18n.language) {
          i18n.changeLanguage(savedLocale);
        }
      }
      setOrg(o);
    } catch (e) {
      console.error("loadProfileAndOrg error:", e);
      setProfile(null);
      setOrg(null);
    }
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Board Platform] auth event:", event, session?.user?.email ?? "no user");

      const u = session?.user ?? null;
      setUser(u);

      // Remove loading immediately — don't wait for profile load
      setLoading(false);

      if (u) {
        // Load profile in background — don't block render
        loadProfileAndOrg();
      } else {
        setProfile(null);
        setOrg(null);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#9CA3AF" }}>
        {t("common.loading")}
      </div>
    );
  }

  // Auth guard helper
  const auth = (page: React.ReactNode) =>
    user ? (
      profile ? (
        <Layout profile={profile} org={org} onSignOut={handleSignOut}>
          {page}
        </Layout>
      ) : (
        <ConfirmEmailPage user={user} />
      )
    ) : (
      <Navigate to="/login" replace />
    );

  // Admin guard helper - only show if user is admin
  const adminAuth = (page: React.ReactNode) =>
    user && profile && profile.role === "admin" ? (
      <Layout profile={profile} org={org} onSignOut={handleSignOut}>
        {page}
      </Layout>
    ) : user && profile ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate to="/login" replace />
    );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/" element={auth(<DashboardPage user={user!} profile={profile} org={org} />)} />
        <Route path="/meetings/:id" element={auth(<MeetingPage profile={profile} org={org} />)} />
        <Route path="/chat" element={auth(<ChatPage profile={profile} org={org} />)} />
        <Route path="/calendar" element={auth(<CalendarPage profile={profile} org={org} />)} />
        <Route path="/documents" element={auth(<DocumentsPage profile={profile} org={org} />)} />
        <Route path="/meetings/:id/protocol" element={auth(<ProtocolPage profile={profile} org={org} />)} />
        <Route path="/stats" element={auth(<StatsPage profile={profile} org={org} />)} />
        <Route path="/company" element={auth(<CompanyInfoPage profile={profile} org={org} />)} />
        <Route path="/voting" element={auth(<VotingPage profile={profile} org={org} />)} />
        <Route path="/protocols" element={auth(<ProtocolsPage profile={profile} org={org} />)} />
        <Route path="/ns-meetings" element={auth(<NSMeetingsPage profile={profile} org={org} />)} />
        <Route path="/videoconference" element={auth(<VideoConferencePage profile={profile} org={org} />)} />
        <Route path="/shareholder-meeting" element={auth(<ShareholderMeetingPage profile={profile} org={org} />)} />
        <Route path="/tasks" element={auth(<TasksListPage profile={profile} org={org} />)} />
        <Route path="/tasks/:id" element={auth(<TaskDetailsPage profile={profile} org={org} />)} />
        <Route path="/board-work-plan" element={auth(<BoardWorkPlanPage profile={profile} org={org} />)} />
        <Route path="/admin/users" element={adminAuth(<AdminUsersPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
