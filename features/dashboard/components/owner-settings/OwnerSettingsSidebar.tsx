"use client";

import Image from "next/image";
import { Button } from "@shared/components/ui/Button";
import ShopPublicProfileSection from "@/features/shops/components/ShopPublicProfileSection";
import { OwnerSettingsPanel, OwnerSettingsStat } from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";

type StripeSubStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | "unknown";

type BillingDisplayStatus =
  | StripeSubStatus
  | "linkage_needed"
  | "subscription_found_not_linked"
  | "ambiguous_customer_subscriptions"
  | "no_subscription_found"
  | "metadata_mismatch"
  | "sync_needed";

type ShopLocationRow = {
  id: string;
  shop_name?: string | null;
  name?: string | null;
  city?: string | null;
  province?: string | null;
  stripe_subscription_status?: string | null;
  organization_id?: string | null;
};

type EmailLogRow = {
  id: string;
  to_email: string;
  subject: string | null;
  template_key: string;
  status: string;
  provider: string;
  provider_message_id: string | null;
  error_text: string | null;
  created_at: string;
  sent_at: string | null;
  metadata?: Record<string, unknown> | null;
};

type Props = {
  shopId: string | null;
  isUnlocked: boolean;
  canManageBilling: boolean;
  billingPill: React.ReactNode;
  subStatus: StripeSubStatus;
  billingDisplayStatus: BillingDisplayStatus;
  stripeAccountId: string | null;
  trialEndIso: string | null;
  periodEndIso: string | null;
  cancelAtPeriodEnd: boolean;
  connectLoading: boolean;
  checkoutLoading: boolean;
  portalLoading: boolean;
  cancelLoading: boolean;
  plan: "starter" | "pro" | "unlimited" | "unknown";
  seatsUsed: number;
  seatsLimit: number | null;
  orgId: string | null;
  orgName: string;
  locations: ShopLocationRow[];
  shopName: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  logoUrl: string;
  invoiceTerms: string;
  invoiceFooter: string;
  emailLogs: EmailLogRow[];
  emailLogsLoading: boolean;
  onOpenStripeConnect: () => void;
  onStartSubscriptionCheckout: () => void;
  onOpenStripePortal: () => void;
  onRequestCancelSubscription: () => void;
  onCreateOrganization: () => void;
  onSwitchLocation: (id: string) => void;
  onRefreshEmailLogs: () => void;
  planLabel: (p: "starter" | "pro" | "unlimited" | "unknown") => string;
  parseStripeStatus: (v: unknown) => StripeSubStatus;
  formatDate: (iso: string | null | undefined) => string;
  formatLocationLine: (s: { city: string | null; province: string | null }) => string;
  locationName: (s: { shop_name?: string | null; name?: string | null }) => string;
};

export default function OwnerSettingsSidebar({
  shopId,
  isUnlocked,
  canManageBilling,
  billingPill,
  subStatus,
  billingDisplayStatus,
  stripeAccountId,
  trialEndIso,
  periodEndIso,
  cancelAtPeriodEnd,
  connectLoading,
  checkoutLoading,
  portalLoading,
  cancelLoading,
  plan,
  seatsUsed,
  seatsLimit,
  orgId,
  orgName,
  locations,
  shopName,
  address,
  city,
  province,
  postalCode,
  phone,
  email,
  logoUrl,
  invoiceTerms,
  invoiceFooter,
  emailLogs,
  emailLogsLoading,
  onOpenStripeConnect,
  onStartSubscriptionCheckout,
  onOpenStripePortal,
  onRequestCancelSubscription,
  onCreateOrganization,
  onSwitchLocation,
  onRefreshEmailLogs,
  planLabel,
  parseStripeStatus,
  formatDate,
  formatLocationLine,
  locationName,
}: Props) {
  const isCancelableStatus = subStatus === "active" || subStatus === "trialing";
  const hasManagedSubscription =
    subStatus === "active" ||
    subStatus === "trialing" ||
    subStatus === "past_due" ||
    subStatus === "unpaid" ||
    subStatus === "incomplete" ||
    subStatus === "paused" ||
    subStatus === "canceled";
  const isLinkageState =
    billingDisplayStatus === "linkage_needed" ||
    billingDisplayStatus === "subscription_found_not_linked" ||
    billingDisplayStatus === "ambiguous_customer_subscriptions" ||
    billingDisplayStatus === "no_subscription_found" ||
    billingDisplayStatus === "sync_needed";
  const manageSubscriptionLoading = hasManagedSubscription ? portalLoading : checkoutLoading;

  return (
    <div className="space-y-5 lg:sticky lg:top-20">
      <OwnerSettingsPanel
        id="billing-stripe"
        tone="secondary"
        title="Billing & Stripe"
        description="Subscription and payment setup for this location."
        action={<div className="flex items-center gap-2">{billingPill}</div>}
      >
        <div className="grid gap-2">
          <OwnerSettingsStat
            label="Status"
            value={String(billingDisplayStatus).replaceAll("_", " ").toUpperCase()}
          />
          <OwnerSettingsStat
            label="Stripe Connect"
            value={stripeAccountId ? "Connected" : "Not connected"}
          />
          <OwnerSettingsStat label="Trial ends" value={formatDate(trialEndIso)} />
          <OwnerSettingsStat
            label="Current period ends"
            value={formatDate(periodEndIso)}
          />
          <OwnerSettingsStat
            label="Connected payout account"
            value={stripeAccountId || "No Stripe Connect account linked yet"}
          />

          <div className="flex flex-col gap-2">
            <Button onClick={onOpenStripeConnect} disabled={!isUnlocked || connectLoading}>
              {connectLoading
                ? "Opening Stripe..."
                : stripeAccountId
                ? "Manage payout setup"
                : "Connect payouts"}
            </Button>
            <p className="text-[11px] text-neutral-500">
              Set up or resume Stripe Connect for shop payouts.
            </p>

            <Button
              variant="secondary"
              onClick={onStartSubscriptionCheckout}
              disabled={!isUnlocked || manageSubscriptionLoading || isLinkageState}
            >
              {manageSubscriptionLoading
                ? hasManagedSubscription
                  ? "Opening portal..."
                  : "Opening checkout..."
                : isLinkageState
                  ? "Subscription sync pending"
                : hasManagedSubscription
                  ? "Manage subscription"
                  : "Start subscription"}
            </Button>
            <p className="text-[11px] text-neutral-500">
              {isLinkageState
                ? "An existing Stripe subscription was detected but must finish linking before checkout or portal actions."
                : hasManagedSubscription
                ? "Open Stripe billing portal to manage an existing subscription."
                : "Start checkout to create a new ProFixIQ subscription for this location."}
            </p>

            <Button
              variant="secondary"
              onClick={onOpenStripePortal}
              disabled={!isUnlocked || portalLoading}
            >
              {portalLoading ? "Opening portal..." : "Open billing portal"}
            </Button>
            <p className="text-[11px] text-neutral-500">
              Review invoices, payment methods, and subscription billing history.
            </p>

            {canManageBilling && isCancelableStatus ? (
              cancelAtPeriodEnd ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  <p>
                    Cancellation takes effect at the end of the current billing period.
                    {periodEndIso
                      ? ` Your subscription will end on ${formatDate(periodEndIso)}.`
                      : ""}
                  </p>
                </div>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={onRequestCancelSubscription}
                    disabled={!isUnlocked || cancelLoading}
                    className="border-red-400/40 text-red-100 hover:bg-red-950/25"
                  >
                    {cancelLoading ? "Scheduling cancellation..." : "Cancel subscription"}
                  </Button>
                  <p className="text-[11px] text-neutral-500">
                    Schedule cancellation at period end. Access stays active until then.
                  </p>
                </>
              )
            ) : null}
          </div>
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        tone="passive"
        title="Plan & seats"
        description="Plan limits and active staff seats."
      >
        <div className="grid gap-2">
          <OwnerSettingsStat label="Plan" value={planLabel(plan)} />
          <OwnerSettingsStat label="Seats used" value={seatsUsed} />
          <OwnerSettingsStat
            label="Seat limit"
            value={seatsLimit == null ? "Unlimited" : seatsLimit}
          />
          <OwnerSettingsStat
            label="Remaining"
            value={seatsLimit == null ? "—" : Math.max(0, seatsLimit - seatsUsed)}
          />
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        tone="secondary"
        title="Organization"
        description={
          orgId
            ? "Linked organization and locations."
            : "Use organizations to group multiple shop locations under one account."
        }
        action={
          <div className="flex items-center gap-2">
            <div className="text-xs text-neutral-300">
              {orgId ? (
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  Org: <span className="text-neutral-100">{orgName || "—"}</span>
                </span>
              ) : (
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1">
                  No organization linked
                </span>
              )}
            </div>

            {!orgId ? (
              <Button size="sm" onClick={onCreateOrganization} disabled={!isUnlocked}>
                Create organization
              </Button>
            ) : null}
          </div>
        }
      >
        {orgId ? (
          <div className="space-y-2">
            {locations.length === 0 ? (
              <div className="text-xs text-neutral-500">No locations found.</div>
            ) : (
              <ul className="space-y-2">
                {locations.map((loc) => {
                  const isCurrent = loc.id === shopId;
                  const status = parseStripeStatus(loc.stripe_subscription_status);

                  return (
                    <li
                      key={loc.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-neutral-100">
                          {locationName(loc)}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {formatLocationLine({
                            city: loc.city ?? null,
                            province: loc.province ?? null,
                          })}
                        </div>
                        <div className="mt-1 text-[10px] text-neutral-500">
                          {String(status).toUpperCase()}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isCurrent ? "secondary" : "default"}
                        disabled={!isUnlocked || isCurrent}
                        onClick={() => onSwitchLocation(loc.id)}
                      >
                        {isCurrent ? "Selected" : "Switch"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-neutral-400">
            Create an organization when you want to manage multiple locations together.
            Your current shop will be linked automatically.
          </div>
        )}
      </OwnerSettingsPanel>

      {shopId ? (
        <ShopPublicProfileSection shopId={shopId} isUnlocked={isUnlocked} />
      ) : null}

      <OwnerSettingsPanel tone="passive" title="Invoice preview">
        <div className="space-y-2 rounded-xl bg-white p-3 text-xs text-black shadow">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Logo"
              width={160}
              height={48}
              unoptimized
              className="h-12 object-contain"
            />
          ) : null}
          <div className="font-semibold">{shopName || "Your shop name"}</div>
          <div>
            {address}
            {address ? "," : ""} {city} {province} {postalCode}
          </div>
          <div>
            {phone} {phone && email ? "•" : ""} {email}
          </div>
          <hr className="my-2" />
          <div className="font-semibold text-black">Invoice terms</div>
          <p>{invoiceTerms || "—"}</p>
          <div className="font-semibold text-black">Footer</div>
          <p>{invoiceFooter || "—"}</p>
        </div>
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="email-activity"
        tone="passive"
        title="Email activity"
        description="Recent transactional emails."
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefreshEmailLogs}
            disabled={emailLogsLoading}
          >
            {emailLogsLoading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      >
        {emailLogsLoading ? (
          <div className="text-xs text-neutral-500">Loading…</div>
        ) : emailLogs.length === 0 ? (
          <div className="text-xs text-neutral-500">No emails yet.</div>
        ) : (
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {emailLogs.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs"
              >
                <div className="flex justify-between">
                  <span className="text-neutral-200">
                    {e.template_key.replaceAll("_", " ")}
                  </span>
                  <span className="text-neutral-500">
                    {new Date(e.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="text-neutral-400">{e.to_email}</div>

                <div className="text-[10px] text-neutral-500">{e.status}</div>
              </div>
            ))}
          </div>
        )}
      </OwnerSettingsPanel>
    </div>
  );
}
