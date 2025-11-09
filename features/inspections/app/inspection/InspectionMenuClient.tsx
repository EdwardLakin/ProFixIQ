"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import InspectionGroupList from "@inspections/components/InspectionGroupList";
import type { InspectionCategory } from "@inspections/lib/inspection/types";
import { toInspectionCategories } from "@inspections/lib/inspection/normalize";
import { Button } from "@shared/components/ui/Button";
import PageShell from "@/features/shared/components/PageShell";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type Tile = { href: string; title: string; subtitle?: string };

function TileLink({ href, title, subtitle }: Tile) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-white/10 bg-neutral-900 p-4 transition
                 hover:-translate-y-0.5 hover:border-orange-500 hover:shadow-lg hover:shadow-orange-500/10"
      aria-label={title}
    >
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
    </Link>
  );
}

export default function InspectionMenuClient() {
  const supabase = createClientComponentClient<DB>();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [active, setActive] = useState<InspectionCategory[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("created_at", { ascending: false });
      setTemplates(data ?? []);
    })();
  }, [supabase]);

  // match the way /work-orders/page.tsx points to /work-orders/...:
  // use the actual /inspections/... routes from your TILES list
  const NAV_MAIN: Tile[] = [
    {
      href: "/inspections/custom-inspection",
      title: "Start Inspection",
      subtitle: "Begin a new custom inspection",
    },
    {
      href: "/inspections/templates",
      title: "Templates",
      subtitle: "Browse or create inspection templates",
    },
    {
      href: "/inspections/saved",
      title: "Saved Drafts",
      subtitle: "Resume in-progress inspections",
    },
    {
      href: "/inspections/summary",
      title: "Summaries",
      subtitle: "Review inspection results",
    },
  ];

  const NAV_UTIL: Tile[] = [
    {
      href: "/inspections/maintenance50",
      title: "Maintenance 50-Point",
      subtitle: "Quick multi-point preset",
    },
    {
      href: "/inspections/maintenance50-air",
      title: "Maintenance 50 – Air",
      subtitle: "CVIP-style (air brakes)",
    },
    {
      href: "/inspections/saved",
      title: "Saved Inspections",
      subtitle: "Drafts & recent",
    },
    {
      href: "/inspections/templates",
      title: "Templates",
      subtitle: "Reusable inspection sets",
    },
  ];

  return (
    <PageShell
      title="Inspections"
      description="Start a new inspection, use a template, or jump back into drafts."
    >
      <div className="space-y-8">
        {/* Navigation tiles */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Get Started</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NAV_MAIN.map((t) => (
              <TileLink key={t.href} {...t} />
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-neutral-300">More</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NAV_UTIL.map((t) => (
              <TileLink key={t.href} {...t} />
            ))}
          </div>
        </section>

        {/* Templates list + preview */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Inspection Templates</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded border border-neutral-700 p-3">
                <div className="mb-2 text-white">
                  {t.template_name ?? "Untitled"}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      setActive(toInspectionCategories(t.sections as unknown))
                    }
                  >
                    Preview
                  </Button>
                  <Link
                    href={`/inspections/templates?id=${t.id}`}
                    className="rounded border border-white/15 px-3 py-2 text-sm transition hover:border-orange-500"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-neutral-400">
                No templates yet. Create one under{" "}
                <span className="text-orange-400">Templates</span>.
              </p>
            )}
          </div>

          {active && (
            <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
              <h3 className="mb-3 text-lg font-semibold text-orange-400">Preview</h3>
              <InspectionGroupList categories={active} />
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}