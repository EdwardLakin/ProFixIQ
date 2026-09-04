import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Technician CoPilot's rollout flags share the AI automation capability
// table, but they are a plain on/off gate with no readiness/learning
// certification behind them (see features/copilot/technician/server/capability.ts).
// They intentionally do not go through /api/settings/ai-automation, whose
// PUT handler only accepts AI_AUTOMATION_CAPABILITIES and would otherwise
// subject these flags to a "ready" execution-readiness check that does not
// apply to them.
const TECHNICIAN_COPILOT_CAPABILITIES = [
  "technician_copilot_text",
  "technician_copilot_documentation",
  "technician_copilot_voice",
] as const;
type TechnicianCopilotCapability = (typeof TECHNICIAN_COPILOT_CAPABILITIES)[number];

type CapabilityState = Record<TechnicianCopilotCapability, boolean>;

function emptyState(): CapabilityState {
  return {
    technician_copilot_text: false,
    technician_copilot_documentation: false,
    technician_copilot_voice: false,
  };
}

async function requireOwnerAccess(request?: Request) {
  return requireShopScopedApiAccess({
    requiredCapability: "canManageBranding",
    allowRoles: ["owner", "admin"],
    requireOwnerPin: Boolean(request),
    ownerPinRequest: request,
    ownerPinAllowedPurposes: [
      OWNER_PIN_PURPOSES.SETTINGS,
      OWNER_PIN_PURPOSES.PRIVILEGED,
    ],
  });
}

async function readShopCapabilities(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  shopId: string,
): Promise<CapabilityState> {
  const state = emptyState();
  const { data, error } = await supabase
    .from("ai_automation_capability_settings")
    .select("capability,enabled")
    .eq("shop_id", shopId)
    .in("capability", [...TECHNICIAN_COPILOT_CAPABILITIES]);

  if (error) return state;

  for (const row of data ?? []) {
    const capability = row.capability as string;
    if ((TECHNICIAN_COPILOT_CAPABILITIES as readonly string[]).includes(capability)) {
      state[capability as TechnicianCopilotCapability] = row.enabled === true;
    }
  }
  return state;
}

export async function GET() {
  const access = await requireOwnerAccess();
  if (!access.ok) return access.response;
  try {
    const capabilities = await readShopCapabilities(
      access.supabase,
      access.profile.shop_id,
    );
    return NextResponse.json({ ok: true, capabilities });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Technician CoPilot settings",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const access = await requireOwnerAccess(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Partial<
    Record<TechnicianCopilotCapability, boolean>
  > | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Capability settings are required" },
      { status: 400 },
    );
  }

  const entries = Object.entries(body).filter(
    (entry): entry is [TechnicianCopilotCapability, boolean] =>
      (TECHNICIAN_COPILOT_CAPABILITIES as readonly string[]).includes(entry[0]) &&
      typeof entry[1] === "boolean",
  );
  if (entries.length !== Object.keys(body).length || entries.length === 0) {
    return NextResponse.json(
      { error: "Invalid Technician CoPilot capability setting" },
      { status: 400 },
    );
  }

  try {
    const existing = await readShopCapabilities(
      access.supabase,
      access.profile.shop_id,
    );
    const merged: CapabilityState = { ...existing };
    for (const [capability, enabled] of entries) merged[capability] = enabled;

    // Documentation and voice both require the base text capability: the
    // chat/session API rejects every turn for a technician whose text
    // capability is off, regardless of the other flags, so allowing them to
    // be enabled alone would silently strand the technician.
    if (
      (merged.technician_copilot_documentation || merged.technician_copilot_voice) &&
      !merged.technician_copilot_text
    ) {
      return NextResponse.json(
        {
          error:
            "Enable Technician CoPilot text before enabling documentation or voice.",
        },
        { status: 400 },
      );
    }

    const { error } = await access.supabase
      .from("ai_automation_capability_settings")
      .upsert(
        entries.map(([capability, enabled]) => ({
          shop_id: access.profile.shop_id,
          capability,
          enabled,
          updated_by: access.profile.id,
        })),
        { onConflict: "shop_id,capability" },
      );
    if (error) throw new Error(error.message);

    const capabilities = await readShopCapabilities(
      access.supabase,
      access.profile.shop_id,
    );
    return NextResponse.json({ ok: true, capabilities });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save Technician CoPilot settings",
      },
      { status: 500 },
    );
  }
}
