"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";

import {
  PRODUCT_PACKAGE_PRICING,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";
import styles from "./PricingSection.module.css";

export type BillingInterval = "monthly" | "yearly";

export type CheckoutPayload = {
  packageKey: ProductPackageKey;
  interval: BillingInterval;
  checkoutAttemptId: string;
};

export type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void;
  surface: "light" | "dark";
};

const plans: Array<{
  key: ProductPackageKey;
  name: string;
  price: string;
  unit: string;
  summary: string;
  boundary: string;
  features: string[];
  featured?: boolean;
}> = [
  {
    key: "shop_operations",
    name: "Shop Operations",
    price: `$${PRODUCT_PACKAGE_PRICING.shop_operations.monthlyCents / 100}`,
    unit: "/ month / location",
    summary: "The operating system for repair shops working in the bay.",
    boundary:
      "Unlimited internal users. Field Service and Fleet Maintenance are separate.",
    features: [
      "Work orders, inspections, quotes, and invoicing",
      "Parts, purchasing, inventory, and workforce",
      "Customer portal and Shop Mobile",
    ],
  },
  {
    key: "field_service",
    name: "Field Service",
    price: `$${PRODUCT_PACKAGE_PRICING.field_service.monthlyCents / 100}`,
    unit: "/ month",
    summary: "A focused service-truck operation for fleets and independents.",
    boundary: "1 active service truck included, then $49 per additional truck.",
    features: [
      "Dispatch and mobile service visits",
      "Explicit field-operator assignment",
      "Truck scheduling, inventory, and evidence",
    ],
  },
  {
    key: "fleet_maintenance",
    name: "Fleet Maintenance",
    price: `$${PRODUCT_PACKAGE_PRICING.fleet_maintenance.monthlyCents / 100}`,
    unit: "/ month",
    summary:
      "A fleet-owned workspace for maintenance, compliance, and repair history.",
    boundary:
      "10 fleet-owned assets included, then $2.50 per additional asset.",
    features: [
      "PM programs, inspections, defects, and approvals",
      "Drivers, dispatch, documents, and asset history",
      "Fleet portal identities included at no charge",
    ],
  },
  {
    key: "complete_operations",
    name: "Complete Operations",
    price: `$${PRODUCT_PACKAGE_PRICING.complete_operations.monthlyCents / 100}`,
    unit: "/ month / location",
    summary:
      "Shop, Field Service, and Fleet Maintenance with owner-controlled toggles.",
    boundary:
      "2 service trucks included. Larger participating fleets own their subscription.",
    features: [
      "Everything in Shop Operations",
      "Field Service for assigned operators",
      "Unlimited fleet relationships; linked fleets up to 10 assets included",
    ],
    featured: true,
  },
];

export default function PricingSection({
  onCheckout,
  surface,
}: PricingSectionProps) {
  const [busyKey, setBusyKey] = useState<ProductPackageKey | null>(null);
  const attemptIds = useRef<Partial<Record<ProductPackageKey, string>>>({});

  const startCheckout = async (packageKey: ProductPackageKey) => {
    if (busyKey) return;
    setBusyKey(packageKey);
    try {
      const checkoutAttemptId =
        attemptIds.current[packageKey] ??
        (attemptIds.current[packageKey] = crypto.randomUUID());
      await onCheckout({
        packageKey,
        interval: "monthly",
        checkoutAttemptId,
      });
    } catch (error) {
      console.error("[PricingSection] checkout failed", error);
      window.alert("Checkout could not be started. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section
      aria-label="Pricing plans"
      className={styles.root}
      data-surface={surface}
    >
      <div className="mx-auto grid max-w-[88rem] gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isBusy = busyKey === plan.key;
          return (
            <article
              key={plan.key}
              className={`${styles.card} ${
                plan.featured ? styles.featuredCard : ""
              } relative flex flex-col rounded-[1.5rem] border p-6 transition sm:p-7`}
            >
              {plan.featured ? (
                <div
                  className={`${styles.badge} absolute right-5 top-0 -translate-y-1/2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em]`}
                >
                  Best value
                </div>
              ) : null}

              <div className={`${styles.accentText} text-sm font-bold`}>
                {plan.name}
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-x-2 gap-y-1">
                <span
                  className={`${styles.primaryText} text-5xl font-semibold tracking-[-0.05em]`}
                >
                  {plan.price}
                </span>
                <span className={`${styles.mutedText} pb-1.5 text-xs`}>
                  {plan.unit}
                </span>
              </div>
              <p className={`${styles.mutedText} mt-5 text-sm leading-6`}>
                {plan.summary}
              </p>
              <div
                className={`${styles.boundary} mt-4 rounded-xl border px-3.5 py-3 text-xs font-semibold leading-5`}
              >
                {plan.boundary}
              </div>

              <button
                type="button"
                onClick={() => void startCheckout(plan.key)}
                disabled={Boolean(busyKey)}
                aria-busy={isBusy}
                className={`${styles.button} ${
                  plan.featured ? styles.primaryButton : styles.secondaryButton
                } mt-6 rounded-xl border px-4 py-3 text-sm font-bold transition`}
              >
                {isBusy ? "Starting…" : "Start 7-day free trial"}
              </button>

              <div className={`${styles.divider} my-6 h-px`} />
              <div
                className={`${styles.mutedText} text-[11px] font-bold uppercase tracking-[0.15em]`}
              >
                Included
              </div>
              <ul className="mt-4 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className={`${styles.primaryText} flex items-start gap-3 text-sm leading-5`}
                  >
                    <span
                      className={`${styles.featureIcon} mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full`}
                    >
                      <Check aria-hidden="true" size={12} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div
        className={`${styles.notice} mx-auto mt-6 flex max-w-[88rem] flex-col gap-2 rounded-2xl border px-5 py-4 text-xs leading-5 md:flex-row md:items-center md:justify-between`}
      >
        <span>
          No per-user charge. Customer, driver, and fleet portal identities are
          included.
        </span>
        <span>
          Shops are never billed for unlinked customer vehicles or fleets they
          only service.
        </span>
      </div>
    </section>
  );
}
