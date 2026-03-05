# Single-Company User Profile + Roles System Implementation

## Overview
This implementation adds a single-company user management system with role-based access control. Users can only get a profile after confirming their email, and admins can manage user roles through the UI.

## 1. SQL Migration (Supabase)

**File**: `supabase/026_single_company_roles.sql`

**Key Features**:
- Creates `user_role` enum with roles: `admin`, `corp_secretary`, `board_member`, `management`
- Replaces the old `profiles` table with a new single-company optimized structure:
  - `id` (UUID, PK) references `auth.users(id)` directly
  - `email` text
  - `full_name` text nullable
  - `role` public.user_role
  - `created_at` & `updated_at` timestamps
- Disables multi-tenant `org_id` requirement
- Creates trigger `on_auth_user_email_confirmed` that:
  - Only inserts profile when `email_confirmed_at` is set to NOT NULL
  - Sets role to `board_member` by default
  - Extracts full_name from `raw_user_meta_data`
- Enables Row-Level Security with policies:
  - **SELECT**: All authenticated users can view all profiles
  - **UPDATE self**: Users can update their own profile (except role)
  - **UPDATE role**: Only admins can change any user's role
- Helper functions:
  - `is_admin()` - Check if current user is admin
  - `get_user_role()` - Get current user's role

**How to Apply**:
1. Open [Supabase Dashboard](https://supabase.com)
2. Go to **SQL Editor**
3. Copy and paste the content of `supabase/026_single_company_roles.sql`
4. Click **Run**
5. Verify no errors appear

## 2. TypeScript/React Code Changes

### Files Modified:

#### `src/lib/profile.ts`
**Changes**:
- Updated `Profile` interface:
  - Removed: `organization_id`, `shares_count`, `locale`
  - Added: `email`, `updated_at`
  - Changed `role` from `string` to type union: `"admin" | "corp_secretary" | "board_member" | "management"`
- Removed: `getMyOrg()` function (returns null for compatibility)
- Updated: `updateProfileLocale()` to empty stub (no-op for compatibility)
- Added: `getAllProfiles()` - fetch all users (admin only via RLS)
- Added: `updateUserRole(userId, role)` - change user role (admin only via RLS)
- Added: `updateMyProfile(updates)` - update own profile fields
- Added: `resendConfirmationEmail(email)` - trigger signup email resend

#### `src/App.tsx`
**Changes**:
- Imported `ConfirmEmailPage` component
- Imported `AdminUsersPage` component
- Updated auth guard to check if profile exists:
  - If user logged in + profile doesn't exist → show `ConfirmEmailPage`
  - If user logged in + profile exists → show normal layout
- Added `adminAuth` guard for protected admin routes
- Added route: `<Route path="/admin/users" element={adminAuth(<AdminUsersPage />)} />`

#### `src/pages/ConfirmEmailPage.tsx` (NEW)
**Purpose**: Show email confirmation prompt when user is logged in but profile not created
**Features**:
- Displays email address
- "Resend confirmation email" button
- Success message on resend
- Friendly instructions to check spam folder
- Auto-refresh prompt

#### `src/pages/AdminUsersPage.tsx` (NEW)
**Purpose**: Admin panel for managing user roles
**Features**:
- Table view of all users (email, full_name, role, created_at)
- Dropdown to change role per user
- Real-time updates
- Error messages on failed updates
- Loading state

#### `src/components/Layout.tsx`
**Changes**:
- Fixed `full_name` null handling in user avatar: `profile.full_name || profile.email`

#### `src/components/Sidebar.tsx`
**Changes**:
- Added admin-only menu item "Управление пользователями"
- Shows `/admin/users` link only if `profile.role === "admin"`
- Fixed `full_name` null handling: `profile.full_name || profile.email`

#### `src/pages/ChatPage.tsx`
**Changes**:
- Fixed `uploadChatFile()` call: use `"default"` instead of `profile.organization_id`
- Removed `profile.role === "chairman"` check (role doesn't exist in new enum)

#### `src/pages/NSMeetingsPage.tsx`
**Changes**:
- Removed `profile?.role === "chairman"` check
- Simplified: `const isAdmin = profile?.role === "admin"`

#### `src/pages/ShareholderMeetingPage.tsx`
**Changes**:
- Replaced `profile.shares_count` with `0` (temporary, TODO: fetch from shareholder table)
- Added comment for future implementation

### Files NOT Modified:
- `package.json` - No new dependencies required
- Routing configuration - Only added new route
- Other components - No breaking changes

## 3. How It Works (User Flow)

### New User Signs Up:
1. User registers with email + password
2. Confirmation email is sent
3. User clicks confirmation link
4. `auth.users.email_confirmed_at` is updated
5. Trigger `on_auth_user_email_confirmed` fires
6. Profile record is automatically created with role `board_member`
7. User can now log in and access the app

### User Logs In:
1. Auth state updated (user exists)
2. App tries to load profile
3. **Case A - Profile exists**: Show normal app layout
4. **Case B - Profile doesn't exist**: Show `ConfirmEmailPage` with email resend option

### Admin Changes User Role:
1. Admin goes to `/admin/users`
2. Table shows all users
3. Admin selects new role from dropdown
4. `updateUserRole()` calls Supabase
5. RLS policy checks: is caller admin?
6. If yes → update succeeds, UI updates
7. If no → error shown (shouldn't happen, route is protected)

## 4. Verification Steps

### A. In Supabase Dashboard:

1. **Check Schema**:
   - SQL Editor → Run: `SELECT * FROM public.profiles LIMIT 1;`
   - Should see: `id`, `email`, `full_name`, `role`, `created_at`, `updated_at`

2. **Check Enum**:
   - Run: `SELECT enum_range(NULL::public.user_role);`
   - Should show: `{admin,corp_secretary,board_member,management}`

3. **Check RLS Enabled**:
   - Table Editor → Select `profiles` table
   - Should see "RLS Enabled" badge

4. **Check Policies**:
   - Click `profiles` table → "Policies" tab
   - Should see:
     - `profiles_select_authenticated`
     - `profiles_update_own_profile`
     - `profiles_update_role_as_admin`

5. **Check Trigger**:
   - SQL Editor → Run: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_email_confirmed';`
   - Should return 1 row

### B. In App (Local Development):

1. **Build Check**:
   ```bash
   npm run build
   ```
   Should complete with ✓ (no errors)

2. **Start Dev Server**:
   ```bash
   npm run dev
   ```

3. **Test Email Confirmation Flow**:
   - Go to `/login`
   - Sign up with any email
   - Should NOT auto-create profile (wait for email confirmation)
   - Without confirming email → try to login → see `ConfirmEmailPage`
   - Confirm email in Supabase Auth panel (Dashboard → Auth Monitoring)
   - Refresh page → profile should load, show normal app

4. **Test Admin Panel**:
   - Manually set one user's role to `admin` in Supabase dashboard
   - Log in as that admin user
   - Should see "Управление пользователями" in sidebar
   - Click it → go to `/admin/users`
   - Table should show all users
   - Change a user's role in dropdown
   - Should update successfully (check DB to verify)

5. **Test RLS Policies**:
   - Log in as non-admin user
   - Try accessing `/admin/users` directly
   - Should redirect to `/` (adminAuth guard)
   - Try in browser console:
     ```javascript
     supabase.from('profiles').update({role: 'admin'}).eq('id', 'other-user-id').then(console.log)
     ```
   - Should fail with RLS policy error

## 5. Troubleshooting

### Profile Not Created After Email Confirmation
- Check: Has trigger `on_auth_user_email_confirmed` been created?
- Check: Is `email_confirmed_at` actually set in `auth.users` table?
- Check: Supabase logs for trigger errors

### Can't See Admin Link in Sidebar
- Verify: User's profile.role is exactly `"admin"` (case-sensitive)
- Verify: Profile exists (check Supabase dashboard)
- Try: Hard refresh (Ctrl+Shift+R)

### RLS Policy Errors
- Ensure user is authenticated (has session)
- Check: Is calling user's profile row present?
- Check: Is user trying to update role (only admins can)?

### Email Not Sending
- Check: Supabase email provider is configured
- Check: Email is in admin's allow list (if in development mode)
- Check: SMTP credentials are correct

## 6. Future Improvements

1. **Shareholder Shares**: Create `shareholder_shares` table to store share counts
2. **Localization**: Add locale field back if needed, store in separate settings table
3. **Organizations**: Re-add multi-tenant support when scaling beyond single company
4. **Audit Log**: Track who changed what roles and when
5. **2FA**: Add two-factor authentication for admin accounts
6. **Role Permissions**: Implement more granular permissions per role

## 7. Implementation Checklist

- [x] SQL migration file created: `supabase/026_single_company_roles.sql`
- [x] Profile interface updated for single-company schema
- [x] ConfirmEmailPage component created
- [x] AdminUsersPage component created
- [x] App.tsx routing updated with admin guard
- [x] Sidebar updated with admin link
- [x] ChatPage.tsx fixed (removed org_id reference)
- [x] NSMeetingsPage.tsx fixed (removed chairman role)
- [x] ShareholderMeetingPage.tsx fixed (removed shares_count)
- [x] Build passes: `npm run build` ✓
- [x] No TypeScript errors remaining

---

**Last Updated**: 2026-03-05  
**Status**: Ready for testing
