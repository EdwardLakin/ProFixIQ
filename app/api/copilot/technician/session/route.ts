import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import type {
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "@/features/copilot/technician/session/types";
import { projectTechnicianContext } from "@/features/copilot/technician/session/projectTechnicianContext";
import {
  listTechnicianWorkCandidates,
  loadTechnicianWorkCandidateForWorkOrder,
} from "@/features/copilot/technician/server/assignedWork";
import {
  requireTechnicianCopilotAccess,
  TechnicianCopilotAccessError,
} from "@/features/copilot/technician/server/auth";
import { sendCopilotServerCommand } from "@/features/copilot/technician/server/transport";
import {
  buildTechnicianDayAgenda,
  describeTechnicianDayAgenda,
} from "@/features/copilot/technician/server/dayAgenda";
import { listTechnicianConversationDigest } from "@/features/copilot/technician/server/messages";
import { getActiveTechnicianJobLabor } from "@/features/work-orders/server/technicianJobLabor";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";

export const runtime = "nodejs";

type Envelope = {
  session: null | {
    id: string;
    workOrderId: string;
    mode: RepairSessionMode;
    status: RepairSessionStatus;
  };
  events: RepairSessionEvent[];
};

async function snapshot(
  request: NextRequest,
  explicitSessionId?: string | null,
) {
  const access = await requireTechnicianCopilotAccess();
  const sessionId =
    explicitSessionId ?? request.nextUrl.searchParams.get("sessionId");
  const envelope = await sendCopilotServerCommand<Envelope>({
    authUserId: access.authUserId,
    profileId: access.profileId,
    shopId: access.shopId,
    action: "session.read",
    args: { sessionId },
  });

  const workOrder = envelope.session
    ? await loadTechnicianWorkCandidateForWorkOrder({
        supabase: createAdminSupabase(),
        shopId: access.shopId,
        technicianIds: [access.authUserId, access.profileId],
        workOrderId: envelope.session.workOrderId,
      })
    : null;
  const context = envelope.session
    ? projectTechnicianContext({
        repairSessionId: envelope.session.id,
        mode: envelope.session.mode,
        status: envelope.session.status,
        events: envelope.events,
      })
    : null;

  // The full assigned queue is computed regardless of session state, not
  // just when idle: the client uses it both for the idle-state greeting
  // below and to notice newly-assigned work while a job is already active
  // (see dayAgendaAnnouncements on the client). It's one cheap, already
  // shop/technician-scoped query either way.
  const candidates = await listTechnicianWorkCandidates({
    supabase: createAdminSupabase(),
    shopId: access.shopId,
    technicianIds: [access.authUserId, access.profileId],
  });

  // Ground truth for "currently punched in": an open labor segment, not a
  // line's own status. A line can still read "in_progress" long after the
  // technician actually punched out (e.g. an auto punch-out at shift end
  // deliberately preserves line status so the job still reads as
  // unfinished), so status alone would misreport the technician as active.
  const { data: openLaborSegments } = await getActiveTechnicianJobLabor({
    supabase: createAdminSupabase(),
    shopId: access.shopId,
    technicianId: access.profileId,
  });
  const punchedInLineIds = new Set(
    openLaborSegments
      .map((segment) => segment.work_order_line_id)
      .filter((lineId): lineId is string => Boolean(lineId)),
  );
  const dayAgenda = buildTechnicianDayAgenda(candidates, punchedInLineIds);

  // No active repair session yet: this is the CoPilot's idle state, so this
  // is also when it has something proactive to say — the technician's full
  // assigned queue for the day, not just the next single line. Once a
  // session starts, the ordinary turn runtime takes over and this stops
  // being computed, which naturally limits it to "once per idle open"
  // rather than needing separate once-a-day tracking.
  let greeting: string | null = null;
  if (!envelope.session) {
    // The salutation ("Good morning"/"afternoon"/"evening") has to read
    // against the shop's own clock, not the server's — same normalization
    // deliverDailyAssistantDigest already relies on for shop-local time.
    const { data: shop } = await createAdminSupabase()
      .from("shops")
      .select("timezone")
      .eq("id", access.shopId)
      .maybeSingle();
    const safeTimezone = getShopDayRange(shop?.timezone ?? null).timezone;
    greeting = describeTechnicianDayAgenda(
      dayAgenda,
      access.technicianName,
      new Date(),
      safeTimezone,
    );
  }

  // Conversation participation is keyed by the true auth user id
  // (conversation_participants.user_id), not the profiles row id — the two
  // are distinct in this schema, unlike the work-order assignment queries
  // above which accept either.
  const conversationDigest = await listTechnicianConversationDigest({
    supabase: createAdminSupabase(),
    shopId: access.shopId,
    actorUserId: access.authUserId,
  });

  return {
    envelope,
    context,
    workOrder,
    access,
    greeting,
    dayAgenda,
    conversationDigest,
  };
}

function capabilities(
  access: Awaited<ReturnType<typeof requireTechnicianCopilotAccess>>,
) {
  return {
    documentation: access.capabilities.documentation,
    voice: access.capabilities.voice,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("accessOnly") === "1") {
      const access = await requireTechnicianCopilotAccess();
      return NextResponse.json({ capabilities: capabilities(access) });
    }

    const result = await snapshot(request);
    return NextResponse.json({
      session: result.envelope.session,
      context: result.context,
      workOrder: result.workOrder,
      greeting: result.greeting,
      dayAgenda: result.dayAgenda,
      conversationDigest: result.conversationDigest,
      shopId: result.access.shopId,
      capabilities: capabilities(result.access),
    });
  } catch (error) {
    if (error instanceof TechnicianCopilotAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read CoPilot session.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireTechnicianCopilotAccess();
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const workOrderId =
      typeof body.workOrderId === "string" ? body.workOrderId : "";
    if (!workOrderId) {
      return NextResponse.json(
        { error: "workOrderId is required." },
        { status: 400 },
      );
    }

    const mode: RepairSessionMode =
      body.mode === "field" || body.mode === "fleet" ? body.mode : "shop";
    const started = await sendCopilotServerCommand<{ sessionId: string }>({
      authUserId: access.authUserId,
      profileId: access.profileId,
      shopId: access.shopId,
      action: "session.start",
      args: {
        workOrderId,
        workOrderLineId:
          typeof body.workOrderLineId === "string"
            ? body.workOrderLineId
            : null,
        mode,
        operationId: randomUUID(),
      },
    });

    const url = new URL(request.url);
    url.searchParams.set("sessionId", started.sessionId);
    const result = await snapshot(new NextRequest(url), started.sessionId);
    return NextResponse.json({
      session: result.envelope.session,
      context: result.context,
      workOrder: result.workOrder,
      greeting: result.greeting,
      dayAgenda: result.dayAgenda,
      conversationDigest: result.conversationDigest,
      shopId: result.access.shopId,
      capabilities: capabilities(result.access),
    });
  } catch (error) {
    if (error instanceof TechnicianCopilotAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start CoPilot session.",
      },
      { status: 500 },
    );
  }
}
