// app/api/shop-health/accept-suggestion/route.ts
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
  shopId?: string | null;
  suggestionId?: string | null;
};

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

// Map suggestion roles -> your enum values (fallback to mechanic)
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

function normRole(raw: string | null | undefined): DB["public"]["Enums"]["user_role_enum"] {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase();
  return ROLE_MAP[key] ?? "mechanic";
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function genPassword(): string {
  // 12 bytes -> 16 chars base64url-ish after slicing
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

  // try root, then root_2..root_50, then root_<uuid4>
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
    .maybeSingle<Pick<DB["public"]["Tables"]["profiles"]["Row"], "id" | "role" | "shop_id" | "full_name">>();

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
  // Try each table (cheap + deterministic)
  const [menuRes, inspRes, staffRes] = await Promise.all([
    admin
      .from("menu_item_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle<MenuSuggestionRow>(),
    admin
      .from("inspection_template_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle<InspSuggestionRow>(),
    admin
      .from("staff_invite_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle<StaffSuggestionRow>(),
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

    // Enforce shop match (ignore any client shopId)
    const suggestionShopId = (found.row as { shop_id: string | null }).shop_id;
    if (!suggestionShopId || suggestionShopId !== callerShopId) {
      return NextResponse.json({ error: "Suggestion not in your shop" }, { status: 403 });
    }

    // --- MENU ITEM SUGGESTION -> menu_items
    if (found.type === "menu_item") {
      const s = found.row;

      const insert: DB["public"]["Tables"]["menu_items"]["Insert"] = {
        shop_id: callerShopId,
        user_id: caller.me.id,
        name: s.title, // suggestion uses "title"
        category: s.category ?? null,
        total_price: s.price_suggestion ?? null,
        labor_hours: s.labor_hours_suggestion ?? null,
        description: s.reason ?? null,
        is_active: true,
        source: "shop_boost",
      } as DB["public"]["Tables"]["menu_items"]["Insert"];

      const { data: created, error } = await admin
        .from("menu_items")
        .insert(insert)
        .select("*")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        createdType: "menu_item",
        created,
      });
    }

    // --- INSPECTION TEMPLATE SUGGESTION -> inspection_templates
    if (found.type === "inspection_template") {
      const s = found.row;

      // items -> sections (your destination column is "sections")
      const sections = (s.items ?? {}) as unknown as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"];

      const insert: DB["public"]["Tables"]["inspection_templates"]["Insert"] = {
        shop_id: callerShopId,
        user_id: caller.me.id,
        template_name: s.name,
        sections,
        description: null,
        tags: ["shop_boost"],
        vehicle_type: s.applies_to ?? null,
        is_public: false,
      } as DB["public"]["Tables"]["inspection_templates"]["Insert"];

      const { data: created, error } = await admin
        .from("inspection_templates")
        .insert(insert)
        .select("*")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        createdType: "inspection_template",
        created,
      });
    }

    // --- STAFF INVITE SUGGESTION -> create real users (auth + profiles)
    if (found.type === "staff_invite") {
      const s = found.row;

      const roleEnum = normRole(s.role);
      const count = Math.max(0, Math.min(25, Number(s.count_suggested ?? 0) || 0)); // cap
      if (count <= 0) {
        return NextResponse.json(
          { error: "This staff suggestion has count_suggested = 0" },
          { status: 400 },
        );
      }

      const createdUsers: Array<{
        user_id: string;
        username: string;
        email: string;
        temp_password: string;
        role: DB["public"]["Enums"]["user_role_enum"];
      }> = [];

      // Use a readable username base: role + shop short
      const shopShort = callerShopId.slice(0, 6);
      const base = `${roleEnum}_${shopShort}`;

      for (let i = 0; i < count; i += 1) {
        const username = await uniqueUsername(admin, `${base}_${i + 1}`);
        const tempPassword = genPassword();
        const syntheticEmail = `${username}@local.profix-internal`;

        // Create auth user
        const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
          email: syntheticEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: null,
            role: roleEnum,
            shop_id: callerShopId,
            phone: null,
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

        // Upsert profile (mirrors /api/admin/create-user)
        const { error: profErr } = await admin
          .from("profiles")
          .upsert(
            {
              id: newUserId,
              email: syntheticEmail,
              full_name: null,
              phone: null,
              role: roleEnum,
              shop_id: callerShopId,
              shop_name: null,
              username,
              must_change_password: true,
              updated_at: new Date().toISOString(),
            } as DB["public"]["Tables"]["profiles"]["Insert"],
            { onConflict: "id" },
          );

        if (profErr) {
          // attempt cleanup so we don’t leave auth-only users
          await admin.auth.admin.deleteUser(newUserId).catch(() => null);
          return NextResponse.json({ error: `Profile upsert failed: ${profErr.message}` }, { status: 400 });
        }

        createdUsers.push({
          user_id: newUserId,
          username,
          email: syntheticEmail,
          temp_password: tempPassword,
          role: roleEnum,
        });
      }

      return NextResponse.json({
        ok: true,
        createdType: "staff_invite",
        created: createdUsers,
        note:
          "These are real accounts with synthetic emails. Share username + temp password with staff. must_change_password=true.",
      });
    }

    return NextResponse.json({ error: "Unsupported suggestion type" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}