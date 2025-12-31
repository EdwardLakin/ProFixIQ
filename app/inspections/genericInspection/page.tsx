"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

type Dict = Record<string, string>;

function paramsToObject(sp: URLSearchParams): Dict {
  const out: Dict = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function GenericInspectionPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const [params, setParams] = useState<Dict>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const merged = paramsToObject(sp);
    setParams(merged);

    if (!merged.template) {
      router.replace("/inspections/templates");
      return;
    }

    setReady(true);
  }, [sp, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-neutral-400">
        Loading…
      </div>
    );
  }

  return <GenericInspectionScreen template={params.template} params={params} />;
}