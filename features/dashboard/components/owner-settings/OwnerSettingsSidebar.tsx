"use client";

import Image from "next/image";
import { Button } from "@shared/components/ui/Button";
import ShopPublicProfileSection from "@/features/shops/components/ShopPublicProfileSection";

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

function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-50">{title}</h2>
          {description ? (
            <p className="text-[11px] text-neutral-400">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SettingsStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

type Props = {
  shopId: string | null;
  isUnlocked: boolean;
  billingPill: React.ReactNode;
  subStatus: StripeSubStatus;
  stripeAccountId: string | null;
  trialEndIso: string | null;
  periodEndIso: string | null;
  connectLoading: boolean;
  checkoutLoading: boolean;
  portalLoading: boolean;
  plan: "starter" | "pro" | "enterprise" | "unlimited" | "unknown";
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
  onCreateOrganization: () => void;
  onSwitchLocation: (id: string) => void;
  onRefreshEmailLogs: () => void;
  planLabel: (p: "starter" | "pro" | "enterprise" | "unlimited" | "unknown") => string;
  parseStripeStatus: (v: unknown) => StripeSubStatus;
  formatDate: (iso: string | null | undefined) => string;
  formatLocationLine: (s: { city: string | null; province: string | null }) => string;
  locationName: (s: { shop_name?: string | null; name?: string | null }) => string;
};

export default function OwnerSettingsSidebar({
  shopId,
  isUnlocked,
  billingPill,
  subStatus,
  stripeAccountId,
  trialEndIso,
  periodEndIso,
  connectLoading,
  checkoutLoading,
  portalLoading,
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
  onCreateOrganization,
  onSwitchLocation,
  onRefreshEmailLogs,
  planLabel,
  parseStripeStatus,
  formatDate,
  formatLocationLine,
  locationName,
}: Props) {
  return (
    <div className="space-y-5 lg:sticky lg:top-20">
      <SettingsSection
        id="billing-stripe"
        title="Billing & Stripe"
        description="Subscription and payment setup for this location."
        action={<div className="flex items-center gap-2">{billingPill}</div>}
      >
        <div className="grid gap-2">
          <SettingsStat label="Status" value={String(subStatus).toUpperCase()} />
          <SettingsStat
            label="Stripe Connect"
            value={stripeAccountId ? "Connected" : "Not connected"}
          />
          <SettingsStat label="Trial ends" value={formatDate(trialEndIso)} />
          <SettingsStat
            label="Current period ends"
            value={formatDate(periodEndIso)}
          />
          <SettingsStat
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
              disabled={!isUnlocked || checkoutLoading}
            >
              {checkoutLoading ? "Opening checkout..." : "Manage subscription"}
            </Button>
            <p className="text-[11px] text-neutral-500">
              Start or update the ProFixIQ subscription for this location.
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
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Plan & seats"
        description="Plan limits and active staff seats."
      >
        <div className="grid gap-2">
          <SettingsStat label="Plan" value={planLabel(plan)} />
          <SettingsStat label="Seats used" value={seatsUsed} />
          <SettingsStat
            label="Seat limit"
            value={seatsLimit == null ? "Unlimited" : seatsLimit}
          />
          <SettingsStat
            label="Remaining"
            value={seatsLimit == null ? "—" : Math.max(0, seatsLimit - seatsUsed)}
          />
        </div>
      </SettingsSection>

      <SettingsSection
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
      </SettingsSection>

      {shopId ? (
        <ShopPublicProfileSection shopId={shopId} isUnlocked={isUnlocked} />
      ) : null}

      <SettingsSection title="Invoice preview">
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
      </SettingsSection>

      <SettingsSection
        id="email-activity"
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
      </SettingsSection>
    </div>
  );
}
