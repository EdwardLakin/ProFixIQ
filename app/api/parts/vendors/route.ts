import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { normalizeVendorName } from "@/features/parts/lib/vendorWorkspace";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type SupplierInsert = DB["public"]["Tables"]["suppliers"]["Insert"];
type SupplierUpdate = DB["public"]["Tables"]["suppliers"]["Update"];

type VendorBody = {
  id?: unknown;
  name?: unknown;
  accountNo?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  isActive?: unknown;
};

const VENDOR_SELECT =
  "id, name, account_no, email, phone, notes, is_active, created_at, created_by, shop_id";

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be text.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${field} must be ${maxLength} characters or fewer.` };
  }
  return { ok: true, value: trimmed };
}

function parseVendorBody(body: VendorBody):
  | {
      ok: true;
      vendor: {
        name: string;
        accountNo: string | null;
        email: string | null;
        phone: string | null;
        notes: string | null;
        isActive: boolean;
      };
    }
  | { ok: false; error: string } {
  if (typeof body.name !== "string" || !body.name.trim()) {
    return { ok: false, error: "Vendor name is required." };
  }
  const name = body.name.trim();
  if (name.length > 160) {
    return { ok: false, error: "Vendor name must be 160 characters or fewer." };
  }

  const accountNo = optionalText(body.accountNo, "Account number", 120);
  if (!accountNo.ok) return accountNo;
  const email = optionalText(body.email, "Email", 254);
  if (!email.ok) return email;
  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    return { ok: false, error: "Enter a valid vendor email address." };
  }
  const phone = optionalText(body.phone, "Phone", 80);
  if (!phone.ok) return phone;
  const notes = optionalText(body.notes, "Notes", 2000);
  if (!notes.ok) return notes;

  return {
    ok: true,
    vendor: {
      name,
      accountNo: accountNo.value,
      email: email.value,
      phone: phone.value,
      notes: notes.value,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    },
  };
}

async function requireVendorAccess() {
  return requireShopScopedApiAccess({ requiredCapability: "canManageParts" });
}

async function findNormalizedDuplicate(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  name: string;
  excludeId?: string;
}): Promise<{ id: string; name: string } | null> {
  const { data, error } = await args.supabase
    .from("suppliers")
    .select("id, name")
    .eq("shop_id", args.shopId)
    .limit(1000);
  if (error) throw error;

  const wanted = normalizeVendorName(args.name);
  return (
    (data ?? []).find(
      (row) =>
        row.id !== args.excludeId && normalizeVendorName(row.name) === wanted,
    ) ?? null
  );
}

export async function POST(request: Request) {
  const access = await requireVendorAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as VendorBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = parseVendorBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const duplicate = await findNormalizedDuplicate({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      name: parsed.vendor.name,
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `A vendor named “${duplicate.name}” already exists.`,
          vendorId: duplicate.id,
        },
        { status: 409 },
      );
    }

    const insert: SupplierInsert = {
      shop_id: access.profile.shop_id,
      created_by: access.profile.id,
      name: parsed.vendor.name,
      account_no: parsed.vendor.accountNo,
      email: parsed.vendor.email,
      phone: parsed.vendor.phone,
      notes: parsed.vendor.notes,
      is_active: parsed.vendor.isActive,
    };
    const { data, error } = await access.supabase
      .from("suppliers")
      .insert(insert)
      .select(VENDOR_SELECT)
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, vendor: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create vendor.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const access = await requireVendorAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as VendorBody | null;
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "A vendor id is required." }, { status: 400 });
  }
  const id = body.id.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "A valid vendor id is required." }, { status: 400 });
  }
  const parsed = parseVendorBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const duplicate = await findNormalizedDuplicate({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      name: parsed.vendor.name,
      excludeId: id,
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `A vendor named “${duplicate.name}” already exists.`,
          vendorId: duplicate.id,
        },
        { status: 409 },
      );
    }

    const update: SupplierUpdate = {
      name: parsed.vendor.name,
      account_no: parsed.vendor.accountNo,
      email: parsed.vendor.email,
      phone: parsed.vendor.phone,
      notes: parsed.vendor.notes,
      is_active: parsed.vendor.isActive,
    };
    const { data, error } = await access.supabase
      .from("suppliers")
      .update(update)
      .eq("id", id)
      .eq("shop_id", access.profile.shop_id)
      .select(VENDOR_SELECT)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Vendor not found for this shop." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, vendor: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update vendor.",
      },
      { status: 500 },
    );
  }
}
