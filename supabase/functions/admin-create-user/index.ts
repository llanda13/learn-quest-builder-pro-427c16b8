import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = "https://lohmzywgbkntvpuygvfx.supabase.co";

type AppRole = "admin" | "teacher" | "validator";
const VALID_ROLES: AppRole[] = ["admin", "teacher", "validator"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const service = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identify the caller from their JWT and confirm they are an admin.
    const token = authHeader.replace("Bearer ", "");
    const { data: caller, error: callerError } = await service.auth.getUser(token);
    if (callerError || !caller?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: adminError } = await service.rpc("is_admin", { uid: caller.user.id });
    if (adminError) return json({ error: adminError.message }, 500);
    if (!isAdmin) return json({ error: "Only administrators can create accounts." }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const college = String(body.college ?? "").trim();
    const course = String(body.course ?? "").trim();
    const password = String(body.password ?? "").trim();
    const roles: AppRole[] = Array.isArray(body.roles) ? body.roles : [body.role];
    const desiredRoles = [...new Set(roles.filter((r): r is AppRole => VALID_ROLES.includes(r)))];

    if (!email || !fullName) return json({ error: "Email and full name are required." }, 400);
    if (password.length < 6) return json({ error: "Temporary password must be at least 6 characters." }, 400);
    if (desiredRoles.length === 0) return json({ error: "A valid role is required." }, 400);

    // 1) Create the auth user (service role => the admin's own session is untouched).
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created?.user) {
      return json({ error: createError?.message || "Failed to create the authentication account." }, 400);
    }
    const userId = created.user.id;

    // 2) Profile (the signup trigger creates it; ensure name/college are correct).
    const { error: profileError } = await service
      .from("profiles")
      .upsert({ id: userId, email, full_name: fullName, college: college || null, course: course || null }, { onConflict: "id" });
    if (profileError) {
      await service.auth.admin.deleteUser(userId);
      return json({ error: `Account rolled back — profile could not be saved: ${profileError.message}` }, 500);
    }

    // 3) Roles — replace the trigger-assigned default with exactly what was chosen.
    const { error: clearError } = await service.from("user_roles").delete().eq("user_id", userId);
    if (clearError) {
      await service.auth.admin.deleteUser(userId);
      return json({ error: `Account rolled back — role assignment failed: ${clearError.message}` }, 500);
    }

    const { error: roleError } = await service
      .from("user_roles")
      .insert(desiredRoles.map((role) => ({ user_id: userId, role })));
    if (roleError) {
      await service.auth.admin.deleteUser(userId);
      return json({ error: `Account rolled back — role assignment failed: ${roleError.message}` }, 500);
    }

    // 4) Verify persistence before reporting success.
    const { data: persisted, error: verifyError } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (verifyError) return json({ error: verifyError.message }, 500);

    const persistedRoles = (persisted ?? []).map((r) => r.role as AppRole);
    const missing = desiredRoles.filter((r) => !persistedRoles.includes(r));
    if (missing.length > 0) {
      await service.auth.admin.deleteUser(userId);
      return json({ error: `Account rolled back — roles were not persisted: ${missing.join(", ")}` }, 500);
    }

    return json({ ok: true, user_id: userId, roles: persistedRoles });
  } catch (error) {
    console.error("admin-create-user error", error);
    return json({ error: (error as Error).message ?? "Unexpected error" }, 500);
  }
});
