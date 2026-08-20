import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

import {
  isDateKey,
  isFieldTruckRecordType,
  isIsoTimestamp,
  isUuid,
  toNonNegativeNumber,
  toNullableText,
} from "@/features/mobile/service/myTruck";
import {
  FIELD_TRUCK_RECORD_SELECT,
  loadFieldMyTruckSnapshot,
  resolveAssignedFieldTruck,
} from "@/features/mobile/service/server/myTruck";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";

type RecordInsert =
  Database["public"]["Tables"]["field_truck_records"]["Insert"];

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getContext() {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access;
  try {
    const truck = await resolveAssignedFieldTruck({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      profileId: access.profile.id,
    });
    return { ...access, truck };
  } catch (error) {
    console.error("[field/my-truck] assignment lookup failed", error);
    return {
      ok: false as const,
      response: errorResponse("Unable to verify the assigned Field truck.", 500),
    };
  }
}

export async function GET(request: Request) {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;

  try {
    const monthKey = new URL(request.url).searchParams.get("month") ?? "";
    const snapshot = await loadFieldMyTruckSnapshot({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      profileId: access.profile.id,
      monthKey: /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) ? monthKey : undefined,
    });
    return NextResponse.json(
      { ok: true, ...snapshot },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[field/my-truck] snapshot failed", error);
    return errorResponse("Unable to load My Truck.", 500);
  }
}

export async function POST(request: Request) {
  const access = await getContext();
  if (!access.ok) return access.response;
  if (!access.truck) return errorResponse("No Field truck is assigned to you.", 409);

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || !isFieldTruckRecordType(body.recordType)) {
    return errorResponse("Choose a valid truck record type.");
  }
  if (body.recordType === "document") {
    return errorResponse("Documents must include a file upload.");
  }
  if (!isUuid(body.operationKey)) {
    return errorResponse("A valid operation key is required.");
  }

  const title = toNullableText(body.title, 180);
  if (!title) return errorResponse("A title is required.");

  const occurredOn = body.occurredOn;
  const dueOn = body.dueOn;
  const startsAt = body.startsAt;
  const endsAt = body.endsAt;
  if (
    occurredOn !== undefined &&
    occurredOn !== null &&
    !isDateKey(occurredOn)
  ) {
    return errorResponse("Enter a valid activity date.");
  }
  if (
    dueOn !== undefined &&
    dueOn !== null &&
    dueOn !== "" &&
    !isDateKey(dueOn)
  ) {
    return errorResponse("Enter a valid reminder date.");
  }
  if (
    startsAt !== undefined &&
    startsAt !== null &&
    !isIsoTimestamp(startsAt)
  ) {
    return errorResponse("Enter a valid downtime start.");
  }
  if (
    endsAt !== undefined &&
    endsAt !== null &&
    endsAt !== "" &&
    !isIsoTimestamp(endsAt)
  ) {
    return errorResponse("Enter a valid downtime end.");
  }

  const odometer = toNonNegativeNumber(body.odometer);
  const amount = toNonNegativeNumber(body.amount);
  const dueOdometer = toNonNegativeNumber(body.dueOdometer);
  if (body.recordType === "odometer" && odometer === null) {
    return errorResponse("Enter a valid odometer reading.");
  }
  if (body.recordType === "expense" && amount === null) {
    return errorResponse("Enter a valid cost amount.");
  }
  if (
    body.recordType === "reminder" &&
    !(typeof dueOn === "string" && dueOn) &&
    dueOdometer === null
  ) {
    return errorResponse("A reminder needs a date or odometer target.");
  }
  if (body.recordType === "downtime" && !isIsoTimestamp(startsAt)) {
    return errorResponse("Downtime needs a valid start time.");
  }
  if (
    body.recordType === "downtime" &&
    isIsoTimestamp(endsAt) &&
    Date.parse(endsAt) <= Date.parse(startsAt as string)
  ) {
    return errorResponse("Downtime must end after it starts.");
  }

  const currency = (toNullableText(body.currency, 3) ?? "CAD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return errorResponse("Currency is invalid.");

  const row: RecordInsert = {
    shop_id: access.profile.shop_id,
    service_vehicle_id: access.truck.id,
    created_by_profile_id: access.profile.id,
    operation_key: body.operationKey,
    record_type: body.recordType,
    title,
    occurred_on:
      typeof occurredOn === "string"
        ? occurredOn
        : ["odometer", "maintenance", "expense"].includes(body.recordType)
          ? new Date().toISOString().slice(0, 10)
          : null,
    odometer,
    odometer_unit:
      odometer === null && dueOdometer === null
        ? null
        : toNullableText(body.odometerUnit, 12) ?? "km",
    amount,
    currency: amount === null ? null : currency,
    vendor: toNullableText(body.vendor, 180),
    due_on: typeof dueOn === "string" && dueOn ? dueOn : null,
    due_odometer: dueOdometer,
    starts_at: typeof startsAt === "string" ? new Date(startsAt).toISOString() : null,
    ends_at:
      typeof endsAt === "string" && endsAt
        ? new Date(endsAt).toISOString()
        : null,
    status:
      body.recordType === "downtime" && typeof endsAt === "string" && endsAt
        ? "completed"
        : body.recordType === "reminder" || body.recordType === "downtime"
          ? "open"
          : "completed",
    notes: toNullableText(body.notes),
  };

  const { data: replay, error: replayError } = await access.supabase
    .from("field_truck_records")
    .select(FIELD_TRUCK_RECORD_SELECT)
    .eq("shop_id", access.profile.shop_id)
    .eq("service_vehicle_id", access.truck.id)
    .eq("operation_key", body.operationKey)
    .maybeSingle();
  if (replayError) {
    return errorResponse("Truck record replay could not be verified.", 500);
  }
  if (replay) {
    return NextResponse.json({ ok: true, replayed: true, record: replay });
  }

  const { data, error } = await access.supabase
    .from("field_truck_records")
    .insert(row)
    .select(FIELD_TRUCK_RECORD_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: concurrentReplay } = await access.supabase
        .from("field_truck_records")
        .select(FIELD_TRUCK_RECORD_SELECT)
        .eq("shop_id", access.profile.shop_id)
        .eq("service_vehicle_id", access.truck.id)
        .eq("operation_key", body.operationKey)
        .maybeSingle();
      if (concurrentReplay) {
        return NextResponse.json({
          ok: true,
          replayed: true,
          record: concurrentReplay,
        });
      }
    }
    console.error("[field/my-truck] record create failed", error);
    return errorResponse("Truck record could not be saved.", 409);
  }

  return NextResponse.json({ ok: true, record: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await getContext();
  if (!access.ok) return access.response;
  if (!access.truck) return errorResponse("No Field truck is assigned to you.", 409);

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    action?: unknown;
    endedAt?: unknown;
  } | null;
  const id = toNullableText(body?.id, 80);
  const action = body?.action;
  if (!isUuid(id)) {
    return errorResponse("Invalid truck record.");
  }
  if (!["complete", "reopen", "end_downtime"].includes(String(action))) {
    return errorResponse("Invalid truck record action.");
  }

  const { data: existing, error: readError } = await access.supabase
    .from("field_truck_records")
    .select("id,record_type,starts_at")
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .eq("service_vehicle_id", access.truck.id)
    .maybeSingle<{ id: string; record_type: string; starts_at: string | null }>();
  if (readError) return errorResponse("Truck record could not be verified.", 500);
  if (!existing) return errorResponse("Truck record was not found.", 404);

  let endedAt: string | null = null;
  if (action === "end_downtime") {
    if (existing.record_type !== "downtime" || !existing.starts_at) {
      return errorResponse("Only active downtime can be ended.", 409);
    }
    endedAt = isIsoTimestamp(body?.endedAt)
      ? new Date(body.endedAt).toISOString()
      : new Date().toISOString();
    if (Date.parse(endedAt) <= Date.parse(existing.starts_at)) {
      return errorResponse("Downtime must end after it starts.");
    }
  } else {
    if (existing.record_type !== "reminder") {
      return errorResponse("Only reminders can be completed or reopened.", 409);
    }
  }

  const { data, error } = await access.supabase.rpc(
    "field_transition_truck_record",
    {
      p_record_id: existing.id,
      p_action: String(action),
      ...(endedAt ? { p_ended_at: endedAt } : {}),
    },
  );
  if (error) return errorResponse("Truck record could not be updated.", 409);
  return NextResponse.json({ ok: true, record: data });
}
