import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient} from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // must be logged in
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shopId } = (await req.json().catch(() => ({}))) as { shopId?: string };
    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    // ensure caller owns the shop
    const { data: shop } = await supabase
      .from("shops")
      .select("id, owner_id")
      .eq("id", shopId)
      .single();

    if (!shop || shop.owner_id !== user.id) {
      return NextResponse.json({ error: "Only the shop owner can clear PIN" }, { status: 403 });
    }

    // read current cookie (optional)
    const store = await cookies(); // read-only store is fine for reading
    const current = store.get(COOKIE_NAME)?.value;

    // build response and delete cookie on it
    const res = NextResponse.json({ ok: true, cleared: current === shopId ? "matched" : "forced" });
    res.cookies.delete(COOKIE_NAME);
    return res;
  } catch (err) {
    console.error("owner-pin.clear error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}