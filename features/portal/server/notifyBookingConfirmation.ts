import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { sendBookingConfirmation } from "@/features/shared/lib/email/sendEmail";
import { upsertPortalNotification } from "@/features/portal/server/upsertPortalNotification";

type BookingForNotification = Pick<
  Database["public"]["Tables"]["bookings"]["Row"],
  | "id"
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
        .select("id,user_id,first_name,last_name,email")
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

  if (!customer) return false;

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

  if (customer.email) {
    await sendBookingConfirmation({
      customerEmail: customer.email,
      customerName,
      vehicle: vehicleLabel,
      services: services.length ? services : ["Service appointment"],
      estimatedTotal: "Estimate pending",
      appointmentTime,
    });
  }

  if (customer.user_id) {
    await upsertPortalNotification(supabase, {
      userId: customer.user_id,
      customerId: customer.id,
      workOrderId: booking.work_order_id,
      kind: "appointment_confirmed",
      title: "Appointment confirmed",
      body: `Your service appointment is confirmed for ${appointmentTime}.`,
      eventKey: `appointment_confirmed:${booking.id}`,
      href: "/portal/customer-appointments",
      metadata: { booking_id: booking.id },
    });
  }

  return Boolean(customer.email || customer.user_id);
}
