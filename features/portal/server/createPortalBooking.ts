import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type BookingActorMode = "customer-only" | "allow-staff";

export type CreatePortalBookingInput = {
  shopSlug: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
  vehicleId?: string | null;
  customerId?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export type CreatePortalBookingResult =
  | { ok: true; booking: DB["public"]["Tables"]["bookings"]["Row"] }
  | { ok: false; error: string; status: number };

export async function createPortalBooking({
  supabase,
  userId,
  input,
  actorMode,
}: {
  supabase: SupabaseClient<DB>;
  userId: string;
  input: CreatePortalBookingInput;
  actorMode: BookingActorMode;
}): Promise<CreatePortalBookingResult> {
  const shopSlug = typeof input.shopSlug === "string" ? input.shopSlug.trim() : "";
  const startsAt = typeof input.startsAt === "string" ? input.startsAt.trim() : "";
  const endsAt = typeof input.endsAt === "string" ? input.endsAt.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const vehicleId = typeof input.vehicleId === "string" ? input.vehicleId.trim() : "";

  if (!shopSlug || !startsAt || !endsAt) {
    return { ok: false, error: "Missing shopSlug, startsAt, or endsAt", status: 400 };
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "Invalid start/end", status: 400 };
  }

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id, slug, accepts_online_booking, min_notice_minutes, max_lead_days")
    .eq("slug", shopSlug)
    .maybeSingle();

  if (shopErr) return { ok: false, error: shopErr.message, status: 500 };
  if (!shop) return { ok: false, error: "Shop not found", status: 404 };
  if (shop.accepts_online_booking === false) {
    return { ok: false, error: "Shop is not accepting online bookings", status: 403 };
  }

  const hasExplicitCustomer = Boolean(
    actorMode === "allow-staff" &&
      typeof input.customerId === "string" &&
      input.customerId.trim().length > 0,
  );
  const hasInlineCustomerFields = Boolean(
    actorMode === "allow-staff" &&
      ((typeof input.customerName === "string" && input.customerName.trim().length > 0) ||
        (typeof input.customerEmail === "string" && input.customerEmail.trim().length > 0) ||
        (typeof input.customerPhone === "string" && input.customerPhone.trim().length > 0)),
  );

  let customerId: string | null = null;
  let customerShopId: string | null = null;
  const explicitCustomerId =
    typeof input.customerId === "string" ? input.customerId.trim() : "";

  if (hasExplicitCustomer) {
    const { data: customerRow, error: customerRowErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("id", explicitCustomerId)
      .maybeSingle();

    if (customerRowErr) return { ok: false, error: customerRowErr.message, status: 500 };
    if (!customerRow) return { ok: false, error: "Selected customer not found", status: 404 };
    if (customerRow.shop_id && customerRow.shop_id !== shop.id) {
      return { ok: false, error: "Customer belongs to a different shop", status: 403 };
    }
    customerId = customerRow.id;
    customerShopId = customerRow.shop_id;
  } else if (hasInlineCustomerFields) {
    const trimmedName = (input.customerName ?? "").trim();
    let firstName: string | null = null;
    let lastName: string | null = null;

    if (trimmedName) {
      const parts = trimmedName.split(" ");
      firstName = parts[0] || null;
      lastName = parts.slice(1).join(" ") || null;
    }

    const insertCustomer: DB["public"]["Tables"]["customers"]["Insert"] = {
      shop_id: shop.id,
      first_name: firstName,
      last_name: lastName,
      email: (input.customerEmail ?? "").trim() || null,
      phone: (input.customerPhone ?? "").trim() || null,
    };

    const { data: newCustomer, error: newCustErr } = await supabase
      .from("customers")
      .insert(insertCustomer)
      .select("id, shop_id")
      .single();

    if (newCustErr || !newCustomer) {
      return { ok: false, error: "Failed to create customer for booking", status: 500 };
    }

    customerId = newCustomer.id;
    customerShopId = newCustomer.shop_id;
  } else {
    const { data: customerRow, error: custErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (custErr) return { ok: false, error: custErr.message, status: 500 };
    if (!customerRow) return { ok: false, error: "Customer profile not found for this user", status: 404 };

    if (customerRow.shop_id && customerRow.shop_id !== shop.id) {
      return { ok: false, error: "Customer is not linked to this shop", status: 403 };
    }

    customerId = customerRow.id;
    customerShopId = customerRow.shop_id;
  }

  if (!customerId) {
    return { ok: false, error: "Could not resolve customer for booking", status: 500 };
  }

  if (vehicleId) {
    const { data: vehicle, error: vehicleErr } = await supabase
      .from("vehicles")
      .select("id, customer_id, shop_id")
      .eq("id", vehicleId)
      .eq("customer_id", customerId)
      .eq("shop_id", shop.id)
      .maybeSingle();

    if (vehicleErr) return { ok: false, error: vehicleErr.message, status: 500 };
    if (!vehicle) {
      return { ok: false, error: "Vehicle does not belong to this customer at this shop", status: 403 };
    }
  }

  const now = new Date();
  const minutesUntil = Math.floor((start.getTime() - now.getTime()) / 60000);
  const minNotice = shop.min_notice_minutes ?? 120;
  if (minutesUntil < minNotice) {
    return { ok: false, error: `Bookings require at least ${minNotice} minutes notice`, status: 400 };
  }

  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntil = Math.floor((start.getTime() - midnightToday.getTime()) / 86400000);
  const maxLead = shop.max_lead_days ?? 30;
  if (daysUntil > maxLead) {
    return { ok: false, error: `Bookings cannot be more than ${maxLead} days in advance`, status: 400 };
  }

  const { data: overlaps, error: ovErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("shop_id", shop.id)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1);

  if (ovErr) return { ok: false, error: "Failed to check availability", status: 500 };
  if ((overlaps ?? []).length > 0) {
    return { ok: false, error: "This time overlaps an existing booking", status: 409 };
  }

  const insertBooking: DB["public"]["Tables"]["bookings"]["Insert"] = {
    shop_id: shop.id,
    customer_id: customerId,
    vehicle_id: vehicleId || null,
    starts_at: startsAt,
    ends_at: endsAt,
    status: "pending",
    notes: notes || null,
  };

  const { data: created, error: insErr } = await supabase
    .from("bookings")
    .insert(insertBooking)
    .select("*")
    .single();

  if (insErr || !created) {
    if (insErr?.code === "23P01") {
      return { ok: false, error: "This time overlaps an existing booking", status: 409 };
    }
    return { ok: false, error: "Failed to create booking", status: 500 };
  }

  const cameFromPortal = !hasExplicitCustomer && !hasInlineCustomerFields;
  if (cameFromPortal && !customerShopId) {
    await supabase.from("customers").update({ shop_id: shop.id }).eq("id", customerId);
  }

  return { ok: true, booking: created };
}
