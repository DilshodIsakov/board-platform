// Edge Function: admin-users
// Handles user management via Supabase Admin API (service_role).
// Actions: create, invite, approve, reject, delete, reset_password
// Only admins can call this function.
// Deploy: supabase functions deploy admin-users --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Verify caller is admin via their JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    // 2. Parse request
    const body = await req.json();
    const { action } = body;

    // Admin client with service_role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Helper: get the single organization id
    const getOrgId = async (): Promise<string | null> => {
      const { data } = await adminClient.from("organizations").select("id").limit(1).single();
      return data?.id || null;
    };

    // ========== INVITE USER (admin creates, user sets own password) ==========
    if (action === "invite") {
      const { email, full_name, role, role_details } = body;
      if (!email || !role) return json({ error: "email and role required" }, 400);

      const orgId = await getOrgId();
      if (!orgId) return json({ error: "No organization found" }, 500);

      // Create auth user without password, auto-confirm email
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // Create profile with approved status (admin-invited = trusted)
      const { error: profileErr } = await adminClient.from("profiles").upsert({
        id: newUser.user!.id,
        organization_id: orgId,
        email,
        full_name: full_name || null,
        role,
        role_details: role === "admin" ? null : (role_details || null),
        approval_status: "approved",
      }, { onConflict: "id" });

      if (profileErr) {
        await adminClient.auth.admin.deleteUser(newUser.user!.id);
        return json({ error: profileErr.message }, 500);
      }

      // Generate a password recovery link so user can set their password
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (linkErr) {
        console.error("generateLink error:", linkErr);
        // User is created but link failed — admin can use reset_password later
      }

      return json({
        success: true,
        user_id: newUser.user!.id,
        // Return the action link so the frontend/email can use it
        recovery_link: linkData?.properties?.action_link || null,
      });
    }

    // ========== CREATE USER (with password, legacy) ==========
    if (action === "create") {
      const { email, password, full_name, role, role_details } = body;
      if (!email || !password || !role) return json({ error: "email, password, role required" }, 400);

      const orgId = await getOrgId();
      if (!orgId) return json({ error: "No organization found" }, 500);

      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      const { error: profileErr } = await adminClient.from("profiles").upsert({
        id: newUser.user!.id,
        organization_id: orgId,
        email,
        full_name: full_name || null,
        role,
        role_details: role === "admin" ? null : (role_details || null),
        approval_status: "approved",
      }, { onConflict: "id" });

      if (profileErr) {
        await adminClient.auth.admin.deleteUser(newUser.user!.id);
        return json({ error: profileErr.message }, 500);
      }

      return json({ success: true, user_id: newUser.user!.id });
    }

    // ========== APPROVE USER ==========
    if (action === "approve") {
      const { user_id, role, role_details } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);

      const updates: Record<string, unknown> = { approval_status: "approved" };
      if (role) updates.role = role;
      if (role_details !== undefined) updates.role_details = role_details;

      const { error } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", user_id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ========== REJECT USER ==========
    if (action === "reject") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === user.id) return json({ error: "Cannot reject yourself" }, 400);

      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 500);

      return json({ success: true });
    }

    // ========== RESET PASSWORD ==========
    if (action === "reset_password") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);

      // Get user email
      const { data: targetUser, error: getUserErr } = await adminClient.auth.admin.getUserById(user_id);
      if (getUserErr || !targetUser?.user?.email) {
        return json({ error: "User not found" }, 404);
      }

      // Generate recovery link
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetUser.user.email,
      });

      if (linkErr) return json({ error: linkErr.message }, 500);

      return json({
        success: true,
        recovery_link: linkData?.properties?.action_link || null,
      });
    }

    // ========== DELETE USER ==========
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (user_id === user.id) return json({ error: "Cannot delete yourself" }, 400);

      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 500);

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (err) {
    console.error("admin-users error:", err);
    return json({ error: String(err) }, 500);
  }
});
