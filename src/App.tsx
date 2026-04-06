import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "./lib/supabaseClient";
import { getMyProfile, getMyOrg, type Profile, type Organization } from "./lib/profile";
import type { User } from "@supabase/supabase-js";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import ConfirmEmailPage from "./pages/ConfirmEmailPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import SetPasswordPage from "./pages/SetPasswordPage";
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
import NSMeetingDetailsPage from "./pages/NSMeetingDetailsPage";
import VideoConferencePage from "./pages/VideoConferencePage";
import ShareholderMeetingPage from "./pages/ShareholderMeetingPage";
import TasksListPage from "./pages/TasksListPage";
import TaskDetailsPage from "./pages/TaskDetailsPage";
import BoardWorkPlanPage from "./pages/BoardWorkPlanPage";
import ProfilePage from "./pages/ProfilePage";
import UserProfilePage from "./pages/UserProfilePage";
import NotificationsPage from "./pages/NotificationsPage";
import AuditLogPage from "./pages/AuditLogPage";
import CommitteesPage from "./pages/CommitteesPage";
import CommitteeMeetingsPage from "./pages/CommitteeMeetingsPage";
import CommitteeMeetingDetailsPage from "./pages/CommitteeMeetingDetailsPage";
import RegulationsPage from "./pages/RegulationsPage";
import { logAuditEvent } from "./lib/auditLog";
import i18n from "./i18n";

export default function App() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  // Track whether we've done the initial profile load.
  // After the first successful load, we NEVER show the loading screen again,
  // because that unmounts the entire page tree (Layout + page component),
  // destroying all React state: open modals, form inputs, scroll position, etc.
  const profileLoadedRef = useRef(false);

  const loadProfileAndOrg = async () => {
    if (!profileLoadedRef.current) {
      setProfileLoading(true);
    }
    try {
      const [p, o] = await Promise.all([getMyProfile(), getMyOrg()]);
      // Stabilize references: only update if the identity actually changed.
      // This prevents cascading re-renders in child components that depend
      // on profile/org via useEffect — a new object reference with the same
      // data would re-trigger every [profile]-dependent effect, reloading
      // data and resetting UI state across all pages.
      setProfile((prev) => {
        if (prev?.id === p?.id) return prev;
        return p;
      });
      setOrg((prev) => {
        if (prev?.id === o?.id) return prev;
        return o;
      });
      profileLoadedRef.current = true;
      // Sync locale from profile
      const savedLocale = localStorage.getItem("locale");
      if (savedLocale && savedLocale !== i18n.language) {
        i18n.changeLanguage(savedLocale);
      }
    } catch (e) {
      console.error("loadProfileAndOrg error:", e);
      setProfile(null);
      setOrg(null);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Board Platform] auth event:", event, session?.user?.email ?? "no user");

      const u = session?.user ?? null;

      // Only update user state when the identity actually changes.
      // TOKEN_REFRESHED fires on every tab refocus and creates a new User
      // object reference — calling setUser(u) would trigger a full App
      // re-render, cascading new props to all pages and causing visible
      // UI reset (selected meeting lost, modals closed, forms cleared).
      setUser((prev) => {
        if (prev?.id === u?.id) return prev;
        return u;
      });

      setLoading(false);

      // Only load profile on actual sign-in or initial load.
      // TOKEN_REFRESHED fires silently on window refocus and must NOT trigger
      // profile reload — that would create a new object reference, re-run all
      // useEffect([profile]) hooks, and reset page UI state.
      // Also skip if profile is already loaded for the same user — Supabase
      // can fire SIGNED_IN on tab refocus even for existing sessions.
      // Handle password recovery flow (invited user setting password or password reset)
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }

      if (u && (event === "SIGNED_IN" || event === "INITIAL_SESSION") && !profileLoadedRef.current) {
        loadProfileAndOrg();
        // Log login event to audit log
        if (event === "SIGNED_IN") {
          logAuditEvent({ actionType: "login", actionLabel: "Login" });
        }
      } else if (!u) {
        setProfile(null);
        setOrg(null);
        profileLoadedRef.current = false;
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await logAuditEvent({ actionType: "logout", actionLabel: "Logout" });
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
      profileLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#9CA3AF" }}>
          {t("common.loading")}
        </div>
      ) : profile ? (
        profile.approval_status === "approved" ? (
          <Layout profile={profile} org={org} onSignOut={handleSignOut}>
            {page}
          </Layout>
        ) : (
          <PendingApprovalPage onRefresh={() => {
            profileLoadedRef.current = false;
            loadProfileAndOrg();
          }} />
        )
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
        <Route path="/set-password" element={passwordRecovery ? <SetPasswordPage /> : <Navigate to="/" replace />} />
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
        <Route path="/ns-meetings/:id" element={auth(<NSMeetingDetailsPage profile={profile} org={org} />)} />
        <Route path="/videoconference" element={auth(<VideoConferencePage profile={profile} org={org} />)} />
        <Route path="/shareholder-meeting" element={auth(<ShareholderMeetingPage profile={profile} org={org} />)} />
        <Route path="/tasks" element={auth(<TasksListPage profile={profile} org={org} />)} />
        <Route path="/tasks/:id" element={auth(<TaskDetailsPage profile={profile} org={org} />)} />
        <Route path="/board-work-plan" element={auth(<BoardWorkPlanPage profile={profile} org={org} />)} />
        <Route path="/profile" element={auth(<ProfilePage profile={profile} org={org} onProfileUpdate={() => loadProfileAndOrg()} />)} />
        <Route path="/profile/:id" element={auth(<UserProfilePage currentProfile={profile} />)} />
        <Route path="/notifications" element={auth(<NotificationsPage profile={profile} org={org} />)} />
        <Route path="/audit-log" element={auth(<AuditLogPage profile={profile} org={org} />)} />
        <Route path="/committees" element={auth(<CommitteesPage profile={profile} org={org} />)} />
        <Route path="/committees/:id" element={auth(<CommitteeMeetingsPage profile={profile} org={org} />)} />
        <Route path="/committees/:id/meetings/:meetingId" element={auth(<CommitteeMeetingDetailsPage profile={profile} org={org} />)} />
        <Route path="/regulations" element={auth(<RegulationsPage profile={profile} org={org} />)} />
        <Route path="/admin/users" element={adminAuth(<AdminUsersPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
