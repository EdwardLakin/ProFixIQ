import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  requireTechnicianCopilotAccess,
  TechnicianCopilotAccessError,
} from "@/features/copilot/technician/server/auth";
import { runTechnicianCopilotTurn } from "@/features/copilot/technician/server/chat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const access = await requireTechnicianCopilotAccess();
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) {
      return NextResponse.json(
        { error: "Message is required and must be 4000 characters or less." },
        { status: 400 },
      );
    }

    const inputSource = body.inputMode === "voice" ? "voice" : "ui";
    if (inputSource === "voice" && !access.capabilities.voice) {
      return NextResponse.json(
        {
          error: "Technician CoPilot voice is not enabled.",
          code: "technician_copilot_voice_disabled",
        },
        { status: 404 },
      );
    }

    const turnId =
      typeof body.turnId === "string" && body.turnId.trim()
        ? body.turnId.trim().slice(0, 128)
        : randomUUID();
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId : null;

    const result = await runTechnicianCopilotTurn({
      identity: {
        authUserId: access.authUserId,
        profileId: access.profileId,
        shopId: access.shopId,
        documentationEnabled: access.capabilities.documentation,
        voiceEnabled: access.capabilities.voice,
        supabase: access.supabase,
      },
      message,
      turnId,
      sessionId,
      inputSource,
    });

    return NextResponse.json({ ...result, turnId });
  } catch (error) {
    if (error instanceof TechnicianCopilotAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("[technician-copilot] chat failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Technician CoPilot failed.",
      },
      { status: 500 },
    );
  }
}
