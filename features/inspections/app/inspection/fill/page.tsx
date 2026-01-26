// app/inspections/fill/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

type Dict = Record<string, string>;

function paramsToObject(sp: URLSearchParams): Dict {
  const out: Dict = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export default function InspectionFillPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);

  useEffect(() => {
    const urlTemplate = sp.get("template");
    const urlParams = paramsToObject(sp);

    let nextTemplate = urlTemplate ?? null;

    if (typeof window !== "undefined") {
      const stagedParamsRaw = sessionStorage.getItem("inspection:params");
      const stagedParams: Dict = stagedParamsRaw
        ? (JSON.parse(stagedParamsRaw) as Dict)
        : {};

      /**
       * IMPORTANT:
       * - When coming from work order embed, staged params should be authoritative.
       * - URL params are allowed to add context (workOrderId, customerId, etc),
       *   but should NOT be able to force us back into "draft/builder" mode.
       *
       * So: URL first, staged second (staged wins).
       */
      const merged: Dict = { ...urlParams, ...stagedParams };

// allow URL to override for grid specifically
if (urlParams.grid) merged.grid = urlParams.grid;

      // Hard safety: if we have staged mode, keep it.
      if (stagedParams.mode) merged.mode = stagedParams.mode;

      // Same for screen template if staged already set it
      if (stagedParams.template) merged.template = stagedParams.template;

      // Also preserve template identity helpers if staged has them
      if (stagedParams.templateId) merged.templateId = stagedParams.templateId;
      if (stagedParams.template_id) merged.template_id = stagedParams.template_id;
      if (stagedParams.templateName) merged.templateName = stagedParams.templateName;
      if (stagedParams.template_name) merged.template_name = stagedParams.template_name;

      sessionStorage.setItem("inspection:params", JSON.stringify(merged));

      if (!nextTemplate) {
        const stagedTemplate = sessionStorage.getItem("inspection:template");
        if (stagedTemplate) nextTemplate = stagedTemplate;
      }
    }

    if (!nextTemplate) {
      router.replace("/inspections");
      return;
    }

    setTemplate(nextTemplate);
    setReady(true);
  }, [sp, router]);

  const cardBase =
    "mx-auto w-full max-w-6xl rounded-2xl border border-slate-700/70 " +
    "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] " +
    "shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl";
  const cardInner = "rounded-xl border border-slate-700/60 bg-slate-950/80";

  if (!ready || !template) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
        <div className={`${cardBase} px-4 py-3 text-sm text-muted-foreground`}>
          <div className={`${cardInner} px-4 py-3 text-sm`}>
            Preparing inspection…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className={cardBase}>
        <div className={`${cardInner} p-0 sm:p-0`}>
          {/* The actual screen is selected by InspectionHost via ?template=... */}
          <GenericInspectionScreen />
        </div>
      </div>
    </div>
  );
}