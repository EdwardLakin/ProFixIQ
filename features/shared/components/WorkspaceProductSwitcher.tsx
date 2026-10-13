"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  WORKSPACE_PRODUCTS,
  workspaceProductHref,
  type WorkspaceEntitlementsPayload,
  type WorkspaceSurface,
} from "@/features/shared/lib/workspaceProducts";
import { cn } from "@/features/shared/utils/cn";

export default function WorkspaceProductSwitcher({
  surface,
  className,
}: {
  surface: WorkspaceSurface;
  className?: string;
}) {
  const [entitlements, setEntitlements] =
    useState<WorkspaceEntitlementsPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetch("/api/workspaces/entitlements", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as WorkspaceEntitlementsPayload;
      })
      .then((payload) => {
        if (active && payload) setEntitlements(payload);
      })
      .catch(() => {
        // Navigation remains visible; unavailable products fail closed to their
        // acquisition pages until entitlement verification succeeds.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <nav
      aria-label="ProFixIQ products"
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap",
        className,
      )}
    >
      {WORKSPACE_PRODUCTS.map((product) => {
        const active = product.surface === surface;
        const verified = entitlements !== null;
        const entitled =
          active || entitlements?.workspaces[product.surface]?.entitled === true;
        const href = active
          ? product.workspaceHref
          : verified
            ? workspaceProductHref(product, entitled)
            : product.marketingHref;
        const title = active
          ? `${product.label} workspace`
          : !verified
            ? `Check ${product.label} access`
            : entitled
              ? `Open ${product.label}`
              : product.upgradeLabel;

        return (
          <Link
            key={product.surface}
            href={href}
            aria-current={active ? "page" : undefined}
            title={title}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition",
              active
                ? "border-[color:var(--brand-primary,#C1663B)] bg-[color:color-mix(in_srgb,var(--brand-primary,#C1663B)_12%,transparent)] text-[color:var(--theme-text-primary)]"
                : "border-transparent text-[color:var(--theme-text-secondary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-inset)] hover:text-[color:var(--theme-text-primary)]",
            )}
          >
            <span>{product.label}</span>
            {verified && !entitled ? (
              <LockKeyhole
                aria-label={`${product.label} not included in current subscription`}
                className="h-3 w-3 opacity-65"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
