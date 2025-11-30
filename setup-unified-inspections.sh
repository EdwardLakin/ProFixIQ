#!/usr/bin/env bash
set -e

echo "Creating unified inspection directories..."

# Core unified feature folders
mkdir -p features/inspections/unified/ui
mkdir -p features/inspections/unified/voice
mkdir -p features/inspections/unified/data
mkdir -p features/inspections/unified/hooks
mkdir -p features/inspections/unified/api

# App routes (note the quotes so [id] / [lineId] are literal)
mkdir -p "app/api/inspections/unified/session/[lineId]"
mkdir -p "app/api/inspections/unified/session/[lineId]/finish"
mkdir -p "app/api/inspections/unified/session/[lineId]/quote"

mkdir -p "app/work-orders/[id]/inspection/unified"
mkdir -p "app/mobile/work-orders/[id]/inspection/unified"

#######################################
# UI COMPONENTS
#######################################

cat > features/inspections/unified/ui/InspectionUnifiedScreen.tsx <<'TSX'
"use client";

import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import SectionRenderer from "./SectionRenderer";

type Props = {
  session: InspectionSession;
  onUpdateSession: (patch: Partial<InspectionSession>) => void;
};

export default function InspectionUnifiedScreen({ session, onUpdateSession }: Props) {
  // thin stub – we’ll wire real logic later
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-orange-400">
        Unified Inspection (beta)
      </h1>
      <SectionRenderer
        sections={session.sections ?? []}
        onUpdateItem={(sectionIndex, itemIndex, patch) => {
          const next = { ...(session as InspectionSession) };
          const sections = [...(next.sections ?? [])];
          if (!sections[sectionIndex]) return;
          const items = [...(sections[sectionIndex].items ?? [])];
          if (!items[itemIndex]) return;
          items[itemIndex] = { ...items[itemIndex], ...patch };
          sections[sectionIndex] = { ...sections[sectionIndex], items };
          onUpdateSession({ sections });
        }}
      />
    </div>
  );
}
TSX

cat > features/inspections/unified/ui/SectionRenderer.tsx <<'TSX'
"use client";

import React from "react";
import type {
  InspectionSection,
  InspectionItem,
} from "@inspections/lib/inspection/types";
import CornerGrid from "./CornerGrid";
import AxleGrid from "./AxleGrid";
// temporary – we’ll either reuse or replace this later
import SectionDisplay from "../_legacy/SectionDisplay";

type Props = {
  sections: InspectionSection[];
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
};

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE =
  /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

function detectLayout(items: InspectionItem[]): "air" | "hyd" | "plain" {
  let airMatches = 0;
  let hydMatches = 0;

  for (const it of items ?? []) {
    const label = it.item ?? it.name ?? "";
    if (!label) continue;
    if (AIR_RE.test(label)) airMatches += 1;
    if (HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label)) hydMatches += 1;
  }

  if (airMatches > 0) return "air";
  if (hydMatches > 0) return "hyd";
  return "plain";
}

export default function SectionRenderer({ sections, onUpdateItem }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, sectionIndex) => {
        const items = section.items ?? [];
        const layout = detectLayout(items);

        if (layout === "hyd") {
          return (
            <CornerGrid
              key={`${sectionIndex}-${section.title || "hyd"}`}
              sectionIndex={sectionIndex}
              items={items}
              onUpdateItem={onUpdateItem}
            />
          );
        }

        if (layout === "air") {
          return (
            <AxleGrid
              key={`${sectionIndex}-${section.title || "air"}`}
              sectionIndex={sectionIndex}
              items={items}
              onUpdateItem={onUpdateItem}
            />
          );
        }

        return (
          <SectionDisplay
            key={`${sectionIndex}-${section.title || "plain"}`}
            title={section.title ?? `Section ${sectionIndex + 1}`}
            section={section}
            sectionIndex={sectionIndex}
            showNotes
            showPhotos
            onUpdateStatus={(secIdx, itemIdx, status) =>
              onUpdateItem(secIdx, itemIdx, { status })
            }
            onUpdateNote={(secIdx, itemIdx, note) =>
              onUpdateItem(secIdx, itemIdx, { notes: note })
            }
            onUpload={(photoUrl, secIdx, itemIdx) => {
              const item = sections[secIdx]?.items?.[itemIdx];
              const existing = (item?.photoUrls ?? []) as string[];
              onUpdateItem(secIdx, itemIdx, {
                photoUrls: [...existing, photoUrl],
              });
            }}
          />
        );
      })}
    </div>
  );
}
TSX

cat > features/inspections/unified/ui/CornerGrid.tsx <<'TSX'
"use client";

import React from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
};

export default function CornerGrid({ sectionIndex, items }: Props) {
  // placeholder – real layout to follow
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 text-sm font-semibold text-orange-400">
        Corner Grid (LF / RF / LR / RR)
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-neutral-200">
        {items.map((it, idx) => (
          <div key={idx} className="rounded bg-black/40 p-2">
            {it.item ?? it.name}
          </div>
        ))}
      </div>
    </div>
  );
}
TSX

cat > features/inspections/unified/ui/AxleGrid.tsx <<'TSX'
"use client";

import React from "react";
import type { InspectionItem } from "@inspections/lib/inspection/types";

type Props = {
  sectionIndex: number;
  items: InspectionItem[];
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
};

export default function AxleGrid({ sectionIndex, items }: Props) {
  // placeholder – real axle layout to follow
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="mb-2 text-sm font-semibold text-orange-400">
        Axle Grid (Steer / Drive / Trailer)
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-neutral-200">
        {items.map((it, idx) => (
          <div key={idx} className="rounded bg-black/40 p-2">
            {it.item ?? it.name}
          </div>
        ))}
      </div>
    </div>
  );
}
TSX

cat > features/inspections/unified/ui/InspectionActionBar.tsx <<'TSX'
"use client";

import React from "react";

type Props = {
  onSave?: () => void;
  onFinish?: () => void;
  onStartVoice?: () => void;
  onStopVoice?: () => void;
  isListening?: boolean;
};

export default function InspectionActionBar({
  onSave,
  onFinish,
  onStartVoice,
  onStopVoice,
  isListening,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
      <div className="font-semibold text-neutral-200">Inspection actions</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onFinish}
          className="rounded bg-orange-600 px-3 py-1 text-xs text-white"
        >
          Finish
        </button>
        {isListening ? (
          <button
            type="button"
            onClick={onStopVoice}
            className="rounded bg-red-600 px-3 py-1 text-xs text-white"
          >
            Stop voice
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartVoice}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white"
          >
            Start voice
          </button>
        )}
      </div>
    </div>
  );
}
TSX

cat > features/inspections/unified/ui/InspectionHeader.tsx <<'TSX'
"use client";

import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
};

export default function InspectionHeader({ session }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">
      <div className="text-sm font-semibold text-orange-400">
        {session.templateName || "Inspection"}
      </div>
      <div>
        Vehicle:{" "}
        {session.vehicle?.year} {session.vehicle?.make}{" "}
        {session.vehicle?.model}
      </div>
      <div>Customer: {session.customer?.first_name} {session.customer?.last_name}</div>
      <div>Status: {session.status}</div>
    </div>
  );
}
TSX

cat > features/inspections/unified/ui/InspectionSummary.tsx <<'TSX'
"use client";

import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
};

export default function InspectionSummary({ session }: Props) {
  const sections = session.sections ?? [];
  const totalItems = sections.reduce(
    (sum, s) => sum + (s.items?.length ?? 0),
    0,
  );

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">
      <div className="mb-1 text-sm font-semibold text-orange-400">
        Quick summary
      </div>
      <div>Sections: {sections.length}</div>
      <div>Items: {totalItems}</div>
      <div>Status: {session.status}</div>
    </div>
  );
}
TSX

#######################################
# VOICE LAYER (under unified)
#######################################

cat > features/inspections/unified/voice/voiceTypes.ts <<'TS'
export type VoiceCommandType =
  | "update_status"
  | "measurement"
  | "add_note"
  | "recommend"
  | "complete_item";

export type VoiceCommand = {
  type: VoiceCommandType;
  raw: string;
  sectionName?: string;
  itemName?: string;
  value?: string | number;
  unit?: string;
  status?: string;
  note?: string;
};
TS

cat > features/inspections/unified/voice/interpretTranscript.ts <<'TS'
import type { VoiceCommand } from "./voiceTypes";

/**
 * Thin wrapper around your AI interpreter (to be implemented).
 * For now we just return an empty array.
 */
export async function interpretTranscript(
  transcript: string,
): Promise<VoiceCommand[]> {
  console.debug("interpretTranscript (stub)", transcript);
  return [];
}
TS

cat > features/inspections/unified/voice/commandMapper.ts <<'TS'
import type { VoiceCommand } from "./voiceTypes";
import type {
  InspectionSession,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

type UpdateSessionFn = (patch: Partial<InspectionSession>) => void;

export function applyVoiceCommands(
  commands: VoiceCommand[],
  session: InspectionSession,
  updateSession: UpdateSessionFn,
) {
  // stub that does nothing yet – safe placeholder
  console.debug("applyVoiceCommands (stub)", commands.length);
}
TS

cat > features/inspections/unified/voice/VoiceInspectionController.tsx <<'TSX'
"use client";

import React, { useState } from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { interpretTranscript } from "./interpretTranscript";
import { applyVoiceCommands } from "./commandMapper";

type Props = {
  session: InspectionSession;
  onUpdateSession: (patch: Partial<InspectionSession>) => void;
};

export default function VoiceInspectionController({ session, onUpdateSession }: Props) {
  const [isListening, setIsListening] = useState(false);

  // We'll wire browser SpeechRecognition here later
  const handleFakeTranscript = async () => {
    const transcript = "dummy transcript";
    const cmds = await interpretTranscript(transcript);
    applyVoiceCommands(cmds, session, onUpdateSession);
  };

  return (
    <div className="mt-2 text-xs text-neutral-300">
      <button
        type="button"
        onClick={handleFakeTranscript}
        className="rounded bg-neutral-800 px-3 py-1 text-xs text-white"
      >
        Test voice (stub)
      </button>
    </div>
  );
}
TSX

#######################################
# DATA & SERVER-ADJACENT LOGIC
#######################################

cat > features/inspections/unified/data/sessionStore.ts <<'TS'
import type { InspectionSession } from "@inspections/lib/inspection/types";

let inMemoryStore: Record<string, InspectionSession> = {};

export function getSessionFromStore(id: string): InspectionSession | null {
  return inMemoryStore[id] ?? null;
}

export function saveSessionToStore(id: string, session: InspectionSession) {
  inMemoryStore[id] = session;
}
TS

cat > features/inspections/unified/data/loadSession.ts <<'TS'
import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function loadInspectionSession(
  lineId: string,
): Promise<InspectionSession | null> {
  console.debug("loadInspectionSession (stub)", lineId);
  return null;
}
TS

cat > features/inspections/unified/data/saveSession.ts <<'TS'
import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function saveInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  console.debug("saveInspectionSessionUnified (stub)", session.id);
}
TS

cat > features/inspections/unified/data/finishSession.ts <<'TS'
import type { InspectionSession } from "@inspections/lib/inspection/types";

export async function finishInspectionSessionUnified(
  session: InspectionSession,
): Promise<void> {
  console.debug("finishInspectionSessionUnified (stub)", session.id);
}
TS

cat > features/inspections/unified/data/templateLoader.ts <<'TS'
import type {
  InspectionTemplate,
  InspectionSection,
} from "@inspections/lib/inspection/types";

export async function loadInspectionTemplateUnified(
  templateId: string,
): Promise<InspectionTemplate | null> {
  console.debug("loadInspectionTemplateUnified (stub)", templateId);
  return null;
}

export function templateToSectionsUnified(
  template: InspectionTemplate,
): InspectionSection[] {
  return (template.sections as InspectionSection[]) ?? [];
}
TS

cat > features/inspections/unified/data/toQuoteLines.ts <<'TS'
import type {
  InspectionSession,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

export function inspectionToQuoteLinesUnified(
  session: InspectionSession,
): QuoteLineItem[] {
  console.debug("inspectionToQuoteLinesUnified (stub)", session.id);
  return [];
}
TS

#######################################
# HOOKS
#######################################

cat > features/inspections/unified/hooks/useUnifiedInspection.ts <<'TS'
"use client";

import { useState } from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";

export default function useUnifiedInspection(initial: InspectionSession) {
  const [session, setSession] = useState<InspectionSession>(initial);

  const updateSession = (patch: Partial<InspectionSession>) =>
    setSession((prev) => ({ ...prev, ...patch }));

  return {
    session,
    updateSession,
  };
}
TS

cat > features/inspections/unified/hooks/useInspectionTemplate.ts <<'TS'
"use client";

import { useEffect, useState } from "react";
import type {
  InspectionTemplate,
} from "@inspections/lib/inspection/types";
import { loadInspectionTemplateUnified } from "../data/templateLoader";

export function useInspectionTemplate(templateId: string | null) {
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);

  useEffect(() => {
    if (!templateId) return;
    loadInspectionTemplateUnified(templateId).then(setTemplate);
  }, [templateId]);

  return { template };
}
TS

#######################################
# API ROUTES (unified namespace)
#######################################

cat > app/api/inspections/unified/session/[lineId]/route.ts <<'TS'
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { lineId: string } },
) {
  // TODO: load from Supabase (inspection_sessions + templates)
  return NextResponse.json({ ok: true, lineId: params.lineId });
}

export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const body = await req.json().catch(() => null);
  // TODO: persist unified session state
  return NextResponse.json({ ok: true, lineId: params.lineId, body });
}
TS

cat > app/api/inspections/unified/session/[lineId]/finish/route.ts <<'TS'
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const body = await req.json().catch(() => null);
  // TODO: mark inspection finished, write inspection_results + quote lines
  return NextResponse.json({ ok: true, lineId: params.lineId, body });
}
TS

cat > app/api/inspections/unified/session/[lineId]/quote/route.ts <<'TS'
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { lineId: string } },
) {
  const body = await req.json().catch(() => null);
  // TODO: send to parts / work_order_quote_lines / parts_quote_requests
  return NextResponse.json({ ok: true, lineId: params.lineId, body });
}
TS

#######################################
# DESKTOP & MOBILE PAGES
#######################################

cat > "app/work-orders/[id]/inspection/unified/page.tsx" <<'TSX'
import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import InspectionUnifiedScreen from "@/features/inspections/unified/ui/InspectionUnifiedScreen";

export default function UnifiedInspectionPage() {
  // TODO: load real session via server actions or fetch
  const fakeSession: InspectionSession = {
    id: "",
    vehicleId: "",
    customerId: "",
    workOrderId: "",
    templateId: "",
    templateName: "",
    location: "",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    transcript: "",
    status: "not_started",
    started: false,
    completed: false,
    isListening: false,
    isPaused: false,
    quote: [],
    lastUpdated: new Date().toISOString(),
    customer: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      province: "",
      postal_code: "",
    },
    vehicle: {
      year: "",
      make: "",
      model: "",
      vin: "",
      license_plate: "",
      mileage: "",
      color: "",
    },
    sections: [],
  };

  return (
    <div className="p-4">
      <InspectionUnifiedScreen
        session={fakeSession}
        onUpdateSession={(patch) => {
          console.log("update session (stub)", patch);
        }}
      />
    </div>
  );
}
TSX

cat > "app/mobile/work-orders/[id]/inspection/unified/page.tsx" <<'TSX'
import React from "react";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import InspectionUnifiedScreen from "@/features/inspections/unified/ui/InspectionUnifiedScreen";

export default function UnifiedInspectionMobilePage() {
  const fakeSession: InspectionSession = {
    id: "",
    vehicleId: "",
    customerId: "",
    workOrderId: "",
    templateId: "",
    templateName: "",
    location: "",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    transcript: "",
    status: "not_started",
    started: false,
    completed: false,
    isListening: false,
    isPaused: false,
    quote: [],
    lastUpdated: new Date().toISOString(),
    customer: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      province: "",
      postal_code: "",
    },
    vehicle: {
      year: "",
      make: "",
      model: "",
      vin: "",
      license_plate: "",
      mileage: "",
      color: "",
    },
    sections: [],
  };

  return (
    <div className="p-3">
      <InspectionUnifiedScreen
        session={fakeSession}
        onUpdateSession={(patch) => {
          console.log("update session mobile (stub)", patch);
        }}
      />
    </div>
  );
}
TSX

echo "Done. Unified inspection skeleton created."
