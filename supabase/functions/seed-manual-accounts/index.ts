import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ACCOUNTS = [
  { email: "manual.teacher@example.com", password: "ManualTeacher!2026", full_name: "Manual Teacher", role: "teacher" },
  { email: "manual.admin@example.com", password: "ManualAdmin!2026", full_name: "Manual Admin", role: "admin" },
  { email: "manual.validator@example.com", password: "ManualValidator!2026", full_name: "Manual Validator", role: "validator" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const results: any[] = [];
  for (const a of ACCOUNTS) {
    // Try create; if exists, look up + update password
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: a.email,
      password: a.password,
      email_confirm: true,
      user_metadata: { full_name: a.full_name },
    });
    if (created?.user) {
      userId = created.user.id;
    } else {
      // fetch existing by listing (fine for small set)
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users.find((u) => u.email === a.email);
      if (existing) {
        userId = existing.id;
        await admin.auth.admin.updateUserById(existing.id, { password: a.password, email_confirm: true });
      }
    }
    if (!userId) {
      results.push({ email: a.email, error: createErr?.message || "unknown" });
      continue;
    }
    // Ensure profile
    await admin.from("profiles").upsert({ id: userId, email: a.email, full_name: a.full_name });
    // Set role (delete existing, insert desired)
    await admin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: userId, role: a.role });
    results.push({ email: a.email, user_id: userId, role: a.role, roleErr: roleErr?.message });
  }
  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
