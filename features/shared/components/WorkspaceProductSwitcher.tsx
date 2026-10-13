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
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { cn } from "@/features/shared/utils/cn";

let entitlementIdentity: string | null = null;
let entitlementRequest: Promise<WorkspaceEntitlementsPayload | null> | null = null;

function isWorkspaceEntitlementsPayload(
  value: unknown,
): value is WorkspaceEntitlementsPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<WorkspaceEntitlementsPayload>;
  if (!payload.workspaces || typeof payload.workspaces !== "object") return false;

  return WORKSPACE_PRODUCTS.every((product) => {
    const workspace = payload.workspaces?.[product.surface];
    return (
      !!workspace &&
      typeof workspace.entitled === "boolean" &&
      typeof workspace.accessible === "boolean"
    );
  });
}

function loadWorkspaceEntitlements(
  identity: string,
): Promise<WorkspaceEntitlementsPayload | null> {
  if (entitlementIdentity !== identity) {
    entitlementIdentity = identity;
    entitlementRequest = null;
  }

  if (!entitlementRequest) {
    const request = fetch("/api/workspaces/entitlements", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload: unknown = await response.json();
        return isWorkspaceEntitlementsPayload(payload) ? payload : null;
      })
      .catch(() => null)
      .finally(() => {
        if (entitlementRequest === request) entitlementRequest = null;
      });
    entitlementRequest = request;
  }

  return entitlementRequest;
}

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
    const supabase = createBrowserSupabase();
    let active = true;

    const refreshForIdentity = (identity: string) => {
      setEntitlements(null);
      void loadWorkspaceEntitlements(identity).then((payload) => {
        if (active && entitlementIdentity === identity && payload) {
          setEntitlements(payload);
        }
      });
    };

    const getSession = supabase.auth?.getSession;
    if (typeof getSession === "function") {
      void getSession.call(supabase.auth).then(({ data }) => {
        if (!active) return;
        refreshForIdentity(data.session?.user.id ?? "signed-out");
      });
    } else {
      // Some shell tests intentionally provide a minimal auth client. The
      // switcher is supplemental navigation, so fall back to one shared
      // request instead of making those shells depend on auth-client details.
      refreshForIdentity("current-session");
    }

    const onAuthStateChange = supabase.auth?.onAuthStateChange;
    const authListener =
      typeof onAuthStateChange === "function"
        ? onAuthStateChange.call(supabase.auth, (event, session) => {
            if (!active || event === "TOKEN_REFRESHED") return;
            refreshForIdentity(session?.user.id ?? "signed-out");
          }).data
        : null;

    return () => {
      active = false;
      authListener?.subscription.unsubscribe();
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
        const workspace = entitlements?.workspaces?.[product.surface];
        const entitled = active || workspace?.entitled === true;
        const accessible = active || workspace?.accessible === true;
        const href = active
          ? workspaceProductHref(product, true, surface)
          : workspaceProductHref(product, verified ? accessible : false, surface);
        const title = active
          ? `${product.label} workspace`
          : !verified
            ? `Check ${product.label} access`
            : accessible
              ? `Open ${product.label}`
              : entitled
                ? `${product.label} access is not enabled for this account`
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
            {verified && !accessible ? (
              <LockKeyhole
                aria-label={
                  entitled
                    ? `${product.label} access is not enabled for this account`
                    : `${product.label} not included in current subscription`
                }
                className="h-3 w-3 opacity-65"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
