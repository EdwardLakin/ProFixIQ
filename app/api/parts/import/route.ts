import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PartInsert = DB["public"]["Tables"]["parts"]["Insert"];
type PartUpdate = DB["public"]["Tables"]["parts"]["Update"];

type PartsImportRow = {
  name?: unknown;
  sku?: unknown;
  partNumber?: unknown;
  part_number?: unknown;
  category?: unknown;
  price?: unknown;
  qty?: unknown;
};

type PartsImportBody = {
  rows?: unknown;
  defaultLocationId?: unknown;
};

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRows(input: unknown): Array<{
  name: string;
  sku?: string;
  partNumber?: string;
  category?: string;
  price?: number;
  qty?: number;
}> {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw): {
      name: string;
      sku?: string;
      partNumber?: string;
      category?: string;
      price?: number;
      qty?: number;
    } | null => {
      const row = raw as PartsImportRow;
      const name = textValue(row.name);
      if (!name) return null;

      const price = numberValue(row.price);
      const qty = numberValue(row.qty);

      return {
        name,
        sku: textValue(row.sku),
        partNumber: textValue(row.partNumber) ?? textValue(row.part_number),
        category: textValue(row.category),
        price: price !== undefined && price >= 0 ? price : undefined,
        qty: qty !== undefined && qty > 0 ? qty : undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function applyCsvReceive(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  args: { partId: string; locationId: string; qty: number },
): Promise<void> {
  const { error } = await supabase.rpc("apply_stock_move", {
    p_part: args.partId,
    p_loc: args.locationId,
    p_qty: args.qty,
    p_reason: "receive",
    p_ref_kind: "csv_import",
    p_ref_id: null,
  } as unknown as DB["public"]["Functions"]["apply_stock_move"]["Args"]);

  if (error) throw new Error(error.message);
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const shopId = typeof profile?.shop_id === "string" ? profile.shop_id : "";
    if (!shopId) return NextResponse.json({ error: "No shop is associated with this user" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as PartsImportBody | null;
    const rows = normalizeRows(body?.rows);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid part rows to import" }, { status: 400 });
    }

    const requestedLocationId = textValue(body?.defaultLocationId) ?? "";
    let defaultLocationId = "";
    if (requestedLocationId) {
      const { data: location, error: locationError } = await supabase
        .from("stock_locations")
        .select("id")
        .eq("shop_id", shopId)
        .eq("id", requestedLocationId)
        .maybeSingle();

      if (locationError) return NextResponse.json({ error: locationError.message }, { status: 500 });
      if (!location?.id) return NextResponse.json({ error: "Default receive location is not available for this shop" }, { status: 400 });
      defaultLocationId = String(location.id);
    }

    const errors: Array<{ row: number; message: string }> = [];
    let importedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let stockReceiveCount = 0;

    for (const [index, row] of rows.entries()) {
      try {
        let partId: string | null = null;

        if (row.sku) {
          const { data: found, error: findError } = await supabase
            .from("parts")
            .select("id")
            .eq("shop_id", shopId)
            .eq("sku", row.sku)
            .maybeSingle();

          if (findError) throw new Error(findError.message);
          if (found?.id) partId = String(found.id);
        }

        if (!partId) {
          const insert: PartInsert = {
            shop_id: shopId,
            name: row.name,
            sku: row.sku ?? null,
            part_number: row.partNumber ?? null,
            category: row.category ?? null,
            price: row.price ?? null,
          };
          const { data: created, error: insertError } = await supabase.from("parts").insert(insert).select("id").single();
          if (insertError) throw new Error(insertError.message);
          partId = String(created?.id ?? "");
          createdCount += 1;
        } else {
          const patch: PartUpdate = {
            name: row.name,
            sku: row.sku ?? null,
            part_number: row.partNumber ?? null,
            category: row.category ?? null,
            price: row.price ?? null,
          };
          const { error: updateError } = await supabase.from("parts").update(patch).eq("shop_id", shopId).eq("id", partId);
          if (updateError) throw new Error(updateError.message);
          updatedCount += 1;
        }

        importedCount += 1;

        if (partId && defaultLocationId && row.qty) {
          await applyCsvReceive(supabase, { partId, locationId: defaultLocationId, qty: row.qty });
          stockReceiveCount += 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Import failed for this row";
        errors.push({ row: index + 1, message });
      }
    }

    if (importedCount === 0) {
      return NextResponse.json({ error: "No rows were imported", errors }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      counts: {
        importedCount,
        createdCount,
        updatedCount,
        stockReceiveCount,
        failedCount: errors.length,
      },
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
