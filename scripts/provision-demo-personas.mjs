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
  ["leadtech@demo.profixiq.local", "Lead Tech", "mechanic"],
  ["tech1@demo.profixiq.local", "Tech One", "mechanic"],
  ["tech2@demo.profixiq.local", "Tech Two", "mechanic"],
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

function discloseCredential(email, tempPassword, action) {
  console.log(`\n=== Demo persona credential: ${email} ===`);
  console.log(`action: ${action}`);
  console.log(`temporary_password: ${tempPassword}`);
  console.log("must_change_password: true");
  console.log("This credential is shown now so a later persona failure cannot make it unrecoverable.");
}

function randomPassword() {
  // base64url output isn't guaranteed to contain a character from every
  // category Supabase Auth's complexity check requires (lower/upper/digit/
  // special) -- it happens to for most draws but isn't certain, and failed
  // in practice. Build one explicitly-compliant category character each,
  // pad with random characters from the full set, then shuffle.
  const categories = [
    "abcdefghijklmnopqrstuvwxyz",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "0123456789",
    "!@#$%^&*()_+-=[]{}|<>?,.",
  ];
  const all = categories.join("");
  const pick = (chars) => chars[randomBytes(1)[0] % chars.length];

  const chars = categories.map(pick);
  for (let i = 0; i < 20; i += 1) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Auth user lookup failed for ${email}: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  throw new Error(`Auth user lookup for ${email} exceeded the bounded 20-page search.`);
}

function assertDemoAuthIdentity({ authUser, email, shopId }) {
  if (!authUser) {
    throw new Error(`Expected an auth user for ${email}, but none was found.`);
  }
  if (authUser.email?.toLowerCase() !== email.toLowerCase()) {
    throw new Error(`Auth identity mismatch for ${email}; refusing to provision.`);
  }
  const metadata = authUser.user_metadata ?? {};
  if (metadata.demo_persona !== true || metadata.shop_id !== shopId) {
    throw new Error(
      `Refusing to adopt auth user ${authUser.id} for ${email}: it is not an existing demo_persona bound to DEMO_SHOP_ID ${shopId}.`,
    );
  }
}

async function rollbackRecoveredProfile(supabase, userId) {
  const cleanupErrors = [];
  const { error: membershipError } = await supabase.from("shop_members").delete().eq("user_id", userId);
  if (membershipError) cleanupErrors.push(`shop_members: ${membershipError.message}`);

  const { error: profileError } = await supabase.from("profiles").delete().eq("id", userId);
  if (profileError) cleanupErrors.push(`profiles: ${profileError.message}`);

  return cleanupErrors;
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
      .select("id, user_id, shop_id, must_change_password")
      .eq("email", email)
      .maybeSingle();
    if (existingErr) throw new Error(`Profile lookup failed for ${email}: ${existingErr.message}`);

    const authByEmail = await findAuthUserByEmail(supabase, email);

    if (existing?.id && existing?.user_id) {
      if (existing.shop_id !== shopId) {
        throw new Error(
          `Refusing to provision ${email}: profile ${existing.id} belongs to shop ${existing.shop_id ?? "null"}, not DEMO_SHOP_ID ${shopId}.`,
        );
      }
      if (existing.id !== existing.user_id) {
        throw new Error(
          `Refusing to provision ${email}: demo personas require profiles.id = profiles.user_id, but profile ${existing.id} links to ${existing.user_id}.`,
        );
      }

      const { data: linkedAuth, error: linkedAuthError } = await supabase.auth.admin.getUserById(existing.user_id);
      if (linkedAuthError || !linkedAuth?.user) {
        throw new Error(
          `Profile ${existing.id} for ${email} is auth-linked in the database, but its auth user could not be loaded: ${linkedAuthError?.message ?? "missing auth user"}`,
        );
      }
      assertDemoAuthIdentity({ authUser: linkedAuth.user, email, shopId });
      if (authByEmail && authByEmail.id !== linkedAuth.user.id) {
        throw new Error(
          `Refusing to provision ${email}: the profile points to auth user ${linkedAuth.user.id}, but that email resolves to ${authByEmail.id}.`,
        );
      }

      if (existing.must_change_password === true) {
        logStep(`${email}: already provisioned safely for demo shop (profile ${existing.id}) -- skipping`);
        results.push({ email, action: "already_linked", profileId: existing.id });
        continue;
      }

      const { error: prepErr } = await supabase
        .from("profiles")
        .update({
          full_name,
          role,
          shop_id: shopId,
          completed_onboarding: true,
          must_change_password: true,
        })
        .eq("id", existing.id)
        .eq("shop_id", shopId);
      if (prepErr) {
        throw new Error(`Failed to prepare existing profile for ${email}: ${prepErr.message}`);
      }

      const tempPassword = randomPassword();
      const { error: rotateErr } = await supabase.auth.admin.updateUserById(existing.user_id, {
        password: tempPassword,
        user_metadata: {
          ...(linkedAuth.user.user_metadata ?? {}),
          full_name,
          role,
          shop_id: shopId,
          demo_persona: true,
        },
      });
      if (rotateErr) {
        const { error: rollbackFlagErr } = await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", existing.id)
          .eq("shop_id", shopId);
        throw new Error(
          `Failed to rotate temporary password for ${email}: ${rotateErr.message}` +
            (rollbackFlagErr ? `. Restoring must_change_password also failed: ${rollbackFlagErr.message}` : ""),
        );
      }

      discloseCredential(email, tempPassword, "rotated_existing");
      logStep(`${email}: rotated existing demo credential and enabled forced password change`);
      results.push({ email, action: "rotated_existing", profileId: existing.id });
      continue;
    }

    if (existing) {
      throw new Error(
        `Refusing to provision ${email}: an incomplete profile already exists (id=${existing.id ?? "null"}, user_id=${existing.user_id ?? "null"}). Repair it explicitly before retrying.`,
      );
    }

    if (authByEmail) {
      assertDemoAuthIdentity({ authUser: authByEmail, email, shopId });

      const { data: conflictingProfile, error: conflictingProfileErr } = await supabase
        .from("profiles")
        .select("id, email, shop_id, user_id")
        .eq("id", authByEmail.id)
        .maybeSingle();
      if (conflictingProfileErr) {
        throw new Error(`Profile-id lookup failed for orphan auth user ${email}: ${conflictingProfileErr.message}`);
      }
      if (conflictingProfile) {
        throw new Error(
          `Refusing to recover ${email}: auth user ${authByEmail.id} is already referenced by profile ${conflictingProfile.id} (${conflictingProfile.email ?? "no email"}).`,
        );
      }

      const { error: restoreErr } = await supabase.from("profiles").insert({
        id: authByEmail.id,
        user_id: authByEmail.id,
        email,
        full_name,
        role,
        shop_id: shopId,
        completed_onboarding: true,
        must_change_password: true,
      });
      if (restoreErr) {
        throw new Error(`Failed to restore missing profile for ${email}: ${restoreErr.message}`);
      }

      const tempPassword = randomPassword();
      const { error: rotateErr } = await supabase.auth.admin.updateUserById(authByEmail.id, {
        password: tempPassword,
        user_metadata: {
          ...(authByEmail.user_metadata ?? {}),
          full_name,
          role,
          shop_id: shopId,
          demo_persona: true,
        },
      });
      if (rotateErr) {
        const cleanupErrors = await rollbackRecoveredProfile(supabase, authByEmail.id);
        throw new Error(
          `Failed to rotate recovered auth user for ${email}: ${rotateErr.message}` +
            (cleanupErrors.length > 0 ? `. Recovery rollback also failed: ${cleanupErrors.join("; ")}` : ""),
        );
      }

      discloseCredential(email, tempPassword, "recovered_orphan");
      logStep(`${email}: restored missing profile for verified demo auth user ${authByEmail.id}`);
      results.push({ email, action: "recovered_orphan", profileId: authByEmail.id });
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
    const { error: profileErr } = await supabase.from("profiles").insert({
      id: userId,
      user_id: userId,
      email,
      full_name,
      role,
      shop_id: shopId,
      completed_onboarding: true,
      must_change_password: true,
    });
    if (profileErr) {
      await supabase.auth.admin.deleteUser(userId);
      throw new Error(`Failed to create profile for ${email}: ${profileErr.message}`);
    }

    discloseCredential(email, tempPassword, "created");
    logStep(`${email}: created auth user + profile ${userId}`);
    results.push({ email, action: "created", profileId: userId });
  }

  console.log("\n=== Provisioning summary ===");
  for (const r of results) {
    console.log(`${r.email}: ${r.action}`);
  }
  console.log(
    "\nTemporary credentials are emitted immediately after each account is successfully committed. Every created or recovered persona is marked must_change_password=true.",
  );
  console.log("Re-run `ALLOW_DEMO_SEED=true pnpm seed:demo-shop` now to link these personas and assign technicians to work-order lines.");
}

main().catch((error) => {
  console.error("Persona provisioning failed:", error.message);
  process.exit(1);
});
