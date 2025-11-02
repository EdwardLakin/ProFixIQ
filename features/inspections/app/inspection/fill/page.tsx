// features/inspections/app/inspection/fill/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import InspectionHost from "@/features/inspections/components/inspectionHost";

type Dict = Record<string, string>;

function paramsToObject(sp: URLSearchParams): Dict {
  const out: Dict = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}

export default function InspectionFillPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [params, setParams] = useState<Dict>({});

  // Pull from URL first; if missing, use sessionStorage (set by /inspection/run)
  useEffect(() => {
    const urlTemplate = sp.get("template");
    const urlParams = paramsToObject(sp);

    let nextTemplate = urlTemplate;
    if (!nextTemplate && typeof window !== "undefined") {
      nextTemplate = sessionStorage.getItem("inspection:template");
    }

    // Keep everything else that run staged
    const stagedParams =
      typeof window !== "undefined"
        ? (JSON.parse(sessionStorage.getItem("inspection:params") || "{}") as Dict)
        : {};

    const merged: Dict = { ...stagedParams, ...urlParams };

    if (!nextTemplate) {
      // Nothing to render; bounce to a safe location
      router.replace("/inspections");
      return;
    }

    setTemplate(nextTemplate);
    setParams(merged);
    setReady(true);
  }, [sp, router]);

  if (!ready || !template) {
    return (
      <div className="p-6 text-sm text-neutral-300">
        Preparing inspection…
      </div>
    );
  }

  return (
    <div className="px-3 py-4 text-white">
      {/* InspectionHost is your runtime form renderer */}
      <InspectionHost template={template} embed params={params} />
    </div>
  );
}