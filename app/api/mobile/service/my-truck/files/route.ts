import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  isDateKey,
  isUuid,
  toNonNegativeNumber,
  toNullableText,
} from "@/features/mobile/service/myTruck";
import {
  FIELD_TRUCK_RECORD_SELECT,
  resolveAssignedFieldTruck,
} from "@/features/mobile/service/server/myTruck";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const BUCKET = "field-truck-files";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const EXTENSIONS = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

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

export async function GET(request: NextRequest) {
  const access = await getContext();
  if (!access.ok) return access.response;
  if (!access.truck) return errorResponse("No Field truck is assigned to you.", 409);

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return errorResponse("Invalid truck file.");
  }
  const { data: record, error } = await access.supabase
    .from("field_truck_records")
    .select("id,record_type,file_bucket,file_path")
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .eq("service_vehicle_id", access.truck.id)
    .not("file_path", "is", null)
    .maybeSingle<{
      id: string;
      record_type: string;
      file_bucket: string | null;
      file_path: string | null;
    }>();
  if (error) return errorResponse("Truck file could not be verified.", 500);
  if (!record?.file_path || record.file_bucket !== BUCKET) {
    return errorResponse("Truck file was not found.", 404);
  }
  const expectedPrefix = `${access.profile.shop_id}/${access.truck.id}/`;
  const pathParts = record.file_path.split("/");
  const expectedFolder =
    record.record_type === "document"
      ? "documents"
      : record.record_type === "expense"
        ? "receipts"
        : null;
  if (
    !expectedFolder ||
    !record.file_path.startsWith(expectedPrefix) ||
    pathParts.length !== 5 ||
    pathParts[2] !== expectedFolder ||
    pathParts[3] !== record.id ||
    !pathParts[4]
  ) {
    return errorResponse("Truck file path is outside the assigned truck.", 403);
  }

  const admin = createAdminSupabase();
  const { data, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(record.file_path, 60);
  if (signError || !data?.signedUrl) {
    return errorResponse("Truck file could not be opened.", 500);
  }
  return NextResponse.json(
    { ok: true, url: data.signedUrl },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const access = await getContext();
  if (!access.ok) return access.response;
  if (!access.truck) return errorResponse("No Field truck is assigned to you.", 409);

  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return errorResponse("A multipart file upload is required.");
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const recordType = String(form?.get("recordType") ?? "").trim();
  const title = toNullableText(form?.get("title"), 180);
  const operationKey = String(form?.get("operationKey") ?? "").trim();
  if (!(file instanceof File) || file.size <= 0) {
    return errorResponse("Choose a non-empty file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse("Truck files must be 4 MB or smaller.", 413);
  }
  const extension = EXTENSIONS.get(file.type.toLowerCase());
  if (!extension) return errorResponse("Upload a PDF, JPEG, PNG, or WebP file.");
  if (!title) return errorResponse("A title is required.");
  if (!isUuid(operationKey)) {
    return errorResponse("A valid operation key is required.");
  }
  if (!["document", "expense"].includes(recordType)) {
    return errorResponse("Choose a document or expense receipt upload.");
  }

  const occurredOnValue = String(form?.get("occurredOn") ?? "").trim();
  const dueOnValue = String(form?.get("dueOn") ?? "").trim();
  const amount = toNonNegativeNumber(form?.get("amount"));
  if (occurredOnValue && !isDateKey(occurredOnValue)) {
    return errorResponse("Enter a valid cost date.");
  }
  if (dueOnValue && !isDateKey(dueOnValue)) {
    return errorResponse("Enter a valid document expiry date.");
  }
  if (recordType === "expense" && amount === null) {
    return errorResponse("Enter a valid cost amount.");
  }

  const currency = (toNullableText(form?.get("currency"), 3) ?? "CAD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return errorResponse("Currency is invalid.");

  const { data: replay, error: replayError } = await access.supabase
    .from("field_truck_records")
    .select(FIELD_TRUCK_RECORD_SELECT)
    .eq("shop_id", access.profile.shop_id)
    .eq("service_vehicle_id", access.truck.id)
    .eq("operation_key", operationKey)
    .maybeSingle();
  if (replayError) {
    return errorResponse("Truck file replay could not be verified.", 500);
  }
  if (replay) {
    return NextResponse.json({ ok: true, replayed: true, record: replay });
  }

  const recordId = randomUUID();
  const folder = recordType === "document" ? "documents" : "receipts";
  const storagePath = `${access.profile.shop_id}/${access.truck.id}/${folder}/${recordId}/${randomUUID()}.${extension}`;
  const admin = createAdminSupabase();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("[field/my-truck] file upload failed", uploadError);
    return errorResponse("Truck file could not be uploaded.", 500);
  }

  const { data, error: insertError } = await access.supabase
    .from("field_truck_records")
    .insert({
      id: recordId,
      shop_id: access.profile.shop_id,
      service_vehicle_id: access.truck.id,
      created_by_profile_id: access.profile.id,
      operation_key: operationKey,
      record_type: recordType,
      title,
      occurred_on:
        recordType === "expense"
          ? occurredOnValue || new Date().toISOString().slice(0, 10)
          : null,
      amount: recordType === "expense" ? amount : null,
      currency: recordType === "expense" ? currency : null,
      vendor: toNullableText(form?.get("vendor"), 180),
      due_on: recordType === "document" ? dueOnValue || null : null,
      status: "completed",
      notes: toNullableText(form?.get("notes")),
      file_bucket: BUCKET,
      file_path: storagePath,
      original_filename: file.name.slice(0, 255),
      content_type: file.type,
      file_size_bytes: file.size,
    })
    .select(FIELD_TRUCK_RECORD_SELECT)
    .single();

  if (insertError || !data) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    if (insertError?.code === "23505") {
      const { data: concurrentReplay } = await access.supabase
        .from("field_truck_records")
        .select(FIELD_TRUCK_RECORD_SELECT)
        .eq("shop_id", access.profile.shop_id)
        .eq("service_vehicle_id", access.truck.id)
        .eq("operation_key", operationKey)
        .maybeSingle();
      if (concurrentReplay) {
        return NextResponse.json({
          ok: true,
          replayed: true,
          record: concurrentReplay,
        });
      }
    }
    console.error("[field/my-truck] file metadata failed", insertError);
    return errorResponse("Truck file metadata could not be saved.", 500);
  }

  return NextResponse.json({ ok: true, record: data }, { status: 201 });
}
