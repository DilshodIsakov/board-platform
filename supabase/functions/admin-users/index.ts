// Edge Function: admin-users
// Handles user creation and deletion via Supabase Admin API (service_role).
// Only admins can call this function.
// Deploy: supabase functions deploy admin-users --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: callerProfile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request
    const body = await req.json();
    const { action } = body;

    // Admin client with service_role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ========== CREATE USER ==========
    if (action === "create") {
      const { email, password, full_name, role, role_details } = body;

      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: "email, password, role required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user (auto-confirms email)
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create profile (the trigger may also fire, but we use ON CONFLICT DO NOTHING
      // in the trigger, so our explicit insert with the correct role takes priority)
      const { error: profileErr } = await adminClient.from("profiles").upsert({
        id: newUser.user!.id,
        email,
        full_name: full_name || null,
        role,
        role_details: role === "admin" ? null : (role_details || null),
      }, { onConflict: "id" });

      if (profileErr) {
        // Rollback: delete the auth user we just created
        await adminClient.auth.admin.deleteUser(newUser.user!.id);
        return new Response(JSON.stringify({ error: profileErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user!.id }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== DELETE USER ==========
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prevent self-deletion
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete profile first (cascade will handle related data)
      const { error: profDelErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", user_id);
      if (profDelErr) {
        console.error("Profile delete error:", profDelErr);
      }

      // Delete auth user (this is the definitive deletion)
      const { error: authDelErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (authDelErr) {
        return new Response(JSON.stringify({ error: authDelErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("admin-users error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
