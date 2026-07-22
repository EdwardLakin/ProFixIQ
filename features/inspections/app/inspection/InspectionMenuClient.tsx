

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import InspectionGroupList from "@inspections/components/InspectionGroupList";
import type { InspectionCategory } from "@inspections/lib/inspection/types";
import { toInspectionCategories } from "@inspections/lib/inspection/normalize";
import { Button } from "@shared/components/ui/Button";
import PageShell from "@/features/shared/components/PageShell";
import Card from "@/features/shared/components/ui/Card";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type Tile = { href: string; title: string; subtitle?: string };

function TileLink({ href, title, subtitle }: Tile) {
  return (
    <Link
      href={href}
      className="block"
      aria-label={title}
    >
      <Card className="h-full px-5 py-5 transition hover:border-[color:var(--brand-accent,#E39A6E)]/60">
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">{subtitle}</p>
        ) : null}
      </Card>
    </Link>
  );
}

export default function InspectionMenuClient() {
  const supabase = createBrowserSupabase();
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
      eyebrow="Execution"
      title="Inspections"
      description="Launch, resume, and review inspections with a consistent command-grade workflow shell."
    >
      <div className="space-y-8">
        {/* Navigation tiles */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Get Started</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NAV_MAIN.map((t) => (
              <TileLink key={t.href} {...t} />
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold text-[var(--theme-text-secondary,var(--theme-text-muted))]">More</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NAV_UTIL.map((t) => (
              <TileLink key={t.href} {...t} />
            ))}
          </div>
        </section>

        {/* Templates list + preview */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Inspection Templates</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id} className="space-y-3 px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  {t.template_name ?? "Untitled"}
                  <StatusBadge variant="info">Template</StatusBadge>
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
                    className="rounded border px-3 py-2 text-sm transition"
                    style={{ borderColor: "var(--theme-card-border,var(--theme-border-soft))" }}
                  >
                    Open
                  </Link>
                </div>
              </Card>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-[var(--theme-text-secondary,var(--theme-text-muted))]">
                No templates yet. Create one under{" "}
                <span style={{ color: "var(--brand-accent,#E39A6E)" }}>Templates</span>.
              </p>
            )}
          </div>

          {active && (
            <Card className="p-4">
              <h3
                className="mb-3 text-base font-semibold"
                style={{ color: "var(--theme-text-primary,var(--theme-text-primary))" }}
              >
                Preview
              </h3>
              <InspectionGroupList categories={active} />
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
