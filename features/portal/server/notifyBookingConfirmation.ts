import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { sendBookingConfirmation } from "@/features/shared/lib/email/sendEmail";

type BookingForNotification = Pick<
  Database["public"]["Tables"]["bookings"]["Row"],
  | "starts_at"
  | "ends_at"
  | "customer_id"
  | "vehicle_id"
  | "work_order_id"
  | "shop_id"
>;

export async function notifyBookingConfirmation(
  supabase: SupabaseClient<Database>,
  booking: BookingForNotification,
): Promise<boolean> {
  if (!booking.customer_id) return false;

  const [{ data: customer }, { data: vehicle }, { data: shop }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("first_name,last_name,email")
        .eq("id", booking.customer_id)
        .maybeSingle(),
      booking.vehicle_id
        ? supabase
            .from("vehicles")
            .select("year,make,model")
            .eq("id", booking.vehicle_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("shops")
        .select("timezone")
        .eq("id", booking.shop_id)
        .maybeSingle(),
    ]);

  if (!customer?.email) return false;

  const { data: lines } = booking.work_order_id
    ? await supabase
        .from("work_order_lines")
        .select("description,complaint")
        .eq("work_order_id", booking.work_order_id)
        .limit(12)
    : { data: null };

  const services = (lines ?? [])
    .map((line) => line.description || line.complaint || "")
    .filter((value): value is string => Boolean(value?.trim()));

  const timezone = shop?.timezone || "UTC";
  const appointmentTime = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(booking.starts_at));

  const customerName =
    [customer.first_name, customer.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "Customer";
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "Vehicle details on file";

  await sendBookingConfirmation({
    customerEmail: customer.email,
    customerName,
    vehicle: vehicleLabel,
    services: services.length ? services : ["Service appointment"],
    estimatedTotal: "Estimate pending",
    appointmentTime,
  });

  return true;
}
