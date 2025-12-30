"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import InspectionHost from "@/features/inspections/components/inspectionHost";

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
  const [params, setParams] = useState<Dict>({});

  useEffect(() => {
    const urlTemplate = sp.get("template");
    const urlParams = paramsToObject(sp);

    let nextTemplate = urlTemplate;
    if (!nextTemplate && typeof window !== "undefined") {
      nextTemplate = sessionStorage.getItem("inspection:template");
    }

    const stagedParams =
      typeof window !== "undefined"
        ? ((JSON.parse(
            sessionStorage.getItem("inspection:params") || "{}",
          ) as Dict) || {})
        : {};

    const merged: Dict = { ...stagedParams, ...urlParams };

    if (!nextTemplate) {
      router.replace("/inspections");
      return;
    }

    setTemplate(nextTemplate);
    setParams(merged);
    setReady(true);
  }, [sp, router]);

  // ---- layout flags (driven by params / URL) --------------------------

  const rawView =
    (params.view ?? sp.get("view") ?? "").toString().toLowerCase();
  const isMobileView = rawView === "mobile";

  const rawEmbed =
    (params.embed ?? params.compact ?? sp.get("embed") ?? sp.get("compact") ?? "")
      .toString()
      .toLowerCase();
  const isEmbed =
    rawEmbed === "1" || rawEmbed === "true" || rawEmbed === "yes";

  // Shared glass card style to match work order / run loader
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

  // 🔹 MOBILE: let GenericInspectionScreen own the layout completely.
  // It will see view=mobile in the URL and show the mobile sticky bar
  // + OpenAI voice controls.
  if (isMobileView) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <InspectionHost
          template={template}
          embed={isEmbed}
          params={params}
        />
      </div>
    );
  }

  // 🔹 DESKTOP full-page (default)
  return (
    <div className="min-h-[80vh] bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className={cardBase}>
        <div className={`${cardInner} p-3 sm:p-4`}>
          {/* InspectionHost is the runtime form renderer */}
          <InspectionHost
            template={template}
            embed={isEmbed}
            params={params}
          />
        </div>
      </div>
    </div>
  );
}