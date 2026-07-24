//features/dashboard/app/dashboard/owner/settings/page.tsx

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog";
import { Button } from "@shared/components/ui/Button";
import OwnerPinModal from "@shared/components/OwnerPinModal";
import OwnerSettingsHeader from "@/features/dashboard/components/owner-settings/OwnerSettingsHeader";
import OwnerSettingsBusinessSection from "@/features/dashboard/components/owner-settings/OwnerSettingsBusinessSection";
import OwnerSettingsOperationsSection from "@/features/dashboard/components/owner-settings/OwnerSettingsOperationsSection";
import OwnerAiAutomationSection from "@/features/dashboard/components/owner-settings/OwnerAiAutomationSection";
import OwnerSettingsSchedulingSection from "@/features/dashboard/components/owner-settings/OwnerSettingsSchedulingSection";
import OwnerSettingsSidebar from "@/features/dashboard/components/owner-settings/OwnerSettingsSidebar";
import OwnerSettingsUsersSection from "@/features/dashboard/components/owner-settings/OwnerSettingsUsersSection";
import OwnerSettingsNavigation, {
  ownerSettingsSectionLabel,
  type OwnerSettingsSectionId,
} from "@/features/dashboard/components/owner-settings/OwnerSettingsNavigation";
import {
  OwnerSettingsPanel,
  OwnerSettingsStat,
} from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";
import BrandStudioSummaryCard from "@/features/branding/components/BrandStudioSummaryCard";
import InvoiceDesignSettings from "@/features/dashboard/components/owner-settings/InvoiceDesignSettings";
import QuickBooksConnectCard from "@/features/integrations/quickbooks/components/QuickBooksConnectCard";
import ProfileIdentityCard from "@/features/users/components/ProfileIdentityCard";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  parseStripeSubscriptionStatus,
  type StripeSubscriptionStatusWithUnknown,
} from "@/features/stripe/lib/stripe/subscriptionStatus";
import {
  normalizeCanonicalPlan,
  type CanonicalPlan,
} from "@/features/stripe/lib/stripe/plan-normalization";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { applyThemePreference } from "@/features/shared/lib/theme";

type HourRow = {
  weekday: number;
  open_time: string;
  close_time: string;
  closed?: boolean;
};

type TimeOffRow = {
  id: string;
  start_date: string;
  end_date: string;
  label: string | null;
  notes?: string | null;
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

type StripeSubStatus = StripeSubscriptionStatusWithUnknown;

type ShopBillingScope = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  | "stripe_subscription_status"
  | "stripe_trial_end"
  | "stripe_current_period_end"
  | "stripe_account_id"
>;

type StripeSubscriptionApiResponse = {
  success?: boolean;
  status?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  resolved_plan?: string | null;
  linkage_needed?: boolean;
  linkage_state?:
    | "no_subscription_found"
    | "ambiguous_customer_subscriptions"
    | "subscription_found_not_linked"
    | "metadata_mismatch"
    | "sync_needed"
    | "linked_and_synced";
  sync_performed?: boolean;
  sync_skipped_reason?: string | null;
  matching_subscription_ids?: string[];
  managed_subscription_ids?: string[];
  resolved_subscription_id?: string | null;
  linked_customer_id?: string | null;
  linked_subscription_id?: string | null;
  error?: string;
};

type BillingDisplayStatus =
  | StripeSubStatus
  | "linkage_needed"
  | "subscription_found_not_linked"
  | "ambiguous_customer_subscriptions"
  | "no_subscription_found"
  | "metadata_mismatch"
  | "sync_needed";

type OrgScope = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name"
>;

type ShopLocationRow = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "shop_name"
  | "name"
  | "city"
  | "province"
  | "stripe_subscription_status"
> & {
  organization_id?: string | null;
};

type PlanName = CanonicalPlan | "unknown";

// ✅ These are your seat caps.
// Starter & Pro limited. Everything else unlimited.
const PLAN_LIMITS: Record<Exclude<PlanName, "unknown">, number | null> = {
  starter: 10,
  pro: 50,
  unlimited: null,
};

function parsePlan(v: unknown): PlanName {
  const canonical = normalizeCanonicalPlan(v);
  return canonical ?? "unknown";
}

function planLabel(p: PlanName): string {
  if (p === "unknown") return "Starter";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function planSeatLimit(p: PlanName): number | null {
  const resolved = p === "unknown" ? "starter" : p;
  return PLAN_LIMITS[resolved as Exclude<PlanName, "unknown">] ?? 10;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatLocationLine(s: {
  city: string | null;
  province: string | null;
}) {
  const city = (s.city ?? "").trim();
  const prov = (s.province ?? "").trim();
  if (!city && !prov) return "—";
  if (city && prov) return `${city}, ${prov}`;
  return city || prov;
}

function locationName(s: { shop_name?: string | null; name?: string | null }) {
  return (s.shop_name ?? s.name ?? "").trim() || "Untitled location";
}

const SETTINGS_HASH_MAP: Record<string, OwnerSettingsSectionId> = {
  "settings-overview": "overview",
  "settings-business": "business",
  "settings-operations": "operations",
  "settings-automation": "automation",
  "settings-team": "team",
  "settings-scheduling": "scheduling",
  "settings-communications": "communications",
  "settings-integrations": "integrations",
  "settings-organization": "organization",
  "settings-billing": "billing",
  "shop-info": "business",
  "operations-defaults": "operations",
  "workflow-automation": "operations",
  "customer-portal-enrollment": "operations",
  "appearance-mode": "operations",
  "pricing-validity": "operations",
  "ai-automation-controls": "automation",
  "team-access": "team",
  "team-access-create-user": "team",
  "team-access-users": "team",
  "hours-settings": "scheduling",
  "timeoff-settings": "scheduling",
  "payroll-timekeeping": "scheduling",
  "communication-branding": "communications",
  "email-activity": "communications",
  "quickbooks-integration": "integrations",
  "billing-stripe": "billing",
};

function sectionFromHash(hash: string): OwnerSettingsSectionId {
  return SETTINGS_HASH_MAP[hash.replace(/^#/, "")] ?? "overview";
}

export default function OwnerSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerAvatarUrl, setOwnerAvatarUrl] = useState<string | null>(null);
  const [ownerRole, setOwnerRole] = useState("owner");
  const [activeSection, setActiveSection] =
    useState<OwnerSettingsSectionId>("overview");
  const [coreDirty, setCoreDirty] = useState(false);

  // Current active shop
  const [shopId, setShopId] = useState<string | null>(null);

  // Organization (multi-location)
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [locations, setLocations] = useState<ShopLocationRow[]>([]);

  // Billing status (for badge deep-link)
  const [subStatus, setSubStatus] = useState<StripeSubStatus>("unknown");
  const [billingDisplayStatus, setBillingDisplayStatus] =
    useState<BillingDisplayStatus>("unknown");
  const [trialEndIso, setTrialEndIso] = useState<string | null>(null);
  const [periodEndIso, setPeriodEndIso] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [canManageBilling, setCanManageBilling] = useState(false);

  const trialDaysLeft = daysUntil(trialEndIso);
  const periodDaysLeft = daysUntil(periodEndIso);

  // ✅ Plan + seats (Starter/Pro limited)
  const [plan, setPlan] = useState<PlanName>("unknown");
  const [seatsUsed, setSeatsUsed] = useState<number>(0);
  const [seatsLimit, setSeatsLimit] = useState<number | null>(
    planSeatLimit("unknown"),
  );

  // PIN modal + timer
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinExpiresAt, setPinExpiresAt] = useState<string | undefined>();
  const [now, setNow] = useState<number>(() => Date.now());

  // NA defaults
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [timezone, setTimezone] = useState<string>("America/New_York");

  // Shop fields
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [invoicePreviewRevision, setInvoicePreviewRevision] = useState(0);

  // Money / defaults
  const [laborRate, setLaborRate] = useState("");
  const [suppliesEnabled, setSuppliesEnabled] = useState(false);
  const [suppliesType, setSuppliesType] = useState<"percentage" | "flat">(
    "percentage",
  );
  const [suppliesPercent, setSuppliesPercent] = useState("");
  const [suppliesFlatAmount, setSuppliesFlatAmount] = useState("");
  const [suppliesCapAmount, setSuppliesCapAmount] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [taxRate, setTaxRate] = useState("");

  // Workflow flags
  const [requireCauseCorrection, setRequireCauseCorrection] = useState(false);
  const [requireAuthorization, setRequireAuthorization] = useState(false);

  // Communication
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [emailOnComplete, setEmailOnComplete] = useState(false);

  // Automation
  const [autoGeneratePdf, setAutoGeneratePdf] = useState(false);
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState(false);
  const [appearanceMode, setAppearanceMode] = useState<
    "dark" | "light" | "system"
  >("dark");
  const [appearanceSaving, setAppearanceSaving] = useState(false);

  // Pricing validity
  const [pricingValidDays, setPricingValidDays] = useState<number>(30);
  const [pricingValidDaysLoading, setPricingValidDaysLoading] = useState(false);
  const [pricingValidDaysSaving, setPricingValidDaysSaving] = useState(false);

  // Hours + time off
  const [hours, setHours] = useState<HourRow[]>(
    Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      open_time: "08:00",
      close_time: "17:00",
      closed: i === 0 || i === 6,
    })),
  );
  const [timeOff, setTimeOff] = useState<TimeOffRow[]>([]);
  const [newOffStart, setNewOffStart] = useState("");
  const [newOffEnd, setNewOffEnd] = useState("");
  const [newOffReason, setNewOffReason] = useState("");
  const [hoursDirty, setHoursDirty] = useState(false);

  const [payrollSettings, setPayrollSettings] = useState({
    paid_breaks_per_day: 2,
    paid_break_duration_minutes: 15,
    breaks_are_paid: true,
    lunch_is_paid: false,
    default_lunch_duration_minutes: 30,
    lunch_required_after_minutes: 300,
    daily_overtime_after_minutes: 480,
    suspicious_shift_minutes: 960,
    cadence: "biweekly",
    week_starts_on: 1,
  });
  const [payrollSettingsSaving, setPayrollSettingsSaving] = useState(false);
  const [payrollDirty, setPayrollDirty] = useState(false);

  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);

  const fetchEmailLogs = useCallback(async () => {
    try {
      setEmailLogsLoading(true);
      const res = await fetch("/api/email/logs?limit=25", {
        cache: "no-store",
      });
      if (!res.ok) return;

      const j = await res.json();
      if (Array.isArray(j?.items)) {
        setEmailLogs(j.items);
      }
    } catch {
      // ignore
    } finally {
      setEmailLogsLoading(false);
    }
  }, []);

  // Shared UI classes for selects (fix: dark inputs + consistent font colors)
  const selectClass =
    "w-full rounded-md border border-border bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] shadow-inner outline-none transition focus:border-[color:var(--theme-border-soft)] focus:ring-1 focus:ring-[color:var(--theme-border-strong)] disabled:opacity-50";
  const labelClass = "text-xs text-[color:var(--theme-text-secondary)]";

  useEffect(() => {
    const syncHash = () =>
      setActiveSection(sectionFromHash(window.location.hash));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const changeSection = useCallback((section: OwnerSettingsSectionId) => {
    setActiveSection(section);
    window.history.replaceState(null, "", `#settings-${section}`);
    window.requestAnimationFrame(() => {
      document.getElementById("owner-settings-content")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!coreDirty && !hoursDirty && !payrollDirty) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [coreDirty, hoursDirty, payrollDirty]);

  const isUnlocked = useMemo(() => {
    if (!pinExpiresAt) return false;
    return new Date(pinExpiresAt).getTime() > now;
  }, [pinExpiresAt, now]);

  const provinceLabel = country === "CA" ? "Province" : "State";
  const postalLabel = country === "CA" ? "Postal code" : "ZIP code";
  const taxLabel =
    country === "CA" ? "Tax rate (GST/PST/HST %)" : "Tax rate (Sales tax %)";
  const currency = country === "CA" ? "CAD" : "USD";

  const guardUnlock = () => {
    if (!isUnlocked) {
      toast.warning("Unlock with Owner PIN first.");
      setPinModalOpen(true);
      return false;
    }
    return true;
  };

  const updatePayrollSettings = (update: Partial<typeof payrollSettings>) => {
    setPayrollSettings((previous) => ({ ...previous, ...update }));
    setPayrollDirty(true);
  };

  const updateHours = useCallback(
    (updater: (previous: HourRow[]) => HourRow[]) => {
      setHours((previous) => updater(previous));
      setHoursDirty(true);
    },
    [],
  );

  async function savePayrollSettings() {
    if (!guardUnlock()) return;
    setPayrollSettingsSaving(true);
    const res = await fetch("/api/payroll-time/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payrollSettings),
    });
    const body = await res.json().catch(() => null);
    setPayrollSettingsSaving(false);
    if (!res.ok) {
      toast.error(body?.error || "Failed to save payroll settings");
      return;
    }
    setPayrollSettings((prev) => ({ ...prev, ...(body?.settings ?? {}) }));
    setPayrollDirty(false);
    toast.success("Payroll & timekeeping settings saved.");
  }

  const maybeToastSeatInfo = (
    used: number,
    limit: number | null,
    p: PlanName,
  ) => {
    if (limit == null) return;

    if (used >= limit) {
      toast.error(
        `User limit reached (${used}/${limit}) on ${planLabel(p)}. Upgrade to add more staff.`,
      );
      return;
    }

    const pct = limit > 0 ? used / limit : 0;
    if (pct >= 0.9) {
      toast.warning(
        `Approaching user limit (${used}/${limit}) on ${planLabel(p)}.`,
      );
    }
  };

  const refreshBillingState = useCallback(
    async (sid: string) => {
      const { data: billing } = await supabase
        .from("shops")
        .select(
          "plan, stripe_subscription_status, stripe_trial_end, stripe_current_period_end, stripe_account_id",
        )
        .eq("id", sid)
        .maybeSingle<
          ShopBillingScope &
            Pick<Database["public"]["Tables"]["shops"]["Row"], "plan">
        >();

      setStripeAccountId((billing?.stripe_account_id as string | null) ?? null);
      const planSignal = parsePlan((billing?.plan as string | null) ?? null);
      const shopStatus = parseStripeSubscriptionStatus(
        billing?.stripe_subscription_status,
      );
      const shopTrialEnd = (billing?.stripe_trial_end as string | null) ?? null;
      const shopPeriodEnd =
        (billing?.stripe_current_period_end as string | null) ?? null;

      try {
        const res = await fetch("/api/stripe/subscription", {
          method: "GET",
          cache: "no-store",
        });
        const j = (await res
          .json()
          .catch(() => ({}))) as StripeSubscriptionApiResponse;

        if (!res.ok) {
          setSubStatus(shopStatus);
          setTrialEndIso(shopTrialEnd);
          setPeriodEndIso(shopPeriodEnd);
          setBillingDisplayStatus(
            planSignal !== "unknown" && shopStatus === "unknown"
              ? "sync_needed"
              : shopStatus,
          );
          setCancelAtPeriodEnd(false);
          return;
        }

        const canonicalStatus = parseStripeSubscriptionStatus(j.status);
        setSubStatus(canonicalStatus);
        setCancelAtPeriodEnd(Boolean(j.cancel_at_period_end));

        if (j.trial_end !== undefined) {
          setTrialEndIso(j.trial_end ?? null);
        } else {
          setTrialEndIso(shopTrialEnd);
        }
        if (j.current_period_end !== undefined) {
          setPeriodEndIso(j.current_period_end ?? null);
        } else {
          setPeriodEndIso(shopPeriodEnd);
        }

        if (j.linkage_needed) {
          if (j.linkage_state === "ambiguous_customer_subscriptions") {
            setBillingDisplayStatus("ambiguous_customer_subscriptions");
            return;
          }
          if (j.linkage_state === "no_subscription_found") {
            setBillingDisplayStatus("no_subscription_found");
            return;
          }
          setBillingDisplayStatus("subscription_found_not_linked");
          return;
        }

        const resolvedPlan = parsePlan(j.resolved_plan);
        if (resolvedPlan !== "unknown") {
          setPlan(resolvedPlan);
          setSeatsLimit(planSeatLimit(resolvedPlan));
        }

        setBillingDisplayStatus(
          j.linkage_state === "metadata_mismatch"
            ? "metadata_mismatch"
            : canonicalStatus === "unknown" && planSignal !== "unknown"
              ? "sync_needed"
              : canonicalStatus,
        );
      } catch {
        setSubStatus(shopStatus);
        setTrialEndIso(shopTrialEnd);
        setPeriodEndIso(shopPeriodEnd);
        setBillingDisplayStatus(
          planSignal !== "unknown" && shopStatus === "unknown"
            ? "sync_needed"
            : shopStatus,
        );
        setCancelAtPeriodEnd(false);
      }
    },
    [supabase],
  );

  const fetchSettings = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const uid = user?.id ?? null;
    setUserId(uid);

    if (!uid) {
      setLoading(false);
      return;
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("shop_id, organization_id, full_name, email, avatar_url, role")
      .eq("id", uid)
      .maybeSingle<{
        shop_id: string | null;
        organization_id: string | null;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
        role: string | null;
      }>();

    if (profErr) {
      toast.error(profErr.message);
      setLoading(false);
      return;
    }

    if (!profile?.shop_id) {
      setLoading(false);
      return;
    }

    setOwnerName(profile.full_name ?? "");
    setOwnerEmail(profile.email ?? "");
    setOwnerAvatarUrl(profile.avatar_url ?? null);
    setOwnerRole(profile.role?.trim().toLowerCase() || "owner");
    setCanManageBilling(
      getActorCapabilities({ role: profile.role }).canManageBilling,
    );

    const sid = profile.shop_id;
    setShopId(sid);

    // core shop row
    const { data: shop, error } = await supabase
      .from("shops")
      .select("*")
      .eq("id", sid)
      .maybeSingle();

    if (error) toast.error(error.message);

    // ✅ Plan + seats (Plan comes from shops.plan)
    const resolvedPlan = parsePlan((shop as { plan?: unknown } | null)?.plan);
    setPlan(resolvedPlan);
    setSeatsLimit(planSeatLimit(resolvedPlan));

    // Seats used = # of profiles in this shop
    // Seats used = # of profiles in this shop (use server route so RLS doesn't force 1)
    try {
      const res = await fetch("/api/admin/user-count", { cache: "no-store" });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn("[OwnerSettings] user-count failed", res.status, t);
      } else {
        const j = (await res.json()) as { count?: number };
        const used = typeof j.count === "number" ? j.count : 0;
        setSeatsUsed(used);
        maybeToastSeatInfo(used, planSeatLimit(resolvedPlan), resolvedPlan);
      }
    } catch (e) {
      console.warn("[OwnerSettings] user-count exception", e);
    }

    if (shop) {
      const resolvedShopName =
        (shop.shop_name as string | null) ||
        (shop.name as string | null) ||
        (shop.business_name as string | null) ||
        "";
      setShopName(resolvedShopName);

      const resolvedStreet =
        (shop.street as string | null) || (shop.address as string | null) || "";
      setAddress(resolvedStreet);

      setCity((shop.city as string | null) || "");
      setProvince((shop.province as string | null) || "");
      setPostalCode((shop.postal_code as string | null) || "");
      setPhone((shop.phone_number as string | null) || "");
      setEmail((shop.email as string | null) || "");

      const c = (shop.country as string | null) || "US";
      setCountry(c === "CA" ? "CA" : "US");

      setTimezone((shop.timezone as string | null) || "America/New_York");

      setLaborRate(
        typeof shop.labor_rate === "number" ? String(shop.labor_rate) : "",
      );
      setSuppliesEnabled(
        Boolean(
          (shop as { shop_supplies_enabled?: boolean | null })
            .shop_supplies_enabled ??
          (typeof shop.supplies_percent === "number" &&
            shop.supplies_percent > 0),
        ),
      );
      setSuppliesType(
        (shop as { shop_supplies_type?: string | null }).shop_supplies_type ===
          "flat"
          ? "flat"
          : "percentage",
      );
      setSuppliesPercent(
        typeof (shop as { shop_supplies_percent?: number | null })
          .shop_supplies_percent === "number"
          ? String(
              (shop as { shop_supplies_percent?: number })
                .shop_supplies_percent,
            )
          : typeof shop.supplies_percent === "number"
            ? String(shop.supplies_percent)
            : "",
      );
      setSuppliesFlatAmount(
        typeof (shop as { shop_supplies_flat_amount?: number | null })
          .shop_supplies_flat_amount === "number"
          ? String(
              (shop as { shop_supplies_flat_amount?: number })
                .shop_supplies_flat_amount,
            )
          : "",
      );
      setSuppliesCapAmount(
        typeof (shop as { shop_supplies_cap_amount?: number | null })
          .shop_supplies_cap_amount === "number"
          ? String(
              (shop as { shop_supplies_cap_amount?: number })
                .shop_supplies_cap_amount,
            )
          : "",
      );
      setDiagnosticFee(
        typeof shop.diagnostic_fee === "number"
          ? String(shop.diagnostic_fee)
          : "",
      );
      setTaxRate(
        typeof shop.tax_rate === "number" ? String(shop.tax_rate) : "",
      );

      setRequireCauseCorrection(!!shop.require_cause_correction);
      setRequireAuthorization(!!shop.require_authorization);

      setInvoiceTerms((shop.invoice_terms as string | null) || "");
      setInvoiceFooter((shop.invoice_footer as string | null) || "");
      setEmailOnComplete(!!shop.email_on_complete);

      setAutoGeneratePdf(!!shop.auto_generate_pdf);
      setAutoSendQuoteEmail(!!shop.auto_send_quote_email);
    }

    await refreshBillingState(sid);

    // pricing validity days
    try {
      setPricingValidDaysLoading(true);
      const pricingRes = await fetch("/api/settings/pricing-valid-days", {
        cache: "no-store",
      });
      if (pricingRes.ok) {
        const pricingJson = (await pricingRes.json()) as {
          ok?: boolean;
          days?: number;
        };
        if (pricingJson?.ok && typeof pricingJson.days === "number") {
          setPricingValidDays(pricingJson.days);
        }
      }
    } catch {
      // ignore
    } finally {
      setPricingValidDaysLoading(false);
    }

    try {
      const payrollRes = await fetch("/api/payroll-time/settings", {
        cache: "no-store",
      });
      if (payrollRes.ok) {
        const payrollJson = await payrollRes.json();
        if (payrollJson?.settings)
          setPayrollSettings((prev) => ({ ...prev, ...payrollJson.settings }));
        setPayrollDirty(false);
      }
    } catch {
      // ignore payroll settings bootstrap failures; section can be reloaded independently
    }

    // Organization + Locations
    const resolvedOrgId =
      (shop?.organization_id as string | null) ??
      profile.organization_id ??
      null;

    setOrgId(resolvedOrgId);

    if (resolvedOrgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", resolvedOrgId)
        .maybeSingle<OrgScope>();

      setOrgName((org?.name ?? "").trim());

      const { data: locs } = await supabase
        .from("shops")
        .select(
          "id, shop_name, name, city, province, stripe_subscription_status, organization_id",
        )
        .eq("organization_id", resolvedOrgId)
        .order("created_at", { ascending: true })
        .returns<ShopLocationRow[]>();

      setLocations(Array.isArray(locs) ? locs : []);
    } else {
      setOrgName("");
      setLocations([]);
    }

    // hours
    try {
      const res = await fetch(`/api/settings/hours?shopId=${sid}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j?.hours)) {
          const byDay = new Map<number, HourRow>();
          (j.hours as HourRow[]).forEach((h) =>
            byDay.set(h.weekday, { ...h, closed: false }),
          );
          const normalized = Array.from({ length: 7 }, (_, i) => {
            const existing = byDay.get(i);
            if (existing) return existing;
            return {
              weekday: i,
              open_time: "08:00",
              close_time: "17:00",
              closed: true,
            };
          });
          setHours(normalized);
          setHoursDirty(false);
        }
      }
    } catch {
      // ignore
    }

    // time off
    try {
      const res = await fetch(`/api/settings/time-off?shopId=${sid}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j?.items)) setTimeOff(j.items);
      }
    } catch {
      // ignore
    }

    // email logs
    await fetchEmailLogs();

    try {
      const prefRes = await fetch("/api/branding/user-preferences", {
        cache: "no-store",
      });
      if (prefRes.ok) {
        const prefJson = (await prefRes.json().catch(() => ({}))) as {
          preferences?: { theme_mode?: string | null } | null;
        };
        const nextMode = String(
          prefJson?.preferences?.theme_mode ?? "dark",
        ).toLowerCase();
        if (
          nextMode === "light" ||
          nextMode === "system" ||
          nextMode === "dark"
        ) {
          setAppearanceMode(nextMode);
        }
      }
    } catch {
      // ignore
    }

    setCoreDirty(false);
    setLoading(false);
  }, [supabase, fetchEmailLogs, refreshBillingState]);

  // initial load
  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    const payload = {
      shopId,
      update: {
        country,
        timezone,

        shop_name: shopName,
        name: shopName,
        street: address,
        address,
        city,
        province,
        postal_code: postalCode,
        phone_number: phone,
        email,

        labor_rate: laborRate ? parseFloat(laborRate) : null,
        supplies_percent:
          suppliesType === "percentage" && suppliesPercent
            ? parseFloat(suppliesPercent)
            : null,
        shop_supplies_enabled: suppliesEnabled,
        shop_supplies_type: suppliesType,
        shop_supplies_percent: suppliesPercent
          ? parseFloat(suppliesPercent)
          : null,
        shop_supplies_flat_amount: suppliesFlatAmount
          ? parseFloat(suppliesFlatAmount)
          : null,
        shop_supplies_cap_amount: suppliesCapAmount
          ? parseFloat(suppliesCapAmount)
          : null,
        diagnostic_fee: diagnosticFee ? parseFloat(diagnosticFee) : null,
        tax_rate: taxRate ? parseFloat(taxRate) : null,

        require_cause_correction: requireCauseCorrection,
        require_authorization: requireAuthorization,

        invoice_terms: invoiceTerms,
        invoice_footer: invoiceFooter,
        email_on_complete: emailOnComplete,

        auto_generate_pdf: autoGeneratePdf,
        auto_send_quote_email: autoSendQuoteEmail,
      },
    };

    const res = await fetch("/api/settings/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Failed to save settings");
      return;
    }

    setCoreDirty(false);
    setInvoicePreviewRevision((value) => value + 1);
    toast.success("Core shop settings saved.");
  };

  const savePricingValidDays = async () => {
    if (!guardUnlock()) return;

    setPricingValidDaysSaving(true);
    try {
      const res = await fetch("/api/settings/pricing-valid-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: pricingValidDays }),
      });

      const j = await res
        .json()
        .catch(() => ({}) as { ok?: boolean; days?: number; error?: string });
      if (!res.ok || !j?.ok) {
        toast.error(j?.error || "Failed to save pricing validity window");
        return;
      }

      if (typeof j.days === "number") {
        setPricingValidDays(j.days);
      }

      toast.success("Pricing validity window updated.");
    } finally {
      setPricingValidDaysSaving(false);
    }
  };

  const saveAppearanceMode = async (nextMode: "dark" | "light" | "system") => {
    setAppearanceSaving(true);
    try {
      const res = await fetch("/api/branding/user-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeMode: nextMode }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Failed to save appearance mode");
        return;
      }

      setAppearanceMode(nextMode);
      applyThemePreference(nextMode);
      window.dispatchEvent(new Event("profixiq:brand-refresh"));
      toast.success("Appearance mode updated.");
    } finally {
      setAppearanceSaving(false);
    }
  };

  const saveHours = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    const openDays = hours.filter((h) => !h.closed);

    const res = await fetch("/api/settings/hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, hours: openDays }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Failed to save hours");
      return;
    }
    setHoursDirty(false);
    toast.success("Hours updated.");
  };

  const addTimeOff = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    if (!newOffStart || !newOffEnd) {
      toast.warning("Select start and end time.");
      return;
    }

    const res = await fetch("/api/settings/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        range: {
          starts_at: newOffStart,
          ends_at: newOffEnd,
          reason: newOffReason || null,
        },
      }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error || "Failed to add time off");
      return;
    }

    setNewOffStart("");
    setNewOffEnd("");
    setNewOffReason("");

    try {
      const r = await fetch(`/api/settings/time-off?shopId=${shopId}`, {
        cache: "no-store",
      });
      if (r.ok) {
        const jj = await r.json();
        setTimeOff(jj.items || []);
      }
    } catch {
      // ignore
    }

    toast.success("Time off added.");
  };

  const deleteTimeOff = async (id: string) => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    const res = await fetch("/api/settings/time-off", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, id }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error || "Failed to remove time off");
      return;
    }

    setTimeOff((prev) => prev.filter((t) => t.id !== id));
    toast.success("Removed.");
  };

  const switchLocation = async (nextShopId: string) => {
    if (!guardUnlock()) return;
    if (nextShopId === shopId) return;

    toast.error(
      "Location switching is disabled here to preserve the signed-in profile shop boundary.",
    );
  };

  const openStripeConnect = async () => {
    if (!guardUnlock()) return;

    try {
      setConnectLoading(true);

      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const j = await res
        .json()
        .catch(
          () =>
            ({}) as { ok?: boolean; error?: string; onboardingUrl?: string },
        );

      if (res.ok && j?.ok && j?.onboardingUrl) {
        window.location.href = j.onboardingUrl;
        return;
      }

      const message = String(j?.error ?? "Failed to start Stripe onboarding");

      if (
        message.toLowerCase().includes("signed up for connect") ||
        message.toLowerCase().includes("dashboard.stripe.com/connect")
      ) {
        toast.info("Opening Stripe Connect setup…");
        window.open(
          "https://dashboard.stripe.com/connect",
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }

      toast.error(message);
    } finally {
      setConnectLoading(false);
    }
  };

  const openStripePortal = async () => {
    if (!guardUnlock()) return;

    try {
      setPortalLoading(true);

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const j = await res
        .json()
        .catch(() => ({}) as { ok?: boolean; error?: string; url?: string });

      if (res.ok && j?.ok && j?.url) {
        window.location.href = j.url;
        return;
      }

      const message = String(j?.error ?? "Failed to open billing portal");

      if (
        message.toLowerCase().includes("no stripe customer") ||
        message.toLowerCase().includes("no billing portal") ||
        message.toLowerCase().includes("not configured")
      ) {
        toast.error(
          "Billing portal is not available yet. Complete subscription checkout first.",
        );
        return;
      }

      toast.error(message);
    } finally {
      setPortalLoading(false);
    }
  };

  const startSubscriptionCheckout = async () => {
    if (!guardUnlock()) return;

    try {
      setCheckoutLoading(true);

      const selectedPlan = plan === "unknown" ? "starter" : plan;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: selectedPlan,
          shopId,
          successPath: "/dashboard/owner/settings#billing-stripe",
          cancelPath: "/dashboard/owner/settings#billing-stripe",
          enableTrial: subStatus !== "active" && subStatus !== "trialing",
        }),
      });

      const j = await res.json().catch(
        () =>
          ({}) as {
            ok?: boolean;
            error?: string;
            details?: string;
            url?: string;
          },
      );

      if (res.ok && j?.ok && j?.url) {
        window.location.href = j.url;
        return;
      }

      const message = String(
        j?.error ?? j?.details ?? "Failed to start checkout",
      );

      if (message.toLowerCase().includes("no active stripe price found")) {
        toast.error(
          `Stripe checkout is not configured for the ${selectedPlan} plan yet. Add the active Stripe price ID for this plan in your environment/settings first.`,
        );
        return;
      }

      toast.error(message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const manageSubscription = async () => {
    if (
      billingDisplayStatus === "subscription_found_not_linked" ||
      billingDisplayStatus === "ambiguous_customer_subscriptions" ||
      billingDisplayStatus === "no_subscription_found" ||
      billingDisplayStatus === "metadata_mismatch" ||
      billingDisplayStatus === "sync_needed"
    ) {
      if (billingDisplayStatus === "subscription_found_not_linked") {
        toast.warning(
          "A Stripe subscription was found but is not linked to this shop yet. Refresh Billing & Stripe before retrying.",
        );
      } else if (billingDisplayStatus === "ambiguous_customer_subscriptions") {
        toast.warning(
          "Multiple managed subscriptions were found for this Stripe customer. Resolve linkage before continuing.",
        );
      } else if (billingDisplayStatus === "no_subscription_found") {
        toast.warning(
          "No managed subscription is linked to this shop yet. Start checkout only if this location truly has no subscription.",
        );
      } else if (billingDisplayStatus === "metadata_mismatch") {
        toast.warning(
          "Billing was reconciled using a deterministic customer match. Refresh to confirm linked status.",
        );
      } else {
        toast.warning(
          "Billing linkage is still syncing. Please refresh in a moment instead of starting a new subscription.",
        );
      }
      return;
    }

    const managedStatuses = new Set<StripeSubStatus>([
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "incomplete",
      "canceled",
      "paused",
    ]);

    if (managedStatuses.has(subStatus)) {
      await openStripePortal();
      return;
    }

    await startSubscriptionCheckout();
  };

  const confirmCancelSubscription = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    try {
      setCancelLoading(true);
      const res = await fetch("/api/stripe/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const j = (await res
        .json()
        .catch(() => ({}))) as StripeSubscriptionApiResponse;

      if (!res.ok) {
        toast.error(j?.error || "Failed to schedule cancellation.");
        return;
      }

      setCancelAtPeriodEnd(Boolean(j.cancel_at_period_end));
      if (j.status) {
        setSubStatus(parseStripeSubscriptionStatus(j.status));
      }
      if (j.current_period_end !== undefined) {
        setPeriodEndIso(j.current_period_end ?? null);
      }
      setCancelDialogOpen(false);

      await refreshBillingState(shopId);
      toast.success(
        "Cancellation scheduled for the end of the current billing period.",
      );
    } finally {
      setCancelLoading(false);
    }
  };

  const lockOwnerSettings = async () => {
    const res = await fetch("/api/shop/owner-pin/clear", { method: "POST" });
    const j = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) {
      toast.error(j?.error || "Failed to lock owner settings");
      return;
    }
    setPinExpiresAt(undefined);
    toast.success("Owner settings locked.");
  };

  if (loading) {
    return (
      <div
        className="mx-auto max-w-[1800px] animate-pulse space-y-5 p-4 sm:p-5 lg:p-6"
        aria-label="Loading shop settings"
      >
        <div className="h-28 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
        <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_340px]">
          <div className="h-[520px] rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
          <div className="space-y-4">
            <div className="h-16 rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
            <div className="h-56 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
            <div className="h-48 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
          </div>
          <div className="h-72 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
        </div>
        <span className="sr-only">Loading shop settings…</span>
      </div>
    );
  }

  const billingPill = (() => {
    const base =
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold";

    if (billingDisplayStatus === "linkage_needed") {
      return (
        <span
          className={`${base} border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200`}
        >
          Linkage needed
        </span>
      );
    }

    if (billingDisplayStatus === "subscription_found_not_linked") {
      return (
        <span
          className={`${base} border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200`}
        >
          Subscription found, link required
        </span>
      );
    }

    if (billingDisplayStatus === "ambiguous_customer_subscriptions") {
      return (
        <span
          className={`${base} border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200`}
        >
          Ambiguous subscriptions
        </span>
      );
    }

    if (billingDisplayStatus === "no_subscription_found") {
      return (
        <span
          className={`${base} border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200`}
        >
          No subscription found
        </span>
      );
    }

    if (billingDisplayStatus === "metadata_mismatch") {
      return (
        <span
          className={`${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`}
        >
          Reconciled from customer
        </span>
      );
    }

    if (billingDisplayStatus === "sync_needed") {
      return (
        <span
          className={`${base} border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-200`}
        >
          Sync needed
        </span>
      );
    }

    if (subStatus === "trialing") {
      const label =
        typeof trialDaysLeft === "number"
          ? trialDaysLeft <= 0
            ? "Ends today"
            : `${trialDaysLeft} days left`
          : "Active";
      return (
        <span
          className={`${base} border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]`}
        >
          <span className="text-[color:var(--accent-copper-light)]">Trial</span>
          <span className="text-[color:var(--theme-text-secondary)]">
            {label}
          </span>
        </span>
      );
    }

    if (subStatus === "active") {
      return (
        <span
          className={`${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`}
        >
          Active
        </span>
      );
    }

    if (
      subStatus === "past_due" ||
      subStatus === "unpaid" ||
      subStatus === "incomplete"
    ) {
      const due =
        typeof periodDaysLeft === "number"
          ? periodDaysLeft <= 0
            ? "Due now"
            : `Due in ${periodDaysLeft} days`
          : "Action needed";
      return (
        <span
          className={`${base} border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200`}
        >
          Billing issue • {due}
        </span>
      );
    }

    if (subStatus === "canceled") {
      return (
        <span
          className={`${base} border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]`}
        >
          Canceled
        </span>
      );
    }

    return (
      <span
        className={`${base} border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]`}
      >
        Status:{" "}
        {String(billingDisplayStatus).replaceAll("_", " ").toUpperCase()}
      </span>
    );
  })();

  const seatLimitLabel =
    seatsLimit == null ? "Unlimited" : `${seatsUsed}/${seatsLimit}`;
  const contextualSections: Array<
    "billing" | "plan" | "organization" | "public-profile" | "preview" | "email"
  > =
    activeSection === "overview"
      ? ["plan"]
      : activeSection === "business"
        ? ["public-profile", "preview"]
        : activeSection === "communications"
          ? ["email", "preview"]
          : activeSection === "organization"
            ? ["organization"]
            : activeSection === "billing"
              ? ["billing", "plan"]
              : [];

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-5 p-4 text-foreground sm:p-5 lg:p-6">
      <OwnerSettingsHeader
        shopName={shopName}
        roleLabel={ownerRole === "admin" ? "Admin" : "Owner"}
        sectionLabel={ownerSettingsSectionLabel(activeSection)}
        isUnlocked={isUnlocked}
        isDirty={coreDirty}
        showSave={
          coreDirty ||
          activeSection === "business" ||
          activeSection === "operations" ||
          activeSection === "communications"
        }
        pinExpiresAt={pinExpiresAt}
        onUnlock={() => setPinModalOpen(true)}
        onLock={() => void lockOwnerSettings()}
        onSave={handleSave}
        onDiscard={() => void fetchSettings()}
      />

      {activeSection === "overview" ? <GuidedPageStepPanel /> : null}

      <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_340px] xl:items-start">
        <OwnerSettingsNavigation
          activeSection={activeSection}
          onSectionChange={changeSection}
        />

        <main
          id="owner-settings-content"
          className={`min-w-0 scroll-mt-24 space-y-5 ${contextualSections.length === 0 ? "xl:col-span-2" : ""}`}
        >
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--theme-border-soft)] pb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
                Settings category
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
                {ownerSettingsSectionLabel(activeSection)}
              </h2>
            </div>
            <div className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              {isUnlocked ? "Editing unlocked" : "Read-only until unlocked"}
            </div>
          </div>

          {activeSection === "overview" ? (
            <>
              <OwnerSettingsPanel
                tone="passive"
                title="System summary"
                description="Current plan, seat utilization, and organization scope."
              >
                <div className="grid gap-3 md:grid-cols-4">
                  <OwnerSettingsStat label="Plan" value={planLabel(plan)} />
                  <OwnerSettingsStat label="Seats" value={seatLimitLabel} />
                  <OwnerSettingsStat
                    label="Billing"
                    value={String(billingDisplayStatus)
                      .replaceAll("_", " ")
                      .toUpperCase()}
                  />
                  <OwnerSettingsStat
                    label="Stripe"
                    value={stripeAccountId ? "Connected" : "Not connected"}
                  />
                </div>
              </OwnerSettingsPanel>

              {userId ? (
                <ProfileIdentityCard
                  supabase={supabase}
                  userId={userId}
                  shopId={shopId}
                  fullName={ownerName || "Owner"}
                  email={ownerEmail}
                  roleLabel={ownerRole === "admin" ? "Admin" : "Owner"}
                  avatarUrl={ownerAvatarUrl}
                  onAvatarChange={setOwnerAvatarUrl}
                  title="Owner identity"
                  subtitle="Shown in owner/admin identity surfaces, chat, and collaborative workflow views."
                />
              ) : null}
            </>
          ) : null}

          {activeSection === "scheduling" ? (
            <OwnerSettingsPanel
              id="payroll-timekeeping"
              title="Payroll & Timekeeping"
              description="Owner-controlled payroll attendance policy. Regular break counts are compliance expectations; payroll calculations use actual punches."
            >
              <div className="grid gap-4 p-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>Paid breaks per day</span>
                  <select
                    className={selectClass}
                    value={payrollSettings.paid_breaks_per_day}
                    onChange={(e) =>
                      updatePayrollSettings({
                        paid_breaks_per_day: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>
                    Paid break duration (minutes)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={payrollSettings.paid_break_duration_minutes}
                    onChange={(e) =>
                      updatePayrollSettings({
                        paid_break_duration_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={payrollSettings.breaks_are_paid}
                    onChange={(e) =>
                      updatePayrollSettings({
                        breaks_are_paid: e.target.checked,
                      })
                    }
                  />{" "}
                  Breaks are paid
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={payrollSettings.lunch_is_paid}
                    onChange={(e) =>
                      updatePayrollSettings({ lunch_is_paid: e.target.checked })
                    }
                  />{" "}
                  Lunch is paid
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>
                    Expected lunch duration (minutes)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={240}
                    value={payrollSettings.default_lunch_duration_minutes}
                    onChange={(e) =>
                      updatePayrollSettings({
                        default_lunch_duration_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>
                    Lunch required after shift length (minutes)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={1440}
                    value={payrollSettings.lunch_required_after_minutes}
                    onChange={(e) =>
                      updatePayrollSettings({
                        lunch_required_after_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>
                    Daily overtime threshold (minutes)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={1440}
                    value={payrollSettings.daily_overtime_after_minutes}
                    onChange={(e) =>
                      updatePayrollSettings({
                        daily_overtime_after_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>
                    Suspicious shift threshold (minutes)
                  </span>
                  <Input
                    type="number"
                    min={60}
                    max={2880}
                    value={payrollSettings.suspicious_shift_minutes}
                    onChange={(e) =>
                      updatePayrollSettings({
                        suspicious_shift_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>Pay cadence</span>
                  <select
                    className={selectClass}
                    value={payrollSettings.cadence}
                    onChange={(e) =>
                      updatePayrollSettings({ cadence: e.target.value })
                    }
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semimonthly">Semi-monthly</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className={labelClass}>Week starts on</span>
                  <select
                    className={selectClass}
                    value={payrollSettings.week_starts_on}
                    onChange={(e) =>
                      updatePayrollSettings({
                        week_starts_on: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] p-4">
                <span className="text-xs text-[color:var(--theme-text-muted)]">
                  {payrollDirty
                    ? "Unsaved payroll changes"
                    : "Payroll settings are up to date"}
                </span>
                <Button
                  onClick={() => void savePayrollSettings()}
                  disabled={
                    payrollSettingsSaving || !isUnlocked || !payrollDirty
                  }
                >
                  {payrollSettingsSaving
                    ? "Saving…"
                    : payrollDirty
                      ? "Save payroll settings"
                      : "Payroll saved"}
                </Button>
              </div>
            </OwnerSettingsPanel>
          ) : null}

          {activeSection === "business" ? (
            <OwnerSettingsBusinessSection
              isUnlocked={isUnlocked}
              country={country}
              timezone={timezone}
              shopName={shopName}
              address={address}
              city={city}
              province={province}
              postalCode={postalCode}
              phone={phone}
              email={email}
              provinceLabel={provinceLabel}
              postalLabel={postalLabel}
              selectClass={selectClass}
              labelClass={labelClass}
              onCountryChange={(value) => {
                setCountry(value);
                setCoreDirty(true);
              }}
              onTimezoneChange={(value) => {
                setTimezone(value);
                setCoreDirty(true);
              }}
              onShopNameChange={(value) => {
                setShopName(value);
                setCoreDirty(true);
              }}
              onAddressChange={(value) => {
                setAddress(value);
                setCoreDirty(true);
              }}
              onCityChange={(value) => {
                setCity(value);
                setCoreDirty(true);
              }}
              onProvinceChange={(value) => {
                setProvince(value);
                setCoreDirty(true);
              }}
              onPostalCodeChange={(value) => {
                setPostalCode(value);
                setCoreDirty(true);
              }}
              onPhoneChange={(value) => {
                setPhone(value);
                setCoreDirty(true);
              }}
              onEmailChange={(value) => {
                setEmail(value);
                setCoreDirty(true);
              }}
            />
          ) : null}
          {activeSection === "business" ? <BrandStudioSummaryCard /> : null}
          {activeSection === "operations" ? (
            <OwnerSettingsOperationsSection
              isUnlocked={isUnlocked}
              currency={currency}
              taxLabel={taxLabel}
              laborRate={laborRate}
              suppliesEnabled={suppliesEnabled}
              suppliesType={suppliesType}
              suppliesPercent={suppliesPercent}
              suppliesFlatAmount={suppliesFlatAmount}
              suppliesCapAmount={suppliesCapAmount}
              diagnosticFee={diagnosticFee}
              taxRate={taxRate}
              pricingValidDays={pricingValidDays}
              pricingValidDaysLoading={pricingValidDaysLoading}
              pricingValidDaysSaving={pricingValidDaysSaving}
              requireCauseCorrection={requireCauseCorrection}
              requireAuthorization={requireAuthorization}
              autoGeneratePdf={autoGeneratePdf}
              autoSendQuoteEmail={autoSendQuoteEmail}
              appearanceMode={appearanceMode}
              appearanceSaving={appearanceSaving}
              onLaborRateChange={(value) => {
                setLaborRate(value);
                setCoreDirty(true);
              }}
              onSuppliesEnabledChange={(value) => {
                setSuppliesEnabled(value);
                setCoreDirty(true);
              }}
              onSuppliesTypeChange={(value) => {
                setSuppliesType(value);
                setCoreDirty(true);
              }}
              onSuppliesPercentChange={(value) => {
                setSuppliesPercent(value);
                setCoreDirty(true);
              }}
              onSuppliesFlatAmountChange={(value) => {
                setSuppliesFlatAmount(value);
                setCoreDirty(true);
              }}
              onSuppliesCapAmountChange={(value) => {
                setSuppliesCapAmount(value);
                setCoreDirty(true);
              }}
              onDiagnosticFeeChange={(value) => {
                setDiagnosticFee(value);
                setCoreDirty(true);
              }}
              onTaxRateChange={(value) => {
                setTaxRate(value);
                setCoreDirty(true);
              }}
              onPricingValidDaysChange={setPricingValidDays}
              onSavePricingValidDays={savePricingValidDays}
              onRequireCauseCorrectionChange={(value) => {
                setRequireCauseCorrection(value);
                setCoreDirty(true);
              }}
              onRequireAuthorizationChange={(value) => {
                setRequireAuthorization(value);
                setCoreDirty(true);
              }}
              onAutoGeneratePdfChange={(value) => {
                setAutoGeneratePdf(value);
                setCoreDirty(true);
              }}
              onAutoSendQuoteEmailChange={(value) => {
                setAutoSendQuoteEmail(value);
                setCoreDirty(true);
              }}
              onAppearanceModeChange={(value) => void saveAppearanceMode(value)}
            />
          ) : null}
          {activeSection === "automation" ? (
            <OwnerAiAutomationSection isUnlocked={isUnlocked} />
          ) : null}
          {activeSection === "team" ? (
            <OwnerSettingsUsersSection
              creatorShopName={shopName}
              creatorRole={ownerRole}
              onUserCreated={() => setSeatsUsed((used) => used + 1)}
            />
          ) : null}
          {activeSection === "integrations" ? (
            <OwnerSettingsPanel
              id="quickbooks-integration"
              tone="secondary"
              title="Accounting integration"
              description="Connect financial workflows without mixing them into daily shop defaults."
            >
              <QuickBooksConnectCard />
            </OwnerSettingsPanel>
          ) : null}

          {activeSection === "communications" ? (
            <OwnerSettingsPanel
              id="communication-branding"
              tone="secondary"
              title="Communication"
              description="Invoice defaults and completion messaging."
            >
              <label className="block space-y-1.5 text-sm">
                <span className={labelClass}>Invoice terms</span>
                <Input
                  value={invoiceTerms}
                  onChange={(e) => {
                    setInvoiceTerms(e.target.value);
                    setCoreDirty(true);
                  }}
                  placeholder="Payment due on receipt"
                  disabled={!isUnlocked}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className={labelClass}>Invoice footer</span>
                <Input
                  value={invoiceFooter}
                  onChange={(e) => {
                    setInvoiceFooter(e.target.value);
                    setCoreDirty(true);
                  }}
                  placeholder="Thank you for trusting our shop"
                  disabled={!isUnlocked}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]">
                <input
                  type="checkbox"
                  checked={emailOnComplete}
                  onChange={(e) => {
                    setEmailOnComplete(e.target.checked);
                    setCoreDirty(true);
                  }}
                  disabled={!isUnlocked}
                  className="h-4 w-4 accent-[var(--accent-copper)]"
                />
                <span>
                  <span className="block font-semibold">Completion email</span>
                  <span className="mt-0.5 block text-xs text-[color:var(--theme-text-muted)]">
                    Notify the customer automatically when the work order is
                    completed.
                  </span>
                </span>
              </label>
            </OwnerSettingsPanel>
          ) : null}
          {activeSection === "communications" ? (
            <InvoiceDesignSettings
              shopId={shopId}
              isUnlocked={isUnlocked}
              onSaved={() => setInvoicePreviewRevision((value) => value + 1)}
            />
          ) : null}

          {activeSection === "scheduling" ? (
            <OwnerSettingsSchedulingSection
              isUnlocked={isUnlocked}
              timezone={timezone}
              hours={hours}
              hoursDirty={hoursDirty}
              timeOff={timeOff}
              newOffStart={newOffStart}
              newOffEnd={newOffEnd}
              newOffReason={newOffReason}
              onHoursChange={updateHours}
              onNewOffStartChange={setNewOffStart}
              onNewOffEndChange={setNewOffEnd}
              onNewOffReasonChange={setNewOffReason}
              onSaveHours={saveHours}
              onAddTimeOff={addTimeOff}
              onDeleteTimeOff={deleteTimeOff}
            />
          ) : null}

          {activeSection === "organization" ? (
            <OwnerSettingsPanel
              title="Location scope"
              description="Review the organization connected to this shop, then switch locations from the context panel."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <OwnerSettingsStat
                  label="Organization"
                  value={orgName || "Not connected"}
                />
                <OwnerSettingsStat
                  label="Locations"
                  value={locations.length || 1}
                />
              </div>
            </OwnerSettingsPanel>
          ) : null}

          {activeSection === "billing" ? (
            <OwnerSettingsPanel
              title="Billing overview"
              description="Subscription and payout status for the current location."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <OwnerSettingsStat label="Plan" value={planLabel(plan)} />
                <OwnerSettingsStat
                  label="Subscription"
                  value={String(billingDisplayStatus).replaceAll("_", " ")}
                />
                <OwnerSettingsStat
                  label="Payouts"
                  value={stripeAccountId ? "Connected" : "Not connected"}
                />
              </div>
            </OwnerSettingsPanel>
          ) : null}
        </main>

        {contextualSections.length > 0 ? (
          <OwnerSettingsSidebar
            sections={contextualSections}
            shopId={shopId}
            isUnlocked={isUnlocked}
            canManageBilling={canManageBilling}
            billingPill={billingPill}
            subStatus={subStatus}
            billingDisplayStatus={billingDisplayStatus}
            stripeAccountId={stripeAccountId}
            trialEndIso={trialEndIso}
            periodEndIso={periodEndIso}
            cancelAtPeriodEnd={cancelAtPeriodEnd}
            connectLoading={connectLoading}
            checkoutLoading={checkoutLoading}
            portalLoading={portalLoading}
            cancelLoading={cancelLoading}
            plan={plan}
            seatsUsed={seatsUsed}
            seatsLimit={seatsLimit}
            orgId={orgId}
            orgName={orgName}
            locations={locations}
            invoicePreviewRevision={invoicePreviewRevision}
            emailLogs={emailLogs}
            emailLogsLoading={emailLogsLoading}
            onOpenStripeConnect={openStripeConnect}
            onStartSubscriptionCheckout={manageSubscription}
            onRequestCancelSubscription={() => setCancelDialogOpen(true)}
            onCreateOrganization={() =>
              router.push("/dashboard/owner/organization/create")
            }
            onSwitchLocation={(id) => void switchLocation(id)}
            onRefreshEmailLogs={() => void fetchEmailLogs()}
            planLabel={planLabel}
            parseStripeStatus={parseStripeSubscriptionStatus}
            formatDate={formatDate}
            formatLocationLine={formatLocationLine}
            locationName={locationName}
          />
        ) : null}
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
          <DialogHeader>
            <DialogTitle>Cancel subscription</DialogTitle>
            <DialogDescription className="text-[color:var(--theme-text-secondary)]">
              You are currently on the {planLabel(plan)} plan. Cancellation is
              scheduled for the end of your current billing period by default.{" "}
              Your access and seats remain active until that date.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]">
            After the period ends, paid subscription features stop renewing for
            this location until you subscribe again.
            {periodEndIso
              ? ` Current period end: ${formatDate(periodEndIso)}.`
              : ""}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelLoading}
            >
              Keep subscription
            </Button>
            <Button
              onClick={() => void confirmCancelSubscription()}
              disabled={cancelLoading}
              className="bg-red-600 text-[color:var(--theme-text-primary)] hover:bg-red-500"
            >
              {cancelLoading ? "Scheduling..." : "Cancel at period end"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OwnerPinModal
        shopId={shopId}
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onVerified={(iso: string | undefined) => setPinExpiresAt(iso)}
      />
    </div>
  );
}
