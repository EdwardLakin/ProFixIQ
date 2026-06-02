import { NextResponse } from "next/server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  vin: string;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  license_plate?: string | null;
};

export async function POST(req: Request) {
  const supabase = await createServerSupabaseRSC();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vinCheck = normalizeVinInput(body.vin);
  if (!vinCheck.isValid) {
    return NextResponse.json(
      { error: vinCheck.message, reason: vinCheck.reason },
      { status: 400 },
    );
  }
  const rawVin = vinCheck.vin;

  // get the signed-in user + shop_id
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("id", userId)
    .maybeSingle();

  const shopId = profile?.shop_id ?? null;
  if (!shopId) {
    return NextResponse.json({ error: "Your profile isn’t linked to a shop yet." }, { status: 403 });
  }

  // ensure placeholder customer in this shop (re-uses your "Walk-in Customer" pattern)
  async function ensureWalkInCustomer(): Promise<Database["public"]["Tables"]["customers"]["Row"]> {
    if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("shop_id", shopId)
      .ilike("first_name", "Walk-in")
      .ilike("last_name", "Customer")
      .limit(1);
    if (existing?.length) return existing[0];

    const { data: created, error } = await supabase
      .from("customers")
      .insert({ first_name: "Walk-in", last_name: "Customer", shop_id: shopId })
      .select("*")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Failed to create placeholder customer");
    return created;
  }

  // Try to find vehicle by VIN within this shop.
  const vehQ = supabase
    .from("vehicles")
    .select("*")
    .eq("vin", rawVin)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1);
  const { data: foundVeh } = await vehQ;
  if (foundVeh?.length) {
    return NextResponse.json(foundVeh[0]);
  }

  // Upsert a light vehicle row under a walk-in customer
  try {
    const cust = await ensureWalkInCustomer();
    const yearNum =
      typeof body.year === "number"
        ? body.year
        : typeof body.year === "string" && body.year.trim()
        ? Number(body.year)
        : null;

    const { data: inserted, error } = await supabase
      .from("vehicles")
      .insert({
        customer_id: cust.id,
        shop_id: shopId,
        vin: rawVin,
        year: Number.isFinite(yearNum) ? yearNum : null,
        make: body.make ?? null,
        model: body.model ?? null,
        license_plate: body.license_plate ?? null,
      } satisfies Database["public"]["Tables"]["vehicles"]["Insert"])
      .select("*")
      .single();

    if (error || !inserted) throw new Error(error?.message ?? "Insert failed");
    return NextResponse.json(inserted);
  } catch (err) {
    console.error("[vehicle.ensure]", err);
    return NextResponse.json({ error: "Vehicle ensure failed" }, { status: 500 });
  }
}