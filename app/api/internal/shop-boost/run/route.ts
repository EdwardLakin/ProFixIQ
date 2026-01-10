// app/api/internal/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";

const SHOP_BOOST_SECRET = process.env.SHOP_BOOST_SECRET ?? "";

type RunBody = {
  shopId?: string;
  intakeId?: string;
};

export async function POST(req: NextRequest) {
  if (!SHOP_BOOST_SECRET) {
    return NextResponse.json({ error: "SHOP_BOOST_SECRET not configured" }, { status: 500 });
  }

  const headerSecret = req.headers.get("x-shop-boost-secret");
  if (!headerSecret || headerSecret !== SHOP_BOOST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RunBody | null;

  if (!body?.shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }

  const snapshot = await buildShopBoostProfile({
    shopId: body.shopId,
    intakeId: body.intakeId,
  });

  if (!snapshot) {
    return NextResponse.json({ ok: false, snapshot: null }, { status: 200 });
  }

  return NextResponse.json({ ok: true, snapshot }, { status: 200 });
}