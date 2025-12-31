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
    let merged: Dict = { ...urlParams };

    if (typeof window !== "undefined") {
      const stagedParamsRaw = sessionStorage.getItem("inspection:params");
      const stagedParams: Dict = stagedParamsRaw
        ? (JSON.parse(stagedParamsRaw) as Dict)
        : {};

      // staged values (from /inspections/run or WO modal) win, but URL can override
      merged = { ...stagedParams, ...urlParams };
      sessionStorage.setItem("inspection:params", JSON.stringify(merged));

      if (!nextTemplate) {
        const stagedTemplate = sessionStorage.getItem("inspection:template");
        if (stagedTemplate) {
          nextTemplate = stagedTemplate;
        }
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
  const cardInner =
    "rounded-xl border border-slate-700/60 bg-slate-950/80";

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

  // From this point on we always use the generic runtime.
  // GenericInspectionScreen reads search params + sessionStorage internally.
  return (
    <div className="min-h-[80vh] bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className={cardBase}>
        <div className={`${cardInner} p-0 sm:p-0`}>
          <GenericInspectionScreen />
        </div>
      </div>
    </div>
  );
}