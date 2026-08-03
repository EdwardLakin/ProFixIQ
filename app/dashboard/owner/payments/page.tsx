"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import OwnerPinModal from "@/features/shared/components/OwnerPinModal";

type DB = Database;
type PaymentRow = DB["public"]["Tables"]["payments"]["Row"];

type ProfileScope = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

type ShopConnectRow = {
  id: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_details_submitted: boolean | null;
  stripe_onboarding_completed: boolean | null;
  stripe_connect_charge_model: string | null;
  stripe_connect_dashboard_type: string | null;
};

type PaymentSettings = {
  shop_id: string;
  portal_payments_enabled: boolean;
  default_currency: "cad" | "usd";
  platform_fee_bps: number;
  receipt_email_enabled: boolean;
};

type SettingsResponse = {
  ok?: boolean;
  settings?: PaymentSettings;
  error?: string;
};

type OnboardingResponse = {
  ok?: boolean;
  onboardingUrl?: string;
  error?: string;
  migration_required?: boolean;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  shop_id: "",
  portal_payments_enabled: false,
  default_currency: "cad",
  platform_fee_bps: 0,
  receipt_email_enabled: true,
};

function formatMoney(cents: number | null, currency: string | null): string {
  const amount = typeof cents === "number" ? cents / 100 : 0;
  const normalizedCurrency = String(currency ?? "cad").toUpperCase();
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: normalizedCurrency === "USD" ? "USD" : "CAD",
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function netAmount(amountCents: number | null, feeCents: number | null): number {
  return Math.max(0, (amountCents ?? 0) - (feeCents ?? 0));
}

function statusLabel(value: string | null): string {
  return String(value ?? "unknown").replaceAll("_", " ").toUpperCase();
}

export default function OwnerPaymentsPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shop, setShop] = useState<ShopConnectRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [pinOpen, setPinOpen] = useState(false);
  const [saveAfterPin, setSaveAfterPin] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<
    "all" | "succeeded" | "pending" | "failed" | "refunded"
  >("all");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setError("Sign in to manage shop payments.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", user.id)
      .maybeSingle<ProfileScope>();
    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const actor = getActorCapabilities({ role: profile?.role });
    if (!profile?.shop_id || !actor.canManageBilling) {
      setError("You do not have permission to manage shop payments.");
      setLoading(false);
      return;
    }

    setShopId(profile.shop_id);

    const [shopResult, paymentResult, settingsResult] = await Promise.all([
      supabase
        .from("shops")
        .select(
          "id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_onboarding_completed, stripe_connect_charge_model, stripe_connect_dashboard_type",
        )
        .eq("id", profile.shop_id)
        .maybeSingle<ShopConnectRow>(),
      supabase
        .from("payments")
        .select(
          "id, shop_id, work_order_id, stripe_payment_intent_id, stripe_checkout_session_id, stripe_connected_account_id, amount_cents, currency, platform_fee_cents, status, created_at",
        )
        .eq("shop_id", profile.shop_id)
        .order("created_at", { ascending: false })
        .limit(200),
      fetch("/api/stripe/payments/settings", { cache: "no-store" }),
    ]);

    if (shopResult.error) {
      setError(shopResult.error.message);
      setLoading(false);
      return;
    }
    if (paymentResult.error) {
      setError(paymentResult.error.message);
      setLoading(false);
      return;
    }

    const settingsJson = (await settingsResult.json().catch(() => ({}))) as SettingsResponse;
    if (!settingsResult.ok || !settingsJson.settings) {
      setError(settingsJson.error ?? "Payment settings could not be loaded.");
      setLoading(false);
      return;
    }

    setShop(shopResult.data ?? null);
    setPayments((paymentResult.data ?? []) as PaymentRow[]);
    setSettings(settingsJson.settings);
    setSavedSettings(settingsJson.settings);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const dirty = useMemo(
    () =>
      settings.portal_payments_enabled !== savedSettings.portal_payments_enabled ||
      settings.default_currency !== savedSettings.default_currency ||
      settings.receipt_email_enabled !== savedSettings.receipt_email_enabled,
    [savedSettings, settings],
  );

  const filteredPayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return payments.filter((payment) => {
      if (status !== "all" && String(payment.status ?? "").toLowerCase() !== status) {
        return false;
      }
      if (!needle) return true;
      return [
        payment.work_order_id,
        payment.stripe_payment_intent_id,
        payment.stripe_checkout_session_id,
      ].some((value) => String(value ?? "").toLowerCase().includes(needle));
    });
  }, [payments, query, status]);

  const connected = Boolean(
    shop?.stripe_account_id &&
      shop.stripe_charges_enabled &&
      shop.stripe_payouts_enabled &&
      shop.stripe_onboarding_completed &&
      shop.stripe_connect_charge_model === "direct",
  );
  const legacyConnection = Boolean(
    shop?.stripe_account_id && shop.stripe_connect_charge_model !== "direct",
  );

  const persistSettings = useCallback(async () => {
    if (!shopId || !dirty) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stripe/payments/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portal_payments_enabled: settings.portal_payments_enabled,
          default_currency: settings.default_currency,
          receipt_email_enabled: settings.receipt_email_enabled,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as SettingsResponse;
      if (response.status === 401 || response.status === 403) {
        setSaveAfterPin(true);
        setPinOpen(true);
        return;
      }
      if (!response.ok || !json.settings) {
        throw new Error(json.error ?? "Payment settings could not be saved.");
      }
      setSettings(json.settings);
      setSavedSettings(json.settings);
      toast.success("Payment settings saved");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Payment settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }, [dirty, settings, shopId]);

  async function beginOnboarding() {
    setConnecting(true);
    try {
      const response = await fetch("/api/stripe/connect/onboard", { method: "POST" });
      const json = (await response.json().catch(() => ({}))) as OnboardingResponse;
      if (!response.ok || !json.onboardingUrl) {
        throw new Error(
          json.migration_required
            ? "This legacy Stripe connection needs a controlled migration before portal payments can be enabled."
            : json.error ?? "Stripe onboarding could not be started.",
        );
      }
      window.location.assign(json.onboardingUrl);
    } catch (connectError) {
      toast.error(
        connectError instanceof Error ? connectError.message : "Stripe onboarding could not be started.",
      );
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading shop payments…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 px-5 py-4 text-sm text-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--metal-border-soft)] bg-[var(--theme-gradient-panel)] shadow-[var(--theme-shadow-medium)]">
        <div className="border-b border-[var(--metal-border-soft)] bg-[color:var(--accent-primary)] px-5 py-4 text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
                Shop payments
              </div>
              <h1 className="mt-1 text-2xl font-semibold">Stripe payment control</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/75">
                Your shop owns the customer payment relationship, processing fees, payouts,
                refunds, disputes, branding, and accepted payment methods.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {connected ? (
                <button
                  type="button"
                  onClick={() => window.open("https://dashboard.stripe.com", "_blank", "noopener,noreferrer")}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[color:var(--accent-primary)] shadow-sm"
                >
                  Open Stripe Dashboard
                </button>
              ) : (
                <button
                  type="button"
                  disabled={connecting || legacyConnection}
                  onClick={() => void beginOnboarding()}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[color:var(--accent-primary)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connecting
                    ? "Opening Stripe…"
                    : shop?.stripe_account_id
                      ? "Continue Stripe setup"
                      : "Connect Stripe"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard label="Connection" value={connected ? "Ready" : legacyConnection ? "Migration needed" : "Not connected"} />
          <StatusCard label="Charges" value={shop?.stripe_charges_enabled ? "Enabled" : "Not enabled"} />
          <StatusCard label="Payouts" value={shop?.stripe_payouts_enabled ? "Enabled" : "Not enabled"} />
          <StatusCard label="Charge model" value={shop?.stripe_connect_charge_model === "direct" ? "Shop-owned" : "Not ready"} />
        </div>
      </section>

      {legacyConnection ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          This shop has a legacy Stripe connection. Portal payments remain disabled until it
          is migrated to the shop-owned direct-charge model.
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
        <div className="rounded-3xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-soft)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                Portal checkout
              </h2>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                Configure the ProFixIQ controls that are enforced before a customer is sent
                to your shop’s Stripe Checkout.
              </p>
            </div>
            <button
              type="button"
              disabled={!dirty || saving || !connected}
              onClick={() => void persistSettings()}
              className="rounded-xl bg-[color:var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save checkout settings"}
            </button>
          </div>

          <div className="mt-5 divide-y divide-[var(--metal-border-soft)] rounded-2xl border border-[var(--metal-border-soft)]">
            <SettingRow
              title="Customer portal payments"
              description="Show Pay Invoice only after Stripe onboarding is complete and a finalized invoice has an outstanding balance."
            >
              <Toggle
                checked={settings.portal_payments_enabled}
                disabled={!connected}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    portal_payments_enabled: checked,
                  }))
                }
              />
            </SettingRow>

            <SettingRow
              title="Default checkout currency"
              description="Used when an invoice does not already carry a valid CAD or USD currency."
            >
              <select
                value={settings.default_currency}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    default_currency: event.target.value === "usd" ? "usd" : "cad",
                  }))
                }
                className="h-10 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)]"
              >
                <option value="cad">CAD</option>
                <option value="usd">USD</option>
              </select>
            </SettingRow>

            <SettingRow
              title="Email Stripe receipts"
              description="Ask Stripe to email a receipt to the customer after a successful payment."
            >
              <Toggle
                checked={settings.receipt_email_enabled}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    receipt_email_enabled: checked,
                  }))
                }
              />
            </SettingRow>
          </div>

          {settings.platform_fee_bps > 0 ? (
            <div className="mt-4 rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
              ProFixIQ platform fee: {(settings.platform_fee_bps / 100).toFixed(2)}%. This is
              controlled by the ProFixIQ billing agreement and cannot be changed by shop users.
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-soft)]">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            Managed in Stripe
          </h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Sensitive processor settings stay in your shop’s own Stripe account.
          </p>
          <div className="mt-4 space-y-3 text-sm text-[color:var(--theme-text-secondary)]">
            {[
              "Cards, bank payments, wallets, and financing methods",
              "Checkout branding and customer statement descriptor",
              "Bank account, payout schedule, and payout history",
              "Refunds, disputes, evidence, and fraud controls",
              "Stripe processing fees, tax settings, and account verification",
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-xl bg-[color:var(--theme-surface-subtle)] px-3 py-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[color:var(--accent-primary)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-[var(--metal-border-soft)] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
              Customer payments
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Payments synchronized from shop-owned Stripe Checkout sessions.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search work order or Stripe ID"
              className="h-10 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)] sm:w-72"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="h-10 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-sm text-[color:var(--theme-text-primary)]"
            >
              <option value="all">All statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-[color:var(--theme-surface-subtle)] text-left text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Work order</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Platform fee</th>
                <th className="px-5 py-3">Shop proceeds</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--metal-border-soft)]">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[color:var(--theme-text-secondary)]">
                    No synchronized customer payments found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const workOrderId = String(payment.work_order_id ?? "");
                  return (
                    <tr key={String(payment.id)} className="hover:bg-[color:var(--theme-surface-subtle)]">
                      <td className="px-5 py-4 text-[color:var(--theme-text-secondary)]">
                        {formatDate(payment.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        {workOrderId ? (
                          <Link
                            href={`/work-orders/${workOrderId}`}
                            className="font-medium text-[color:var(--accent-primary)] hover:underline"
                          >
                            {workOrderId.slice(0, 8)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium text-[color:var(--theme-text-primary)]">
                        {formatMoney(payment.amount_cents, payment.currency)}
                      </td>
                      <td className="px-5 py-4 text-[color:var(--theme-text-secondary)]">
                        {formatMoney(payment.platform_fee_cents, payment.currency)}
                      </td>
                      <td className="px-5 py-4 font-medium text-[color:var(--theme-text-primary)]">
                        {formatMoney(
                          netAmount(payment.amount_cents, payment.platform_fee_cents),
                          payment.currency,
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-xs font-medium text-[color:var(--theme-text-primary)]">
                          {statusLabel(payment.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-[color:var(--theme-text-muted)]">
                        {String(payment.stripe_payment_intent_id ?? payment.stripe_checkout_session_id ?? "—")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <OwnerPinModal
        shopId={shopId}
        open={pinOpen}
        onClose={() => {
          setPinOpen(false);
          setSaveAfterPin(false);
        }}
        onVerified={() => {
          setPinOpen(false);
          if (saveAfterPin) {
            setSaveAfterPin(false);
            void persistSettings();
          }
        }}
      />
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">{value}</div>
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl">
        <div className="font-medium text-[color:var(--theme-text-primary)]">{title}</div>
        <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${
        checked ? "bg-[color:var(--accent-primary)]" : "bg-[color:var(--theme-surface-muted)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}
