import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { connectorActionBodySchema, CONNECTOR_CAPABILITIES, type ConnectorResponse, validateShopBodySchema } from "./types";
import { verifySignedRequest } from "./internal-auth";

function skipped(message: string): ConnectorResponse {
  return { ok: false, status: "skipped", message };
}

async function parseAndAuthorize<T>(request: Request, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): Promise<{ ok: true; body: T; shopId: string } | { ok: false; response: NextResponse }> {
  const rawBody = await request.text();
  const auth = verifySignedRequest(request, rawBody);
  if (!auth.ok) return auth;
  const parsedJson = rawBody ? JSON.parse(rawBody) : {};
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) return { ok: false, response: NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 }) };
  const bodyRecord = parsed.data as Record<string, unknown>;
  const bodyShopId = typeof bodyRecord.shopId === "string" ? bodyRecord.shopId : undefined;
  if (!bodyShopId || bodyShopId !== auth.shopId) return { ok: false, response: NextResponse.json({ ok: false, error: "shopId mismatch" }, { status: 403 }) };
  return { ok: true, body: parsed.data as T, shopId: auth.shopId };
}

export async function handleValidateShop(request: Request) {
  const parsed = await parseAndAuthorize(request, validateShopBodySchema);
  if (!parsed.ok) return parsed.response;
  const admin = createAdminSupabase();
  const { data } = await admin.from("shops").select("id").eq("id", parsed.body.shopId).maybeSingle();
  return NextResponse.json({ ok: !!data && parsed.body.shopId === parsed.body.expectedShopId, capabilities: CONNECTOR_CAPABILITIES });
}

export async function handleCustomerUpsert(request: Request) {
  const parsed = await parseAndAuthorize(request, connectorActionBodySchema);
  if (!parsed.ok) return parsed.response;
  const admin = createAdminSupabase();
  const p = parsed.body.payload;
  const name = typeof p.name === "string" ? p.name : null;
  const email = typeof p.email === "string" ? p.email : null;
  const phone = typeof p.phone === "string" ? p.phone : null;
  const externalId = typeof p.externalId === "string" ? p.externalId : parsed.body.idempotencyKey;
  const { data: existing } = await admin.from("customers").select("id").eq("shop_id", parsed.shopId).eq("external_id", externalId).maybeSingle();
  if (existing?.id) {
    await admin.from("customers").update({ name, email, phone }).eq("shop_id", parsed.shopId).eq("id", existing.id);
    return NextResponse.json({ ok: true, status: "succeeded", externalId: existing.id });
  }
  const { data, error } = await admin.from("customers").insert({ shop_id: parsed.shopId, external_id: externalId, name, email, phone }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, status: "failed", message: "customer upsert failed" }, { status: 500 });
  return NextResponse.json({ ok: true, status: "succeeded", externalId: data.id });
}

export async function handleVehicleUpsert(request: Request) { /* similar */
  const parsed = await parseAndAuthorize(request, connectorActionBodySchema);
  if (!parsed.ok) return parsed.response;
  const admin = createAdminSupabase();
  const p = parsed.body.payload;
  const externalId = typeof p.externalId === "string" ? p.externalId : parsed.body.idempotencyKey;
  const vin = typeof p.vin === "string" ? p.vin : null;
  const plate = typeof p.licensePlate === "string" ? p.licensePlate : null;
  const make = typeof p.make === "string" ? p.make : null;
  const model = typeof p.model === "string" ? p.model : null;
  const year = typeof p.year === "number" ? p.year : null;
  const { data: existing } = await admin.from("vehicles").select("id").eq("shop_id", parsed.shopId).eq("external_id", externalId).maybeSingle();
  if (existing?.id) {
    await admin.from("vehicles").update({ vin, license_plate: plate, make, model, year }).eq("shop_id", parsed.shopId).eq("id", existing.id);
    return NextResponse.json({ ok: true, status: "succeeded", externalId: existing.id });
  }
  const { data, error } = await admin.from("vehicles").insert({ shop_id: parsed.shopId, external_id: externalId, vin, license_plate: plate, make, model, year }).select("id").single();
  if (error || !data) return NextResponse.json({ ok: false, status: "failed", message: "vehicle upsert failed" }, { status: 500 });
  return NextResponse.json({ ok: true, status: "succeeded", externalId: data.id });
}

export async function handleCustomerVehicleLinkUpsert(request: Request) {
  const parsed = await parseAndAuthorize(request, connectorActionBodySchema);
  if (!parsed.ok) return parsed.response;
  const p = parsed.body.payload;
  const customerId = typeof p.customerId === "string" ? p.customerId : null;
  const vehicleId = typeof p.vehicleId === "string" ? p.vehicleId : null;
  if (!customerId || !vehicleId) return NextResponse.json(skipped("customerId and vehicleId are required"));
  const admin = createAdminSupabase();
  await admin.from("vehicles").update({ customer_id: customerId }).eq("shop_id", parsed.shopId).eq("id", vehicleId);
  return NextResponse.json({ ok: true, status: "succeeded", externalId: vehicleId });
}

export const handleSkippedVendor = async (_request: Request) => NextResponse.json(skipped("vendor materialization unsupported in this ProFixIQ connector pass"));
export const handleSkippedPart = async (_request: Request) => NextResponse.json(skipped("part materialization unsupported in this ProFixIQ connector pass"));
export const handleSkippedHistory = async (_request: Request) => NextResponse.json(skipped("historical work materialization requires safe historical import mapping"));
export const handleSkippedInvoiceHistory = async (_request: Request) => NextResponse.json(skipped("invoice history materialization requires safe historical import mapping"));
export const handleSkippedReview = async (_request: Request) => NextResponse.json(skipped("review item materialization unsupported in this connector pass"));
export const handleSkippedSummary = async (_request: Request) => NextResponse.json(skipped("summary persistence unsupported in this connector pass"));
