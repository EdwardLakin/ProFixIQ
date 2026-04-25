//features/dashboard/app/dashboard/owner/settings/page.tsx

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
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
import OwnerSettingsSchedulingSection from "@/features/dashboard/components/owner-settings/OwnerSettingsSchedulingSection";
import OwnerSettingsSidebar from "@/features/dashboard/components/owner-settings/OwnerSettingsSidebar";
import { OwnerSettingsPanel, OwnerSettingsSectionIntro, OwnerSettingsStat } from "@/features/dashboard/components/owner-settings/OwnerSettingsPanels";
import BrandStudioSummaryCard from "@/features/branding/components/BrandStudioSummaryCard";
import QuickBooksConnectCard from "@/features/integrations/quickbooks/components/QuickBooksConnectCard";
import ProfileIdentityCard from "@/features/users/components/ProfileIdentityCard";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  parseStripeSubscriptionStatus,
  type StripeSubscriptionStatusWithUnknown,
} from "@/features/stripe/lib/stripe/subscriptionStatus";

type FileInputChangeEvent = {
  target: {
    files: FileList | null;
  };
};

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
  "stripe_subscription_status" | "stripe_trial_end" | "stripe_current_period_end" | "stripe_account_id"
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
  "id" | "shop_name" | "name" | "city" | "province" | "stripe_subscription_status"
> & {
  organization_id?: string | null;
};

type PlanName = "starter" | "pro" | "enterprise" | "unlimited" | "unknown";

// ✅ These are your seat caps.
// Starter & Pro limited. Everything else unlimited.
const PLAN_LIMITS: Record<Exclude<PlanName, "unknown">, number | null> = {
  starter: 10,
  pro: 50,
  enterprise: null,
  unlimited: null,
};




function parsePlan(v: unknown): PlanName {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "starter") return "starter";
  if (s === "pro") return "pro";
  if (s === "enterprise") return "enterprise";
  if (s === "unlimited") return "unlimited";
  return "unknown";
}

function planLabel(p: PlanName): string {
  if (p === "unknown") return "Starter";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function planSeatLimit(p: PlanName): number | null {
  const resolved = p === "unknown" ? "starter" : p;
  return PLAN_LIMITS[resolved as Exclude<PlanName, "unknown">] ?? 10;
}

function isPlanUserLimitReachedError(err: unknown): boolean {
  const msg = String((err as { message?: unknown } | null)?.message ?? err ?? "");
  return msg.includes("PLAN_USER_LIMIT_REACHED");
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

function formatLocationLine(s: { city: string | null; province: string | null }) {
  const city = (s.city ?? "").trim();
  const prov = (s.province ?? "").trim();
  if (!city && !prov) return "—";
  if (city && prov) return `${city}, ${prov}`;
  return city || prov;
}

function locationName(s: { shop_name?: string | null; name?: string | null }) {
  return (s.shop_name ?? s.name ?? "").trim() || "Untitled location";
}


export default function OwnerSettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerAvatarUrl, setOwnerAvatarUrl] = useState<string | null>(null);

  // Current active shop
  const [shopId, setShopId] = useState<string | null>(null);

  // Organization (multi-location)
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [locations, setLocations] = useState<ShopLocationRow[]>([]);

  // Billing status (for badge deep-link)
  const [subStatus, setSubStatus] = useState<StripeSubStatus>("unknown");
  const [billingDisplayStatus, setBillingDisplayStatus] = useState<BillingDisplayStatus>("unknown");
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
  const [seatsLimit, setSeatsLimit] = useState<number | null>(planSeatLimit("unknown"));

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
  const [logoUrl, setLogoUrl] = useState("");

  // Money / defaults
  const [laborRate, setLaborRate] = useState("");
  const [suppliesPercent, setSuppliesPercent] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [taxRate, setTaxRate] = useState("");

  // Workflow flags
  const [useAi, setUseAi] = useState(false);
  const [requireCauseCorrection, setRequireCauseCorrection] = useState(false);
  const [requireAuthorization, setRequireAuthorization] = useState(false);

  // Communication
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [emailOnComplete, setEmailOnComplete] = useState(false);

  // Automation
  const [autoGeneratePdf, setAutoGeneratePdf] = useState(false);
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState(false);
  const [appearanceMode, setAppearanceMode] = useState<"dark" | "light" | "system">("dark");
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

  const [emailLogs, setEmailLogs] = useState<EmailLogRow[]>([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);

  const fetchEmailLogs = useCallback(async () => {
    try {
      setEmailLogsLoading(true);
      const res = await fetch("/api/email/logs?limit=25", { cache: "no-store" });
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
    "w-full rounded-md border border-border bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 shadow-inner outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/10 disabled:opacity-50";
  const labelClass = "text-xs text-neutral-400";
  const navChipClass =
    "inline-flex items-center rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:bg-black/40 hover:text-white";

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const maybeToastSeatInfo = (used: number, limit: number | null, p: PlanName) => {
    if (limit == null) return;

    if (used >= limit) {
      toast.error(
        `User limit reached (${used}/${limit}) on ${planLabel(p)}. Upgrade to add more staff.`,
      );
      return;
    }

    const pct = limit > 0 ? used / limit : 0;
    if (pct >= 0.9) {
      toast.warning(`Approaching user limit (${used}/${limit}) on ${planLabel(p)}.`);
    }
  };

  const refreshBillingState = useCallback(
    async (sid: string) => {
      const { data: billing } = await supabase
        .from("shops")
        .select("plan, stripe_subscription_status, stripe_trial_end, stripe_current_period_end, stripe_account_id")
        .eq("id", sid)
        .maybeSingle<
          ShopBillingScope & Pick<Database["public"]["Tables"]["shops"]["Row"], "plan">
        >();

      setStripeAccountId((billing?.stripe_account_id as string | null) ?? null);
      const planSignal = parsePlan((billing?.plan as string | null) ?? null);
      const shopStatus = parseStripeSubscriptionStatus(billing?.stripe_subscription_status);
      const shopTrialEnd = (billing?.stripe_trial_end as string | null) ?? null;
      const shopPeriodEnd = (billing?.stripe_current_period_end as string | null) ?? null;

      try {
        const res = await fetch("/api/stripe/subscription", {
          method: "GET",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as StripeSubscriptionApiResponse;

        if (!res.ok) {
          setSubStatus(shopStatus);
          setTrialEndIso(shopTrialEnd);
          setPeriodEndIso(shopPeriodEnd);
          setBillingDisplayStatus(planSignal !== "unknown" && shopStatus === "unknown" ? "sync_needed" : shopStatus);
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
        setBillingDisplayStatus(planSignal !== "unknown" && shopStatus === "unknown" ? "sync_needed" : shopStatus);
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
    setCanManageBilling(getActorCapabilities({ role: profile.role }).canManageBilling);

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
      setLogoUrl((shop.logo_url as string | null) || "");

      const c = (shop.country as string | null) || "US";
      setCountry(c === "CA" ? "CA" : "US");

      setTimezone((shop.timezone as string | null) || "America/New_York");

      setLaborRate(typeof shop.labor_rate === "number" ? String(shop.labor_rate) : "");
      setSuppliesPercent(
        typeof shop.supplies_percent === "number" ? String(shop.supplies_percent) : "",
      );
      setDiagnosticFee(
        typeof shop.diagnostic_fee === "number" ? String(shop.diagnostic_fee) : "",
      );
      setTaxRate(typeof shop.tax_rate === "number" ? String(shop.tax_rate) : "");

      setUseAi(!!shop.use_ai);
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
        const pricingJson = (await pricingRes.json()) as { ok?: boolean; days?: number };
        if (pricingJson?.ok && typeof pricingJson.days === "number") {
          setPricingValidDays(pricingJson.days);
        }
      }
    } catch {
      // ignore
    } finally {
      setPricingValidDaysLoading(false);
    }

    // Organization + Locations
    const resolvedOrgId =
      (shop?.organization_id as string | null) ?? profile.organization_id ?? null;

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
      const res = await fetch(`/api/settings/hours?shopId=${sid}`, { cache: "no-store" });
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
            return { weekday: i, open_time: "08:00", close_time: "17:00", closed: true };
          });
          setHours(normalized);
        }
      }
    } catch {
      // ignore
    }

    // time off
    try {
      const res = await fetch(`/api/settings/time-off?shopId=${sid}`, { cache: "no-store" });
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
      const prefRes = await fetch("/api/branding/user-preferences", { cache: "no-store" });
      if (prefRes.ok) {
        const prefJson = (await prefRes.json().catch(() => ({}))) as {
          preferences?: { theme_mode?: string | null } | null;
        };
        const nextMode = String(prefJson?.preferences?.theme_mode ?? "dark").toLowerCase();
        if (nextMode === "light" || nextMode === "system" || nextMode === "dark") {
          setAppearanceMode(nextMode);
        }
      }
    } catch {
      // ignore
    }

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
        logo_url: logoUrl,

        labor_rate: laborRate ? parseFloat(laborRate) : null,
        supplies_percent: suppliesPercent ? parseFloat(suppliesPercent) : null,
        diagnostic_fee: diagnosticFee ? parseFloat(diagnosticFee) : null,
        tax_rate: taxRate ? parseFloat(taxRate) : null,

        use_ai: useAi,
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

    toast.success("Settings saved.");
  };

  const handleLogoUpload = async (e: FileInputChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filePath = `logos/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
    setLogoUrl(data.publicUrl);
    toast.success("Logo uploaded.");
  };

  const handleGenerateLogo = () => {
    toast.info("AI Logo generation coming soon…");
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

      const j = await res.json().catch(() => ({} as { ok?: boolean; days?: number; error?: string }));
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

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Failed to save appearance mode");
        return;
      }

      setAppearanceMode(nextMode);
      window.localStorage.setItem("pfq-theme-mode", nextMode);
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
    if (!userId) return;
    if (!guardUnlock()) return;

    if (nextShopId === shopId) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        shop_id: nextShopId,
        organization_id: orgId,
      } as unknown as Database["public"]["Tables"]["profiles"]["Update"])
      .eq("id", userId);

    if (error) {
      if (isPlanUserLimitReachedError(error)) {
        toast.error(
          "That location is at its user limit for this plan. Upgrade the location to add more staff.",
        );
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Switched location.");
    await fetchSettings();
    router.refresh();
  };


;

;

;



  const openStripeConnect = async () => {
    if (!guardUnlock()) return;

    try {
      setConnectLoading(true);

      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const j = await res.json().catch(
        () => ({} as { ok?: boolean; error?: string; onboardingUrl?: string }),
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
        window.open("https://dashboard.stripe.com/connect", "_blank", "noopener,noreferrer");
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

      const j = await res.json().catch(
        () => ({} as { ok?: boolean; error?: string; url?: string }),
      );

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
        toast.error("Billing portal is not available yet. Complete subscription checkout first.");
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
          successPath: "/dashboard/owner/settings#billing",
          cancelPath: "/dashboard/owner/settings#billing",
          enableTrial: subStatus !== "active" && subStatus !== "trialing",
        }),
      });

      const j = await res.json().catch(
        () => ({} as { ok?: boolean; error?: string; details?: string; url?: string }),
      );

      if (res.ok && j?.ok && j?.url) {
        window.location.href = j.url;
        return;
      }

      const message = String(j?.error ?? j?.details ?? "Failed to start checkout");

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

      const j = (await res.json().catch(() => ({}))) as StripeSubscriptionApiResponse;

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
      toast.success("Cancellation scheduled for the end of the current billing period.");
    } finally {
      setCancelLoading(false);
    }
  };


  const lockOwnerSettings = async () => {
    const res = await fetch("/api/shop/owner-pin/clear", { method: "POST" });
    const j = await res.json().catch(() => ({} as { error?: string }));
    if (!res.ok) {
      toast.error(j?.error || "Failed to lock owner settings");
      return;
    }
    setPinExpiresAt(undefined);
    toast.success("Owner settings locked.");
  };


  if (loading) {
    return (
      <div className="p-6 text-muted-foreground">Loading shop settings…</div>
    );
  }

  const billingPill = (() => {
    const base =
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold";

    if (billingDisplayStatus === "linkage_needed") {
      return (
        <span className={`${base} border-amber-500/30 bg-amber-950/20 text-amber-100`}>
          Linkage needed
        </span>
      );
    }

    if (billingDisplayStatus === "subscription_found_not_linked") {
      return (
        <span className={`${base} border-amber-500/30 bg-amber-950/20 text-amber-100`}>
          Subscription found, link required
        </span>
      );
    }

    if (billingDisplayStatus === "ambiguous_customer_subscriptions") {
      return (
        <span className={`${base} border-amber-500/30 bg-amber-950/20 text-amber-100`}>
          Ambiguous subscriptions
        </span>
      );
    }

    if (billingDisplayStatus === "no_subscription_found") {
      return (
        <span className={`${base} border-amber-500/30 bg-amber-950/20 text-amber-100`}>
          No subscription found
        </span>
      );
    }

    if (billingDisplayStatus === "metadata_mismatch") {
      return (
        <span className={`${base} border-emerald-500/30 bg-emerald-950/20 text-emerald-100`}>
          Reconciled from customer
        </span>
      );
    }

    if (billingDisplayStatus === "sync_needed") {
      return (
        <span className={`${base} border-amber-500/30 bg-amber-950/20 text-amber-100`}>
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
        <span className={`${base} border-white/10 bg-black/40 text-neutral-200`}>
          <span className="text-[color:var(--accent-copper-light)]">Trial</span>
          <span className="text-neutral-300">{label}</span>
        </span>
      );
    }

    if (subStatus === "active") {
      return (
        <span className={`${base} border-emerald-500/20 bg-emerald-950/20 text-emerald-100`}>
          Active
        </span>
      );
    }

    if (subStatus === "past_due" || subStatus === "unpaid" || subStatus === "incomplete") {
      const due =
        typeof periodDaysLeft === "number"
          ? periodDaysLeft <= 0
            ? "Due now"
            : `Due in ${periodDaysLeft} days`
          : "Action needed";
      return (
        <span className={`${base} border-red-500/25 bg-red-950/25 text-red-100`}>
          Billing issue • {due}
        </span>
      );
    }

    if (subStatus === "canceled") {
      return (
        <span className={`${base} border-white/10 bg-black/40 text-neutral-200`}>
          Canceled
        </span>
      );
    }

    return (
      <span className={`${base} border-white/10 bg-black/40 text-neutral-200`}>
        Status: {String(billingDisplayStatus).replaceAll("_", " ").toUpperCase()}
      </span>
    );
  })();

  const seatLimitLabel = seatsLimit == null ? "Unlimited" : `${seatsUsed}/${seatsLimit}`;

    return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-5 text-foreground lg:p-6">
      <OwnerSettingsHeader
        isUnlocked={isUnlocked}
        pinExpiresAt={pinExpiresAt}
        onUnlock={() => setPinModalOpen(true)}
        onLock={() => void lockOwnerSettings()}
        onSave={handleSave}
      />

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
            value={String(billingDisplayStatus).replaceAll("_", " ").toUpperCase()}
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
          roleLabel="Owner"
          avatarUrl={ownerAvatarUrl}
          onAvatarChange={setOwnerAvatarUrl}
          title="Owner identity"
          subtitle="Shown in owner/admin identity surfaces, chat, and collaborative workflow views."
        />
      ) : null}


      <div className="sticky top-2 z-10 rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <a href="#shop-info" className={navChipClass}>General</a>
          <a href="#operations-defaults" className={navChipClass}>Defaults</a>
          <a href="#workflow-automation" className={navChipClass}>Workflow</a>
          <a href="#hours-settings" className={navChipClass}>Hours</a>
          <a href="#timeoff-settings" className={navChipClass}>Time off</a>
          <a href="#billing-stripe" className={navChipClass}>Billing</a>
          <a href="/dashboard/owner/branding" className={navChipClass}>Brand Studio</a>
          <a href="#quickbooks-integration" className={navChipClass}>QuickBooks</a>
          <a href="#email-activity" className={navChipClass}>Activity</a>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_0.95fr] lg:items-start">
        <div className="space-y-5">
          <OwnerSettingsSectionIntro
            title="Primary configuration"
            description="Core identity and experience controls for your operational cockpit."
          />
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
            logoUrl={logoUrl}
            provinceLabel={provinceLabel}
            postalLabel={postalLabel}
            selectClass={selectClass}
            labelClass={labelClass}
            onCountryChange={setCountry}
            onTimezoneChange={setTimezone}
            onShopNameChange={setShopName}
            onAddressChange={setAddress}
            onCityChange={setCity}
            onProvinceChange={setProvince}
            onPostalCodeChange={setPostalCode}
            onPhoneChange={setPhone}
            onEmailChange={setEmail}
            onLogoUrlChange={setLogoUrl}
            onLogoUpload={handleLogoUpload}
            onGenerateLogo={handleGenerateLogo}
          />
          <OwnerSettingsOperationsSection
            isUnlocked={isUnlocked}
            currency={currency}
            taxLabel={taxLabel}
            laborRate={laborRate}
            suppliesPercent={suppliesPercent}
            diagnosticFee={diagnosticFee}
            taxRate={taxRate}
            pricingValidDays={pricingValidDays}
            pricingValidDaysLoading={pricingValidDaysLoading}
            pricingValidDaysSaving={pricingValidDaysSaving}
            useAi={useAi}
            requireCauseCorrection={requireCauseCorrection}
            requireAuthorization={requireAuthorization}
            autoGeneratePdf={autoGeneratePdf}
            autoSendQuoteEmail={autoSendQuoteEmail}
            appearanceMode={appearanceMode}
            appearanceSaving={appearanceSaving}
            onLaborRateChange={setLaborRate}
            onSuppliesPercentChange={setSuppliesPercent}
            onDiagnosticFeeChange={setDiagnosticFee}
            onTaxRateChange={setTaxRate}
            onPricingValidDaysChange={setPricingValidDays}
            onSavePricingValidDays={savePricingValidDays}
            onUseAiChange={setUseAi}
            onRequireCauseCorrectionChange={setRequireCauseCorrection}
            onRequireAuthorizationChange={setRequireAuthorization}
            onAutoGeneratePdfChange={setAutoGeneratePdf}
            onAutoSendQuoteEmailChange={setAutoSendQuoteEmail}
            onAppearanceModeChange={(value) => void saveAppearanceMode(value)}
          />
          <BrandStudioSummaryCard />

          <OwnerSettingsSectionIntro
            title="Secondary configuration"
            description="Operational defaults, communication, and integrations."
          />

          <OwnerSettingsPanel id="quickbooks-integration" tone="secondary" title="Accounting integration">
            <QuickBooksConnectCard />
          </OwnerSettingsPanel>

          <OwnerSettingsPanel
            id="communication-branding"
            tone="secondary"
            title="Communication"
            description="Invoice defaults and completion messaging."
          >
            <Input
              value={invoiceTerms}
              onChange={(e) => setInvoiceTerms(e.target.value)}
              placeholder="Invoice terms"
              disabled={!isUnlocked}
            />
            <Input
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              placeholder="Invoice footer note"
              disabled={!isUnlocked}
            />
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={emailOnComplete}
                onChange={(e) => setEmailOnComplete(e.target.checked)}
                disabled={!isUnlocked}
              />
              Email customer when job is complete
            </label>
          </OwnerSettingsPanel>

          <OwnerSettingsSectionIntro
            title="Passive controls"
            description="Scheduling and calendar constraints that support shop operations."
          />

          <OwnerSettingsSchedulingSection
            isUnlocked={isUnlocked}
            hours={hours}
            timeOff={timeOff}
            newOffStart={newOffStart}
            newOffEnd={newOffEnd}
            newOffReason={newOffReason}
            onHoursChange={setHours}
            onNewOffStartChange={setNewOffStart}
            onNewOffEndChange={setNewOffEnd}
            onNewOffReasonChange={setNewOffReason}
            onSaveHours={saveHours}
            onAddTimeOff={addTimeOff}
            onDeleteTimeOff={deleteTimeOff}
          />
        </div>

        <OwnerSettingsSidebar
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
          shopName={shopName}
          address={address}
          city={city}
          province={province}
          postalCode={postalCode}
          phone={phone}
          email={email}
          logoUrl={logoUrl}
          invoiceTerms={invoiceTerms}
          invoiceFooter={invoiceFooter}
          emailLogs={emailLogs}
          emailLogsLoading={emailLogsLoading}
          onOpenStripeConnect={openStripeConnect}
          onStartSubscriptionCheckout={manageSubscription}
          onOpenStripePortal={openStripePortal}
          onRequestCancelSubscription={() => setCancelDialogOpen(true)}
          onCreateOrganization={() => router.push("/dashboard/owner/organization/create")}
          onSwitchLocation={(id) => void switchLocation(id)}
          onRefreshEmailLogs={() => void fetchEmailLogs()}
          planLabel={planLabel}
          parseStripeStatus={parseStripeSubscriptionStatus}
          formatDate={formatDate}
          formatLocationLine={formatLocationLine}
          locationName={locationName}
        />
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="border-white/15 bg-neutral-950/95 text-neutral-100">
          <DialogHeader>
            <DialogTitle>Cancel subscription</DialogTitle>
            <DialogDescription className="text-neutral-300">
              You are currently on the {planLabel(plan)} plan.
              {" "}Cancellation is scheduled for the end of your current billing period by default.
              {" "}Your access and seats remain active until that date.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-neutral-300">
            After the period ends, paid subscription features stop renewing for this location
            until you subscribe again.
            {periodEndIso ? ` Current period end: ${formatDate(periodEndIso)}.` : ""}
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
              className="bg-red-600 text-white hover:bg-red-500"
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
