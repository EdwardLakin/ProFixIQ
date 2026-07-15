// app/api/chat/users/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

export async function GET(req: Request) {
  const userClient = createServerSupabaseRoute();
  const admin = createAdminSupabase();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // who is calling
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // find caller's profile by either key (handles id vs user_id)
  const { data: me, error: meErr } = await userClient
    .from("profiles")
    .select("id, user_id, shop_id, role")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();
  if (meErr || !me) {
    return NextResponse.json(
      { error: "Profile not found for current user" },
      { status: 403 },
    );
  }

  const shopId = me.shop_id ?? null;
  if (!shopId) {
    return NextResponse.json(
      { error: "Current user is not associated with a shop" },
      { status: 403 },
    );
  }

  // helper to build a profiles query (admin bypasses RLS)
  const buildQuery = () => {
    let qry = admin
      .from("profiles")
      .select("id, user_id, full_name, role, email, shop_id, avatar_url")
      .order("full_name", { ascending: true })
      .limit(MAX_ROWS)
      .eq("shop_id", shopId);

    if (q) {
      qry = qry.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,role.ilike.%${q}%`,
      );
    }
    return qry;
  };

  const { data: list, error: listErr } = await buildQuery();
  if (listErr) {
    return NextResponse.json(
      { error: listErr.message ?? "Failed to load users" },
      { status: 500 },
    );
  }

  // normalize id; keep your own row (handy for solo testing)
  const normalized =
    list.map((u) => ({
      id: u.id ?? u.user_id,
      full_name: u.full_name,
      role: u.role,
      email: u.email,
      avatar_url: (u as { avatar_url?: string | null }).avatar_url ?? null,
    })) ?? [];

  const canMessageCustomers = ["owner", "admin", "manager", "advisor"].includes(
    (me.role ?? "").toLowerCase(),
  );

  if (!canMessageCustomers) {
    return NextResponse.json({ users: normalized, customers: [] });
  }

  let customerQuery = admin
    .from("customers")
    .select("id, user_id, name, first_name, last_name, email, phone, shop_id")
    .eq("shop_id", shopId)
    .order("name", { ascending: true })
    .limit(MAX_ROWS);

  if (q) {
    customerQuery = customerQuery.or(
      `name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }

  const { data: customerRows, error: customerError } = await customerQuery;
  if (customerError) {
    return NextResponse.json(
      { error: customerError.message ?? "Failed to load customers" },
      { status: 500 },
    );
  }

  const customers = (customerRows ?? []).map((customer) => ({
    id: customer.id,
    user_id: customer.user_id,
    full_name:
      customer.name?.trim() ||
      [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
      customer.email ||
      "Customer",
    email: customer.email,
    phone: customer.phone,
    can_message: Boolean(customer.user_id),
  }));

  return NextResponse.json({ users: normalized, customers });
}
