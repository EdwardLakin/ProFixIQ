// app/api/internal/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport } from "@/features/integrations/imports/runFullImport";

const SHOP_BOOST_SECRET = process.env.SHOP_BOOST_SECRET ?? "";

type RunBody = {
  shopId?: string;
  intakeId?: string;
  runImport?: boolean;
};

export async function POST(req: NextRequest) {
  if (!SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "SHOP_BOOST_SECRET not configured" }, { status: 500 });
  }

  // ✅ accept both header casings
  const headerSecret =
    req.headers.get("x-shop-boost-secret") ?? req.headers.get("X-Shop-Boost-Secret");

  if (!headerSecret || headerSecret !== SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RunBody | null;

  if (!body?.shopId) {
    return NextResponse.json({ ok: false, error: "shopId is required" }, { status: 400 });
  }

  const snapshot = await buildShopBoostProfile({
    shopId: body.shopId,
    intakeId: body.intakeId,
  });

  if (!snapshot) {
    return NextResponse.json({ ok: true, snapshot: null }, { status: 200 });
  }

  // ✅ optional operational import (only when explicitly requested)
  if (body.runImport && body.intakeId) {
    await runShopBoostImport({ shopId: body.shopId, intakeId: body.intakeId });
  }

  return NextResponse.json({ ok: true, snapshot }, { status: 200 });
}