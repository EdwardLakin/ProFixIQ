import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import type {
  RepairSessionEvent,
  RepairSessionMode,
  RepairSessionStatus,
} from "@/features/copilot/technician/session/types";
import { projectTechnicianContext } from "@/features/copilot/technician/session/projectTechnicianContext";
import { listTechnicianWorkCandidates } from "@/features/copilot/technician/server/assignedWork";
import {
  requireTechnicianCopilotAccess,
  TechnicianCopilotAccessError,
} from "@/features/copilot/technician/server/auth";
import { sendCopilotServerCommand } from "@/features/copilot/technician/server/transport";

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
  const candidates = await listTechnicianWorkCandidates({
    supabase: access.supabase,
    shopId: access.shopId,
    technicianIds: [access.authUserId, access.profileId],
  });
  const workOrder = envelope.session
    ? candidates.find(
        (candidate) => candidate.id === envelope.session?.workOrderId,
      ) ?? null
    : null;
  const context = envelope.session
    ? projectTechnicianContext({
        repairSessionId: envelope.session.id,
        mode: envelope.session.mode,
        status: envelope.session.status,
        events: envelope.events,
      })
    : null;
  return { envelope, context, workOrder, access };
}

function capabilities(
  access: Awaited<ReturnType<typeof requireTechnicianCopilotAccess>>,
) {
  return { documentation: access.capabilities.documentation };
}

export async function GET(request: NextRequest) {
  try {
    const result = await snapshot(request);
    return NextResponse.json({
      session: result.envelope.session,
      context: result.context,
      workOrder: result.workOrder,
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
