# User Flows & Testing Guide

## User Journey Maps

### 1. New User Registration Flow

```
┌─────────────────────┐
│   User Signs Up     │
│  (Email + Password) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Confirmation Email │
│      Sent           │
│ (auth.users created)│
│ ⚠️  NO PROFILE YET  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  User Clicks Link   │
│  in Email           │
│ (email_confirmed_at │
│  set to NOW())      │
└──────────┬──────────┘
           │
           ▼ TRIGGER FIRES
┌─────────────────────┐
│ Trigger Creates     │
│ Profile Record      │
│ role = 'board_mbr'  │
│ ✅ PROFILE READY    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ User Logs In        │
│ (gets profile data) │
│ ✓ Sees App UI       │
└─────────────────────┘
```

### 2. Admin User Role Assignment Flow

```
┌──────────────────────┐
│ Admin Logs In        │
│ role = 'admin'       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Sidebar Shows       │
│ "Управление         │
│  пользователями"     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Admin Clicks Link    │
│ → /admin/users       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Page Loads:          │
│ - Table of users     │
│ - Their roles        │
│ - Created dates      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Admin Selects New    │
│ Role from Dropdown   │
│ (e.g., 'admin')      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Click Save/Confirm   │
│ updateUserRole()     │
│ calls Supabase       │
└──────────┬───────────┘
           │
           ▼ RLS CHECK:
           │ Is caller admin?
           ▼
┌──────────────────────┐
│ ✓ YES: Update        │
│   succeeds, UI       │
│   refreshes, new     │
│   role shows         │
└──────────────────────┘
```

### 3. Login with Unconfirmed Email Flow

```
┌──────────────────────┐
│ User Has Signed Up   │
│ But NOT Confirmed    │
│ Email Yet            │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Go to /login         │
│ Enter credentials    │
│ Click Sign In        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Auth state changes:  │
│ ✓ user exists        │
│ ✗ profile = null     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│     APP SHOWS:       │
│  ConfirmEmailPage    │
│  "Подтвердите и-мейл"│
│  Displays email addr │
│ [Resend Email Button]│
└──────────┬───────────┘
           │ User clicks
           │ "Resend Email"
           ▼
┌──────────────────────┐
│  resend() called     │
│ New email sent       │
│ "Письмо отправлено" │
│  message shows       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ User confirms email  │
│ (clicks link)        │
│ ✓ Trigger fires,     │
│   profile created    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ User Refreshes Page  │
│ (F5)                 │
│ profile loads        │
│ → Normal app UI      │
└──────────────────────┘
```

### 4. Non-Admin Accessing Admin Route

```
┌──────────────────────┐
│ Non-Admin User       │
│ Logs In              │
│ role = 'board_member'│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ User Tries To Access │
│ /admin/users         │
│ (directly in URL)    │
└──────────┬───────────┘
           │
           ▼ adminAuth
           │ guard checks:
           │ profile.role === 'admin'?
           ▼
┌──────────────────────┐
│ ✗ NO: Redirect to /  │
│ (back to dashboard)  │
│ URL bar shows /      │
└──────────────────────┘
```

---

## Testing Scenarios

### Scenario 1: Test Email Confirmation Trigger

**Prerequisites**: Access to Supabase dashboard

**Steps**:
1. Create new user in Supabase Auth:
   - Email: `test1@example.com`
   - Password: `TempPassword123!`
2. Check SQL Editor: `SELECT * FROM auth.users WHERE email = 'test1@example.com';`
   - Should see: `email_confirmed_at = NULL`
3. Check profiles table: `SELECT * FROM public.profiles WHERE email = 'test1@example.com';`
   - Should be: EMPTY (no profile yet)
4. In API/SQL Editor, mark email as confirmed:
   ```sql
   UPDATE auth.users 
   SET email_confirmed_at = NOW()
   WHERE email = 'test1@example.com';
   ```
5. Check profiles table again:
   ```sql
   SELECT * FROM public.profiles WHERE email = 'test1@example.com';
   ```
   - Should NOW show: 1 row with role='board_member'

✅ Trigger working correctly!

---

### Scenario 2: Test ConfirmEmailPage Display

**Prerequisites**: Browser, local dev server running

**Steps**:
1. Create user in Supabase (but don't confirm email)
2. Open app at http://localhost:5173
3. Click "Sign In"
4. Enter credentials
5. **Expected**: See `ConfirmEmailPage` with:
   - Email address displayed
   - "Resend confirmation email" button
6. Click "Resend Email" button
7. **Expected**: Success message appears briefly
8. Go to Supabase → Auth → Confirm the email manually
9. Refresh page (F5)
10. **Expected**: Normal app UI loads, no ConfirmEmailPage

✅ Email confirmation flow working!

---

### Scenario 3: Test Admin Role Assignment

**Prerequisites**: 
- User 1: role = 'board_member'
- User 2: role = 'admin'
- Both confirmed emails

**Steps**:
1. Login as User 2 (admin)
2. Check sidebar: Should see "Управление пользователями"
3. Click that menu item
4. **Expected**: See /admin/users page with table
5. Table should show User 1 with role='board_member'
6. Click dropdown next to User 1's role
7. Select 'admin'
8. **Expected**: Loading state briefly, then table updates
9. Go to Supabase: `SELECT * FROM public.profiles WHERE email = 'user1@...';`
10. **Expected**: role should be 'admin' now

✅ Role assignment working via UI!

---

### Scenario 4: Test RLS - Admin Can Update Role

**Prerequisites**: Admin user logged in, browser console open

**Steps**:
1. Open Developer Tools → Console
2. Run:
   ```javascript
   const { data, error } = await supabase
     .from('profiles')
     .update({ role: 'board_member' })
     .eq('id', 'other-user-uuid')
   console.log({ data, error })
   ```
3. As admin, this should succeed (error = null)
4. Check Supabase to verify role changed

✅ Admin RLS policy working!

---

### Scenario 5: Test RLS - Non-Admin Can't Update Role

**Prerequisites**: Non-admin user logged in, browser console open

**Steps**:
1. Login as non-admin user
2. Open Developer Tools → Console
3. Run:
   ```javascript
   const { data, error } = await supabase
     .from('profiles')
     .update({ role: 'admin' })
     .eq('id', 'admin-user-uuid')
   console.log({ data, error })
   ```
4. Should get error: `"violates row level security policy"`
5. Go to Supabase to verify role was NOT changed

✅ RLS preventing unauthorized role changes!

---

### Scenario 6: Test Access Control on /admin/users

**Prerequisites**: Non-admin user session

**Steps**:
1. Login as non-admin user
2. Try accessing: http://localhost:5173/admin/users
3. **Expected**: Redirect to http://localhost:5173/
4. Sidebar should NOT show "Управление пользователями"

✅ Admin page access control working!

---

### Scenario 7: Test User Can Update Own Profile (Not Role)

**Prerequisites**: Non-admin user, browser console

**Steps**:
1. Login as non-admin user
2. Get your UUID (check Network tab or console)
3. Try update own full_name:
   ```javascript
   const { data, error } = await supabase
     .from('profiles')
     .update({ full_name: 'New Name' })
     .eq('id', auth.currentUser.id)
   console.log({ data, error })
   ```
4. **Expected**: Success (no error)
5. Try to update own role:
   ```javascript
   const { data, error } = await supabase
     .from('profiles')
     .update({ role: 'admin' })
     .eq('id', auth.currentUser.id)
   console.log({ data, error })
   ```
6. **Expected**: Also succeeds (RLS doesn't prevent this, but app UI prevents it)

✅ User can update own profile!

---

## Checklist for Sign-Off

Use this to verify everything is working:

### Database Setup
- [ ] SQL migration applied to Supabase
- [ ] `user_role` enum exists with 4 values
- [ ] `profiles` table has correct columns
- [ ] Trigger `on_auth_user_email_confirmed` exists
- [ ] 3 RLS policies exist on profiles table
- [ ] No RLS errors in Supabase logs

### App Functionality
- [ ] `npm run build` passes
- [ ] App starts: `npm run dev`
- [ ] Login page loads
- [ ] New signup works
- [ ] Email not confirmed → See `ConfirmEmailPage`
- [ ] Email confirmed → Profile created automatically
- [ ] Login succeeds → See normal app UI
- [ ] Admin can see "/admin/users" in sidebar
- [ ] Admin can access /admin/users page
- [ ] Non-admin can't access /admin/users
- [ ] Admin can change user roles via dropdown
- [ ] Role changes persist (check Supabase)

### RLS Security
- [ ] Non-admin can't call updateUserRole()
- [ ] Non-admin can't update other user's profile
- [ ] Non-admin can update own full_name
- [ ] All authenticated users can SELECT all profiles

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Profile doesn't create after email confirm | Trigger not running | Check: `SELECT * FROM pg_trigger WHERE tgname LIKE '%email%'` |
| ConfirmEmailPage always shows | Profile load failing | Check: Browser console for fetch errors |
| Admin menu not visible | User's role not exactly 'admin' | Check Supabase: `SELECT role FROM profiles WHERE ...` |
| Can't access /admin/users as admin | adminAuth guard issue | Hard refresh browser (Ctrl+Shift+R) |
| RLS policy "denied" error | Calling user doesn't have profile | Confirm email first, profile must exist |

---

## Example SQL Review Commands

Run these in Supabase SQL Editor to verify setup:

```sql
-- Review profiles table structure
\d public.profiles

-- Check existing policies
SELECT policyname, qual FROM pg_policies WHERE tablename = 'profiles';

-- Check trigger
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_email_confirmed';

-- Test a user
SELECT id, email, full_name, role, created_at 
FROM public.profiles 
LIMIT 5;

-- Check enum values
SELECT enum_range(NULL::public.user_role);

-- Count admins
SELECT COUNT(*) as admin_count FROM public.profiles WHERE role = 'admin';
```

---

**Last Updated**: 2026-03-05  
**Test Status**: Ready for QA Testing
