import { NextResponse } from "next/server";
import {
  AI_AUTOMATION_CAPABILITIES,
  isAiAutomationCapability,
  type AiAutomationCapability,
} from "@/features/ai/automation/types";
import {
  AI_AUTOMATION_EXECUTION_AVAILABLE,
  getAiAutomationPolicy,
} from "@/features/ai/server/automationPolicy";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { insertEvent } from "@/features/shared/lib/server/event";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";

type UpdateBody = {
  enabled?: Partial<Record<AiAutomationCapability, boolean>>;
  automationPaused?: boolean;
};

async function requireOwnerAccess(request?: Request) {
  return requireShopScopedApiAccess({
    requiredCapability: "canManageBranding",
    allowRoles: ["owner", "admin"],
    requireOwnerPin: Boolean(request),
    ownerPinRequest: request,
    ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS, OWNER_PIN_PURPOSES.PRIVILEGED],
  });
}

export async function GET() {
  const access = await requireOwnerAccess();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({
      ok: true,
      policy: await getAiAutomationPolicy(access.supabase, access.profile.shop_id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load AI automation settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = await requireOwnerAccess(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  const rawEnabled = body?.enabled;
  const hasPauseUpdate = typeof body?.automationPaused === "boolean";
  if ((!rawEnabled || typeof rawEnabled !== "object" || Array.isArray(rawEnabled)) && !hasPauseUpdate) {
    return NextResponse.json({ error: "Automation capability or pause settings are required" }, { status: 400 });
  }
  const enabledEntries = Object.entries(rawEnabled ?? {}).filter(
    (entry): entry is [AiAutomationCapability, boolean] =>
      isAiAutomationCapability(entry[0]) && typeof entry[1] === "boolean",
  );
  if (enabledEntries.length !== Object.keys(rawEnabled ?? {}).length) {
    return NextResponse.json({ error: "Invalid AI automation capability setting" }, { status: 400 });
  }

  try {
    const before = await getAiAutomationPolicy(access.supabase, access.profile.shop_id);
    for (const [capability, enabled] of enabledEntries) {
      if (!enabled || before.ownerEnabled[capability]) continue;
      if (!AI_AUTOMATION_EXECUTION_AVAILABLE[capability]) {
        return NextResponse.json({ error: `${capability} is not certified for execution yet` }, { status: 400 });
      }
      if (before.readiness[capability].status !== "ready") {
        return NextResponse.json({ error: `${capability} has not earned shop readiness yet` }, { status: 400 });
      }
    }

    if (enabledEntries.length > 0) {
      const { error } = await access.supabase.from("ai_automation_capability_settings").upsert(
        enabledEntries.map(([capability, enabled]) => ({
          shop_id: access.profile.shop_id,
          capability,
          enabled,
          updated_by: access.profile.id,
        })),
        { onConflict: "shop_id,capability" },
      );
      if (error) throw new Error(error.message);
    }
    if (hasPauseUpdate) {
      const automationPaused = body?.automationPaused === true;
      const { error } = await access.supabase.from("ai_automation_shop_controls").upsert({
        shop_id: access.profile.shop_id,
        automation_paused: automationPaused,
        pause_reason: automationPaused ? "owner_paused" : null,
        paused_at: automationPaused ? new Date().toISOString() : null,
        updated_by: access.profile.id,
      }, { onConflict: "shop_id" });
      if (error) throw new Error(error.message);
    }

    const policy = await getAiAutomationPolicy(access.supabase, access.profile.shop_id);
    const changedCapabilities = AI_AUTOMATION_CAPABILITIES.filter(
      (capability) => before.ownerEnabled[capability] !== policy.ownerEnabled[capability],
    );
    const eventResult = await insertEvent(access.supabase, {
      shopId: access.profile.shop_id,
      userId: access.profile.id,
      type: "ai_automation_policy_updated",
      entityId: access.profile.shop_id,
      entityTable: "shops",
      payload: {
        schema_version: 1,
        changed_capabilities: changedCapabilities,
        automation_paused_before: before.automationPaused,
        automation_paused_after: policy.automationPaused,
        before: Object.fromEntries(changedCapabilities.map((capability) => [capability, before.ownerEnabled[capability]])),
        after: Object.fromEntries(changedCapabilities.map((capability) => [capability, policy.ownerEnabled[capability]])),
      },
    });
    return NextResponse.json({
      ok: true,
      policy,
      warning: eventResult?.error ? "Settings saved, but the audit event could not be recorded" : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save AI automation settings" }, { status: 500 });
  }
}
