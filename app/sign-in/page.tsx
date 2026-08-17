import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Smartphone,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";

import AuthShell from "@/features/auth/components/AuthShell";
import {
  PRODUCT_SIGN_IN,
  resolveLegacySignInHref,
  type ProductAccessSurface,
} from "@/features/auth/lib/accessSurfaceRouting";

export const metadata: Metadata = {
  title: "Choose your ProFixIQ app",
  description: "Sign in to ProFixIQ Shop, Shop Mobile, Field, Fleet, or Customer Portal.",
};

type SignInChooserProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const accessCards: Array<{
  surface: ProductAccessSurface | "mobile";
  href: string;
  title: string;
  description: string;
  icon: typeof Wrench;
}> = [
  {
    surface: "shop",
    href: PRODUCT_SIGN_IN.shop,
    title: "ProFixIQ Shop",
    description: "Run a repair shop from intake and approvals through parts, labor, and invoicing.",
    icon: Wrench,
  },
  {
    surface: "mobile",
    href: "/mobile/sign-in",
    title: "Shop Mobile",
    description: "Use the role-specific shop workspace from a phone or tablet for jobs, inspections, shifts, evidence, and team communication.",
    icon: Smartphone,
  },
  {
    surface: "field",
    href: PRODUCT_SIGN_IN.field,
    title: "ProFixIQ Field",
    description: "Operate a mobile service business from the truck, tablet, phone, or laptop.",
    icon: Truck,
  },
  {
    surface: "fleet",
    href: PRODUCT_SIGN_IN.fleet,
    title: "ProFixIQ Fleet",
    description: "Manage assets, maintenance programs, defects, approvals, and service history.",
    icon: Building2,
  },
  {
    surface: "customer",
    href: PRODUCT_SIGN_IN.customer,
    title: "Customer Portal",
    description: "Request service, approve work, follow progress, pay invoices, and view records.",
    icon: UserRound,
  },
];

function toUrlSearchParams(
  values: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
}

export default async function SignInChooser({ searchParams }: SignInChooserProps) {
  const params = toUrlSearchParams((await searchParams) ?? {});
  const legacyDestination = resolveLegacySignInHref(params);
  if (legacyDestination) redirect(legacyDestination);

  return (
    <AuthShell
      productLabel="Product access"
      heroTitle="Five clear doors into one connected platform."
      heroDescription="Choose the workspace that matches the work you are here to do. Your account stays secure and shared while each product keeps its own operating boundary."
      highlights={["Dedicated sign-in", "Shared identity", "Product-scoped access"]}
      cardClassName="sm:p-7"
    >
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          ProFixIQ access
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)] sm:text-4xl">
          Where do you work?
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          Select your application to continue to its dedicated sign-in page.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {accessCards.map(({ surface, href, title, description, icon: Icon }) => (
          <Link
            key={surface}
            href={href}
            className="group flex min-h-40 flex-col rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent-copper)] hover:bg-[color:var(--theme-surface-overlay)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:color-mix(in_srgb,var(--accent-copper)_20%,transparent)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color:color-mix(in_srgb,var(--accent-copper)_14%,transparent)] text-[var(--accent-copper)]">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-copper)]" aria-hidden />
            </div>
            <h2 className="mt-4 text-sm font-bold text-[color:var(--theme-text-primary)]">
              {title}
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              {description}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-5 text-center text-xs leading-5 text-[color:var(--theme-text-muted)]">
        Not sure? Your invitation or subscription email names the workspace you should use.
      </p>
    </AuthShell>
  );
}
