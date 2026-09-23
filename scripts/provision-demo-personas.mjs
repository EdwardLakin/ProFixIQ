import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Creates real Supabase Auth accounts (and linked profiles) for the fake
// @demo.profixiq.local staff personas that scripts/seed-demo-shop.mjs
// optionally links but never creates itself -- without a real auth-linked
// profile, that script leaves those personas unassigned rather than
// attributing their work to a non-technician. Keep this list in sync with
// DEMO_USERS in scripts/seed-demo-shop.mjs.
const DEMO_USERS = [
  ["admin@demo.profixiq.local", "Admin Demo", "admin"],
  ["manager@demo.profixiq.local", "Manager Demo", "manager"],
  ["advisor1@demo.profixiq.local", "Advisor One", "advisor"],
  ["advisor2@demo.profixiq.local", "Advisor Two", "advisor"],
  ["leadtech@demo.profixiq.local", "Lead Tech", "tech"],
  ["tech1@demo.profixiq.local", "Tech One", "tech"],
  ["tech2@demo.profixiq.local", "Tech Two", "tech"],
  ["parts@demo.profixiq.local", "Parts Coordinator", "parts"],
  ["payroll@demo.profixiq.local", "Payroll Coordinator", "manager"],
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function logStep(msg) {
  console.log(`\n[provision-demo-personas] ${msg}`);
}

function randomPassword() {
  return randomBytes(24).toString("base64url");
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refusing to run: set ALLOW_DEMO_SEED=true.");
    process.exit(1);
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const shopId = requireEnv("DEMO_SHOP_ID");

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, billing_entitlement_override")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) throw new Error(`Shop lookup failed: ${shopError.message}`);
  if (!shop) throw new Error(`DEMO_SHOP_ID ${shopId} does not match an existing shop.`);
  if (shop.billing_entitlement_override !== "internal_demo") {
    throw new Error(
      `Refusing to run: shop ${shopId} is not marked billing_entitlement_override = 'internal_demo'. ` +
        "This script only provisions accounts into an already-provisioned internal demo shop.",
    );
  }

  const results = [];

  for (const [email, full_name, role] of DEMO_USERS) {
    const { data: existing, error: existingErr } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("email", email)
      .maybeSingle();
    if (existingErr) throw new Error(`Profile lookup failed for ${email}: ${existingErr.message}`);

    if (existing?.id && existing?.user_id) {
      logStep(`${email}: already auth-linked (profile ${existing.id}) -- skipping`);
      results.push({ email, action: "already_linked", profileId: existing.id });
      continue;
    }

    const tempPassword = randomPassword();
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role, shop_id: shopId, demo_persona: true },
    });
    if (createErr || !created?.user) {
      throw new Error(`Failed to create auth user for ${email}: ${createErr?.message ?? "unknown error"}`);
    }

    const userId = created.user.id;

    // profiles.id = profiles.user_id here (a normal, non-legacy identity) --
    // this is what scripts/seed-demo-shop.mjs's own auth-link check requires,
    // and setting shop_id/role triggers trg_profiles_sync_shop_membership,
    // which creates the matching shop_members row automatically.
    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        user_id: userId,
        email,
        full_name,
        role,
        shop_id: shopId,
        completed_onboarding: true,
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      await supabase.auth.admin.deleteUser(userId);
      throw new Error(`Failed to create profile for ${email}: ${profileErr.message}`);
    }

    logStep(`${email}: created auth user + profile ${userId}`);
    results.push({ email, action: "created", profileId: userId, tempPassword });
  }

  console.log("\n=== Provisioning summary ===");
  for (const r of results) {
    console.log(`${r.email}: ${r.action}${r.tempPassword ? ` (temp password: ${r.tempPassword})` : ""}`);
  }
  console.log(
    "\nTemp passwords above are shown once and not stored anywhere -- these are internal demo/seed accounts, not real invites, so no email was sent.",
  );
  console.log("Re-run `ALLOW_DEMO_SEED=true pnpm seed:demo-shop` now to link these personas and assign technicians to work-order lines.");
}

main().catch((error) => {
  console.error("Persona provisioning failed:", error.message);
  process.exit(1);
});
