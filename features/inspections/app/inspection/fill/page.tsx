"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import InspectionHost from "@/features/inspections/components/inspectionHost";
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
  const [params, setParams] = useState<Dict>({});

  // Pull from URL first; if missing, fall back to staged sessionStorage values
  useEffect(() => {
    const urlTemplate = sp.get("template");
    const urlParams = paramsToObject(sp);

    let nextTemplate = urlTemplate;
    let stagedParams: Dict = {};

    if (typeof window !== "undefined") {
      if (!nextTemplate) {
        nextTemplate = sessionStorage.getItem("inspection:template");
      }

      try {
        stagedParams = JSON.parse(
          sessionStorage.getItem("inspection:params") || "{}",
        ) as Dict;
      } catch {
        stagedParams = {};
      }
    }

    // URL params always win over staged
    const merged: Dict = { ...stagedParams, ...urlParams };

    // 🔹 If the *URL* did not specify view/embed, strip any stale values
    // left over from a previous run so desktop doesn’t accidentally
    // think it's "mobile" or "embedded".
    if (!("view" in urlParams)) {
      delete merged.view;
    }
    if (!("embed" in urlParams) && !("compact" in urlParams)) {
      delete merged.embed;
      delete merged.compact;
    }

    if (!nextTemplate) {
      router.replace("/inspections");
      return;
    }

    setTemplate(nextTemplate);
    setParams(merged);
    setReady(true);
  }, [sp, router]);

  // Shared glass card style to match work order / run loader (for non-generic templates)
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

  const templateKey = template.toLowerCase();

  // 🔹 For our new generic runtime (the one you pasted), bypass InspectionHost.
  // GenericInspectionScreen handles:
  //   – embed vs full page
  //   – mobile vs desktop
  //   – Save / Finish buttons
  //   – OpenAI voice for mobile
  if (templateKey === "generic") {
    return <GenericInspectionScreen />;
  }

  // 🔹 Any legacy / special templates still go through InspectionHost
  return (
    <div className="min-h-[80vh] bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className={cardBase}>
        <div className={`${cardInner} p-3 sm:p-4`}>
          <InspectionHost template={template} embed params={params} />
        </div>
      </div>
    </div>
  );
}