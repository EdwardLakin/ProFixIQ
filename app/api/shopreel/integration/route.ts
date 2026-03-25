import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { postStoryEventToShopReel } from "@/features/integrations/shopreel/server/postStoryEventToShopReel";

type DB = Database;

async function getOwnerShopContext() {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message, status: 500 as const };
  }

  if (!membership?.shop_id) {
    return { error: "Owner shop membership not found.", status: 403 as const };
  }

  return {
    supabase,
    user,
    shopId: membership.shop_id as string,
  };
}

export async function GET() {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { supabase, shopId } = context;

  const { data, error } = await supabase
    .from("shopreel_integrations")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    integration: {
      shopId,
      enabled: data?.enabled ?? false,
      remoteShopId: data?.remote_shop_id ?? null,
      shopreelBaseUrl:
        data?.shopreel_base_url ??
        process.env.SHOPREEL_BASE_URL ??
        "https://shopreel.profixiq.com",
      enabledEventTypes: data?.enabled_event_types ?? [
        "inspection.completed",
        "inspection.finding.flagged",
        "workorder.approved",
        "workorder.completed",
        "media.before_after.added",
      ],
      lastTestedAt: data?.last_tested_at ?? null,
      lastSuccessAt: data?.last_success_at ?? null,
      lastErrorAt: data?.last_error_at ?? null,
      lastErrorMessage: data?.last_error_message ?? null,
    },
  });
}

export async function POST(request: NextRequest) {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { supabase, user, shopId } = context;
  const body = await request.json();

  const enabled = Boolean(body?.enabled);
  const remoteShopId =
    typeof body?.remoteShopId === "string" && body.remoteShopId.trim().length
      ? body.remoteShopId.trim()
      : null;
  const shopreelBaseUrl =
    typeof body?.shopreelBaseUrl === "string" && body.shopreelBaseUrl.trim().length
      ? body.shopreelBaseUrl.trim()
      : process.env.SHOPREEL_BASE_URL ?? "https://shopreel.profixiq.com";
  const enabledEventTypes = Array.isArray(body?.enabledEventTypes)
    ? body.enabledEventTypes.filter((value: unknown): value is string => typeof value === "string")
    : [
        "inspection.completed",
        "inspection.finding.flagged",
        "workorder.approved",
        "workorder.completed",
        "media.before_after.added",
      ];

  const { data, error } = await supabase
    .from("shopreel_integrations")
    .upsert(
      {
        shop_id: shopId,
        enabled,
        remote_shop_id: remoteShopId,
        shopreel_base_url: shopreelBaseUrl,
        enabled_event_types: enabledEventTypes,
        updated_by: user.id,
        created_by: user.id,
      },
      { onConflict: "shop_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    integration: {
      shopId,
      enabled: data.enabled,
      remoteShopId: data.remote_shop_id,
      shopreelBaseUrl: data.shopreel_base_url,
      enabledEventTypes: data.enabled_event_types,
      lastTestedAt: data.last_tested_at,
      lastSuccessAt: data.last_success_at,
      lastErrorAt: data.last_error_at,
      lastErrorMessage: data.last_error_message,
    },
  });
}

export async function PUT() {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { supabase, shopId } = context;

  const { data: integration, error: integrationError } = await supabase
    .from("shopreel_integrations")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json({ error: integrationError.message }, { status: 500 });
  }

  if (!integration?.enabled) {
    return NextResponse.json(
      { error: "Enable the ShopReel integration before sending a test event." },
      { status: 400 }
    );
  }

  const testEvent = {
    eventId: crypto.randomUUID(),
    eventType: "workorder.completed" as const,
    occurredAt: new Date().toISOString(),
    source: {
      app: "profixiq" as const,
      shopId,
      locationId: null,
    },
    subject: {
      workOrderId: null,
      workOrderNumber: "TEST-WO",
      inspectionId: null,
      vehicleId: null,
      customerLabel: "Customer",
      vehicleLabel: "2020 Ford F-150",
    },
    storyData: {
      headline: "Test completed repair story",
      summary: "Test event from ProFixIQ Marketing settings.",
      findings: [
        {
          label: "Brake wear identified and resolved",
          status: "failed" as const,
          category: "brakes",
        },
      ],
      services: [
        {
          label: "Front brake service",
          kind: "repair" as const,
        },
      ],
      media: [],
      approvalStatus: "approved" as const,
      technicianSummary: "Vehicle repaired and test drive completed.",
    },
    privacy: {
      containsSensitiveData: false as const,
      redactionsApplied: [],
    },
  };

  try {
    const result = await postStoryEventToShopReel(testEvent);

    await supabase
      .from("shopreel_integrations")
      .update({
        last_tested_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId);

    return NextResponse.json({
      ok: true,
      message: result.message ?? "Test event sent.",
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send test event.",
      },
      { status: 500 }
    );
  }
}
