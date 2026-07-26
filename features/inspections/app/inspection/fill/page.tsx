// app/inspections/fill/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";
import { mergeInspectionRuntimeParams } from "@inspections/lib/inspection/runtimeParams";

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

      // Staged data carries the prepared template, while the current URL owns
      // the work-order/line identity. This prevents a prior tab's staged params
      // from reopening or saving a different inspection line.
      const merged = mergeInspectionRuntimeParams({
        staged: stagedParams,
        route: urlParams,
      });

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
    "mx-auto w-full max-w-6xl rounded-2xl border border-[color:var(--theme-border-soft)] " +
    "bg-[var(--theme-gradient-panel)] " +
    "shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
  const cardInner = "rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]";

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
