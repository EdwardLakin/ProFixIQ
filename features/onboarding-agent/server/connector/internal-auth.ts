import crypto from "crypto";
import { NextResponse } from "next/server";

const HEADER_SIGNATURE = "x-onboarding-agent-signature";
const HEADER_TIMESTAMP = "x-onboarding-agent-timestamp";
const HEADER_SHOP_ID = "x-shop-id";
const MAX_SKEW_MS = 5 * 60 * 1000;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifySignedRequest(request: Request, rawBody: string): { ok: true; shopId: string } | { ok: false; response: NextResponse } {
  const secret = process.env.ONBOARDING_AGENT_INTERNAL_SECRET;
  if (!secret) return { ok: false, response: NextResponse.json({ ok: false, error: "connector not configured" }, { status: 500 }) };

  const signature = request.headers.get(HEADER_SIGNATURE);
  const timestamp = request.headers.get(HEADER_TIMESTAMP);
  const shopId = request.headers.get(HEADER_SHOP_ID);

  if (!signature || !timestamp || !shopId) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "missing connector auth headers" }, { status: 401 }) };
  }

  const tsMillis = Number(timestamp);
  if (!Number.isFinite(tsMillis) || Math.abs(Date.now() - tsMillis) > MAX_SKEW_MS) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "stale timestamp" }, { status: 401 }) };
  }

  const payload = `${timestamp}.${shopId}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (!safeCompare(signature, expected)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 }) };
  }

  return { ok: true, shopId };
}
