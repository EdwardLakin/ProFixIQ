"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  canRoleUseGuidedOnboardingStep,
  getGuidedOnboardingStep,
  getGuidedOnboardingStepStatus,
  type GuidedOnboardingStepKey,
  type GuidedOnboardingStepStatus,
} from "@/features/onboarding-v2/guided/steps";
import { useUser } from "@/features/auth/hooks/useUser";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type GuidedOnboardingStepCardProps = {
  stepKey: GuidedOnboardingStepKey;
  surface: "customers" | "vehicles" | "staff" | "settings" | "inspection_templates" | "service_menu" | "parts_inventory" | "billing";
  className?: string;
};

type StatusState = {
  status: GuidedOnboardingStepStatus;
  detail: string;
};

const STATUS_COPY: Record<GuidedOnboardingStepStatus, { label: string; className: string }> = {
  complete: { label: "Looks ready", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" },
  in_progress: { label: "Started", className: "border-sky-400/30 bg-sky-500/10 text-sky-100" },
  not_started: { label: "Optional", className: "border-orange-300/30 bg-orange-400/10 text-orange-100" },
  unknown: { label: "Optional", className: "border-slate-400/25 bg-white/5 text-slate-200" },
};

function dismissalKey(stepKey: GuidedOnboardingStepKey, shopId: string | null | undefined): string {
  return `profixiq:onboarding-card:${shopId ?? "no-shop"}:${stepKey}`;
}

async function countRowsForStep(
  supabase: ReturnType<typeof createBrowserSupabase>,
  stepKey: GuidedOnboardingStepKey,
  shopId: string | null,
): Promise<number | null> {
  const filterShop = <T extends { eq: (column: string, value: string) => T }>(query: T): T =>
    shopId ? query.eq("shop_id", shopId) : query;

  switch (stepKey) {
    case "customers": {
      const { count, error } = await filterShop(supabase.from("customers").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "vehicles": {
      const { count, error } = await filterShop(supabase.from("vehicles").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "staff": {
      const { count, error } = await filterShop(supabase.from("profiles").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "inspection_templates": {
      const { count, error } = await filterShop(supabase.from("inspection_templates").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "service_menu": {
      const { count, error } = await filterShop(supabase.from("menu_items").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "parts_inventory": {
      const { count, error } = await filterShop(supabase.from("parts").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "invoices_history": {
      const base = supabase.from("work_orders").select("id", { count: "exact", head: true }).in("status", ["completed", "ready_to_invoice", "invoiced"]);
      const { count, error } = await filterShop(base);
      return error ? null : count ?? 0;
    }
    case "fleet_history_import": {
      const { count, error } = await filterShop(supabase.from("history").select("id", { count: "exact", head: true }));
      return error ? null : count ?? 0;
    }
    case "settings":
      return null;
    default:
      return null;
  }
}

export function GuidedOnboardingStepCard({ stepKey, surface, className = "" }: GuidedOnboardingStepCardProps) {
  const step = getGuidedOnboardingStep(stepKey);
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const { user, isLoading } = useUser();
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<StatusState>({ status: "unknown", detail: "Checking setup state…" });

  const key = useMemo(() => dismissalKey(stepKey, user?.shop_id), [stepKey, user?.shop_id]);
  const canSee = canRoleUseGuidedOnboardingStep(user?.role, step);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(key) === "dismissed");
  }, [key]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      if (!user?.shop_id || !canSee) return;

      if (step.dataSource.kind === "shop_settings") {
        const readyCount = step.dataSource.fields.filter((field) => {
          const value = user.shops?.[field];
          return typeof value === "number" && Number.isFinite(value) && value > 0;
        }).length;
        const nextStatus = readyCount === step.dataSource.fields.length ? "complete" : readyCount > 0 ? "in_progress" : "not_started";
        if (!cancelled) {
          setState({ status: nextStatus, detail: `${readyCount}/${step.dataSource.fields.length} defaults set` });
        }
        return;
      }

      if (step.dataSource.kind === "import_flow") {
        if (!cancelled) {
          setState({ status: step.dataSource.supported ? "in_progress" : "unknown", detail: step.dataSource.label });
        }
        return;
      }

      const count = await countRowsForStep(supabase, stepKey, user.shop_id);
      if (!cancelled) {
        setState({
          status: getGuidedOnboardingStepStatus(count, step.dataSource.completeAt),
          detail: count == null ? `Could not verify ${step.dataSource.label}` : `${count.toLocaleString()} ${step.dataSource.label}`,
        });
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [canSee, step, stepKey, supabase, user]);

  if (isLoading || !canSee || dismissed) return null;

  const badge = STATUS_COPY[state.status];

  return (
    <section
      data-testid={`guided-onboarding-step-card-${stepKey}`}
      data-onboarding-optional="true"
      data-onboarding-surface={surface}
      className={`rounded-2xl border border-[var(--brand-accent,#E39A6E)]/25 bg-[radial-gradient(circle_at_top_left,rgba(227,154,110,0.14),rgba(15,23,42,0.72)_48%,rgba(2,6,23,0.88))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)] ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent,#E39A6E)]/85">
            Optional guided onboarding
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">{step.title}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">{step.description}</p>
          <div className="mt-2 text-xs text-slate-400">{state.detail}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {step.importLaunch?.stable ? (
            <Link
              href={step.importLaunch.href}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-[var(--brand-accent,#E39A6E)]/45 hover:bg-[var(--brand-accent,#E39A6E)]/12"
            >
              {step.importLaunch.label}
            </Link>
          ) : null}
          <Link
            href={`/dashboard/onboarding-v2?mode=guided&step=${encodeURIComponent(step.stepKey)}`}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--brand-accent,#E39A6E)]/45 bg-[var(--brand-accent,#E39A6E)]/18 px-3 py-2 text-xs font-semibold text-orange-50 transition hover:border-[var(--brand-accent,#E39A6E)] hover:bg-[var(--brand-accent,#E39A6E)]/28"
          >
            Open guide
          </Link>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(key, "dismissed");
              setDismissed(true);
            }}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
