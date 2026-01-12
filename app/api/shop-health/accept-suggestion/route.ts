// /app/api/shop-health/accept-suggestion/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";

import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

type DB = Database;

type Body = {
  shopId?: string | null; // ignored intentionally
  suggestionId?: string | null;
};

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

const ROLE_MAP: Record<string, DB["public"]["Enums"]["user_role_enum"]> = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  advisor: "advisor",
  mechanic: "mechanic",
  tech: "mechanic",
  technician: "mechanic",
  parts: "parts",
  driver: "driver",
  dispatcher: "dispatcher",
  fleet_manager: "fleet_manager",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normRole(raw: string | null | undefined): DB["public"]["Enums"]["user_role_enum"] {
  const key = String(raw ?? "").trim().toLowerCase();
  return ROLE_MAP[key] ?? "mechanic";
}

function genPassword(): string {
  return randomBytes(12).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
}

async function uniqueUsername(
  admin: ReturnType<typeof createAdminSupabase>,
  base: string,
): Promise<string> {
  const clean = base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const root = clean || "user";

  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}_${i + 1}`;
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }

  return `${root}_${randomUUID().slice(0, 8)}`;
}

async function getCallerOrFail() {
  const supabaseUser = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: me, error: meErr } = await supabaseUser
    .from("profiles")
    .select("id, role, shop_id, full_name")
    .eq("id", user.id)
    .maybeSingle<
      Pick<DB["public"]["Tables"]["profiles"]["Row"], "id" | "role" | "shop_id" | "full_name">
    >();

  if (meErr || !me || !me.shop_id) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Profile not found or missing shop" }, { status: 403 }),
    };
  }

  const role = String(me.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, me };
}

// Suggestion row shapes (from your tables)
type MenuSuggestionRow = DB["public"]["Tables"]["menu_item_suggestions"]["Row"];
type InspSuggestionRow = DB["public"]["Tables"]["inspection_template_suggestions"]["Row"];
type StaffSuggestionRow = DB["public"]["Tables"]["staff_invite_suggestions"]["Row"];

type FoundSuggestion =
  | { type: "menu_item"; row: MenuSuggestionRow }
  | { type: "inspection_template"; row: InspSuggestionRow }
  | { type: "staff_invite"; row: StaffSuggestionRow };

async function findSuggestion(
  admin: ReturnType<typeof createAdminSupabase>,
  suggestionId: string,
): Promise<FoundSuggestion | null> {
  const [menuRes, inspRes, staffRes] = await Promise.all([
    admin.from("menu_item_suggestions").select("*").eq("id", suggestionId).maybeSingle<MenuSuggestionRow>(),
    admin
      .from("inspection_template_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle<InspSuggestionRow>(),
    admin.from("staff_invite_suggestions").select("*").eq("id", suggestionId).maybeSingle<StaffSuggestionRow>(),
  ]);

  if (menuRes.data) return { type: "menu_item", row: menuRes.data };
  if (inspRes.data) return { type: "inspection_template", row: inspRes.data };
  if (staffRes.data) return { type: "staff_invite", row: staffRes.data };

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const suggestionId = safeStr(body?.suggestionId).trim();

    if (!suggestionId) {
      return NextResponse.json({ error: "suggestionId is required" }, { status: 400 });
    }

    const caller = await getCallerOrFail();
    if (!caller.ok) return caller.res;

    const callerShopId = caller.me.shop_id!;
    const admin = createAdminSupabase();

    const found = await findSuggestion(admin, suggestionId);
    if (!found) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    const suggestionShopId = (found.row as { shop_id: string | null }).shop_id;
    if (!suggestionShopId || suggestionShopId !== callerShopId) {
      return NextResponse.json({ error: "Suggestion not in your shop" }, { status: 403 });
    }

    // --- MENU ITEM SUGGESTION -> menu_items
    if (found.type === "menu_item") {
      const s = found.row as unknown as Record<string, unknown>;

      const titleOrName =
        safeStr(s["title"]).trim() ||
        safeStr(s["name"]).trim() ||
        "Untitled Menu Item";

      const category = safeStr(s["category"]).trim() || null;
      const price = toNumber(s["price_suggestion"]);
      const labor = toNumber(s["labor_hours_suggestion"]);
      const reason = safeStr(s["reason"]).trim() || null;

      const insert: DB["public"]["Tables"]["menu_items"]["Insert"] = {
        shop_id: callerShopId,
        user_id: caller.me.id,
        name: titleOrName,
        category,
        total_price: price,
        labor_hours: labor,
        description: reason,
        is_active: true,
        source: "shop_boost",
      } as DB["public"]["Tables"]["menu_items"]["Insert"];

      const { data: created, error } = await admin
        .from("menu_items")
        .insert(insert)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ ok: true, createdType: "menu_item", created });
    }

    // --- INSPECTION TEMPLATE SUGGESTION -> inspection_templates
    if (found.type === "inspection_template") {
      const s = found.row as unknown as Record<string, unknown>;

      const name = safeStr(s["name"]).trim() || "Shop Boost Inspection";
      const appliesTo = safeStr(s["applies_to"]).trim() || null;

      const items = s["items"];
      const sections =
        isRecord(items) ? (items as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"]) : ({} as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"]);

      const insert: DB["public"]["Tables"]["inspection_templates"]["Insert"] = {
        shop_id: callerShopId,
        user_id: caller.me.id,
        template_name: name,
        sections,
        description: null,
        tags: ["shop_boost"],
        vehicle_type: appliesTo,
        is_public: false,
      } as DB["public"]["Tables"]["inspection_templates"]["Insert"];

      const { data: created, error } = await admin
        .from("inspection_templates")
        .insert(insert)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ ok: true, createdType: "inspection_template", created });
    }

    // --- STAFF INVITE SUGGESTION -> create real users (auth + profiles)
    // --- STAFF INVITE SUGGESTION -> create user(s)
if (found.type === "staff_invite") {
  const s = found.row as unknown as Record<string, unknown>;

  const roleEnum = normRole(safeStr(s["role"]));
  const fullName = safeStr(s["full_name"]).trim() || null;
  const emailRaw = safeStr(s["email"]).trim() || null;

  // ✅ NEW: if we have an email (or a name), treat this suggestion as "one person"
  const isPerPerson = !!emailRaw || !!fullName;

  const count = isPerPerson
    ? 1
    : Math.max(0, Math.min(25, Number(s["count_suggested"] ?? 0) || 0));

  if (count <= 0) {
    return NextResponse.json({ error: "This staff suggestion has count_suggested = 0" }, { status: 400 });
  }

  const createdUsers: Array<{
    user_id: string;
    username: string;
    email: string;
    temp_password: string;
    role: DB["public"]["Enums"]["user_role_enum"];
  }> = [];

  const shopShort = callerShopId.slice(0, 6);

  for (let i = 0; i < count; i += 1) {
    const base = isPerPerson
      ? `${(fullName ?? emailRaw ?? roleEnum).replace(/\s+/g, "_")}_${shopShort}`
      : `${roleEnum}_${shopShort}_${i + 1}`;

    const username = await uniqueUsername(admin, base);
    const tempPassword = genPassword();

    // ✅ Prefer real email from CSV when present; otherwise synthetic
    const email = emailRaw ?? `${username}@local.profix-internal`;

    const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: roleEnum,
        shop_id: callerShopId,
        username,
      },
    });

    if (authErr || !authCreated?.user?.id) {
      return NextResponse.json(
        { error: authErr?.message ?? "Failed to create staff user" },
        { status: 400 },
      );
    }

    const newUserId = authCreated.user.id;

    const { error: profErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email,
          full_name: fullName,
          role: roleEnum,
          shop_id: callerShopId,
          username,
          must_change_password: true,
          updated_at: new Date().toISOString(),
        } as DB["public"]["Tables"]["profiles"]["Insert"],
        { onConflict: "id" },
      );

    if (profErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => null);
      return NextResponse.json({ error: `Profile upsert failed: ${profErr.message}` }, { status: 400 });
    }

    createdUsers.push({
      user_id: newUserId,
      username,
      email,
      temp_password: tempPassword,
      role: roleEnum,
    });
  }

  return NextResponse.json({
    ok: true,
    createdType: "staff_invite",
    created: createdUsers,
    note: "Share username + temp password. must_change_password=true.",
  });
}

    return NextResponse.json({ error: "Unsupported suggestion type" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}