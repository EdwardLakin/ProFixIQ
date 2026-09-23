import { NextResponse } from "next/server";

import {
  canAdministerFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import type { InspectionSection } from "@/features/inspections/lib/inspection/types";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import type { Database } from "@/features/shared/types/types/supabase";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SECTIONS = 30;
const MAX_ITEMS = 200;
const CANONICAL_VEHICLE_TYPES = new Set(["car", "truck", "bus", "trailer"]);

const LEGACY_VEHICLE_TYPE_ALIASES: Record<string, string> = {
  "highway tractor": "truck",
  "dump truck": "truck",
  "service truck": "truck",
  trailer: "trailer",
  bus: "bus",
  pickup: "car",
};

function canonicalVehicleType(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (CANONICAL_VEHICLE_TYPES.has(normalized)) return normalized;
  return LEGACY_VEHICLE_TYPE_ALIASES[normalized] ?? null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

type SaveBody = {
  fleetId?: string;
  templateId?: string;
  name?: string;
  vehicleType?: string;
  sections?: unknown;
};

type TemplateInsert =
  Database["public"]["Tables"]["inspection_templates"]["Insert"];

function cleanSections(value: unknown): InspectionSection[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SECTIONS) {
    return null;
  }

  let itemCount = 0;
  const sections: InspectionSection[] = [];

  for (const rawSection of value) {
    if (!rawSection || typeof rawSection !== "object") return null;
    const section = rawSection as Record<string, unknown>;
    const title =
      typeof section.title === "string" ? section.title.trim().slice(0, 160) : "";
    if (!title || !Array.isArray(section.items) || section.items.length === 0) {
      return null;
    }

    const items: InspectionSection["items"] = [];
    for (const rawItem of section.items) {
      itemCount += 1;
      if (itemCount > MAX_ITEMS || !rawItem || typeof rawItem !== "object") {
        return null;
      }

      const item = rawItem as Record<string, unknown>;
      const label =
        typeof item.item === "string"
          ? item.item.trim().slice(0, 240)
          : typeof item.name === "string"
            ? item.name.trim().slice(0, 240)
            : "";
      if (!label) return null;

      const unit =
        typeof item.unit === "string" && item.unit.trim()
          ? item.unit.trim().slice(0, 24)
          : null;

      items.push({
        item: label,
        unit,
        status: "na",
        notes: "",
        value: null,
      });
    }

    sections.push({ title, items });
  }

  return sections;
}

async function fleetShopId(fleetId: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("fleets")
    .select("shop_id")
    .eq("id", fleetId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.shop_id ?? null;
}

function fleetTag(fleetId: string): string {
  return `fleet:${fleetId}`;
}

export async function GET(request: Request) {
  try {
    const requestedFleetId = new URL(request.url).searchParams.get("fleetId");
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId,
    });
    const fleetId = requestedFleetId ?? actor.primaryFleetId;

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !fleetId ||
      !UUID.test(fleetId) ||
      !canAdministerFleetForActor(actor, fleetId)
    ) {
      return NextResponse.json(
        { error: "Fleet manager access required" },
        { status: 403 },
      );
    }

    const shopId = await fleetShopId(fleetId);
    if (!shopId) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("inspection_templates")
      .select(
        "id,template_name,vehicle_type,description,tags,sections,created_at,updated_at",
      )
      .eq("shop_id", shopId)
      .contains("tags", ["fleet-maintenance", fleetTag(fleetId)])
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[fleet/inspection-templates] list", error);
      return NextResponse.json(
        { error: "Unable to load Fleet inspection templates" },
        { status: 500 },
      );
    }

    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error("[fleet/inspection-templates] list unexpected", error);
    return NextResponse.json(
      { error: "Unable to load Fleet inspection templates" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SaveBody;
    const requestedFleetId = body.fleetId?.trim() ?? "";
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: requestedFleetId || null,
    });
    const fleetId = requestedFleetId || actor.primaryFleetId || "";

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !UUID.test(fleetId) ||
      !canAdministerFleetForActor(actor, fleetId)
    ) {
      return NextResponse.json(
        { error: "Fleet manager access required" },
        { status: 403 },
      );
    }

    const templateId = body.templateId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const requestedVehicleType = body.vehicleType?.trim() ?? "";
    const vehicleType = canonicalVehicleType(requestedVehicleType) ?? "";
    const rawItemCount = Array.isArray(body.sections)
      ? body.sections.reduce((total, section) => {
          if (!section || typeof section !== "object") return total;
          const items = (section as Record<string, unknown>).items;
          return total + (Array.isArray(items) ? items.length : 0);
        }, 0)
      : 0;
    const sections = cleanSections(body.sections);

    if (!UUID.test(templateId)) {
      return NextResponse.json(
        { error: "A valid template id is required" },
        { status: 400 },
      );
    }
    if (!name || name.length > 120) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 },
      );
    }
    if (!vehicleType) {
      return NextResponse.json(
        {
          error:
            "Choose a specific Shop-compatible vehicle type: heavy truck, trailer, bus/coach, or light duty.",
        },
        { status: 400 },
      );
    }
    if (rawItemCount > MAX_ITEMS) {
      return NextResponse.json(
        { error: `Inspection templates support up to ${MAX_ITEMS} items` },
        { status: 400 },
      );
    }
    if (!sections) {
      return NextResponse.json(
        { error: "Select at least one valid inspection item" },
        { status: 400 },
      );
    }

    const shopId = await fleetShopId(fleetId);
    if (!shopId) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    const admin = createAdminSupabase();
    const tags = [
      "fleet",
      "fleet-maintenance",
      "fleet-authored",
      fleetTag(fleetId),
    ];

    const { data: existing, error: existingError } = await admin
      .from("inspection_templates")
      .select("id,shop_id,tags,template_name,vehicle_type,sections")
      .eq("id", templateId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) {
      const existingTags = existing.tags ?? [];
      const replay =
        existing.shop_id === shopId &&
        existingTags.includes("fleet-maintenance") &&
        existingTags.includes(fleetTag(fleetId));
      if (!replay) {
        return NextResponse.json(
          { error: "Template id is already in use" },
          { status: 409 },
        );
      }
      const samePayload =
        existing.template_name === name &&
        existing.vehicle_type === vehicleType &&
        stableJson(existing.sections) === stableJson(sections);
      if (!samePayload) {
        return NextResponse.json(
          {
            error:
              "This Fleet inspection draft was already published with different content. Refresh before publishing again.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ id: existing.id, replayed: true });
    }

    const insert: TemplateInsert = {
      id: templateId,
      user_id: actor.userId,
      shop_id: shopId,
      template_name: name,
      description:
        "Fleet-authored maintenance inspection. Runs through ProFixIQ Shop when requested and accepted by a subscribed Shop.",
      vehicle_type: vehicleType,
      sections:
        sections as unknown as TemplateInsert["sections"],
      tags,
      is_public: false,
    };

    const { data, error } = await admin
      .from("inspection_templates")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      console.error("[fleet/inspection-templates] save", error);
      return NextResponse.json(
        { error: "Unable to publish Fleet inspection template" },
        { status: 500 },
      );
    }

    const { error: activityError } = await admin.from("activity_logs").insert({
      user_id: actor.userId,
      action: "fleet_maintenance_inspection_template_published",
      target_table: "inspection_templates",
      target_id: data.id,
      context: {
        fleet_id: fleetId,
        shop_id: shopId,
        vehicle_type: vehicleType,
      },
    });
    if (activityError) {
      console.error(
        "[fleet/inspection-templates] activity log",
        activityError,
      );
    }

    return NextResponse.json({ id: data.id, replayed: false });
  } catch (error) {
    console.error("[fleet/inspection-templates] save unexpected", error);
    return NextResponse.json(
      { error: "Unable to publish Fleet inspection template" },
      { status: 500 },
    );
  }
}
