"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Building2,
  CircleDollarSign,
  FileClock,
  Link2,
  Loader2,
  MapPin,
  Plus,
  ReceiptText,
  ShieldAlert,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@/features/shared/types/types/supabase";
import { CustomerPricingPanel } from "@/features/customers/components/CustomerPricingPanel";

type Contact = Database["public"]["Tables"]["customer_contacts"]["Row"];
type Location = Database["public"]["Tables"]["customer_locations"]["Row"];
type MergeCandidate = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  "id" | "name" | "business_name" | "email" | "phone"
>;

type CommercialSettings = {
  primary_billing_contact_id: string | null;
  primary_approval_contact_id: string | null;
  po_required: boolean;
  payment_terms: string;
  payment_terms_days: number;
  tax_exempt: boolean;
  tax_exemption_reference: string | null;
  account_status: "good_standing" | "credit_hold" | "account_hold";
  account_hold_reason: string | null;
  billing_notes: string | null;
  customer_reference: string | null;
};

type AccountCenterSummary = {
  ok: boolean;
  customer: {
    id: string;
    active: boolean;
    account_type: string;
    merged_into_customer_id: string | null;
  };
  settings: CommercialSettings;
  fleet: {
    id: string;
    name: string;
    active: boolean;
    link_status: "connected" | "not_connected" | "inactive";
  } | null;
  fleet_invite: {
    email: string;
    status: "pending" | "accepted" | "expired" | "revoked";
  } | null;
  counts: {
    contacts: number;
    locations: number;
    vehicles: number;
    work_orders: number;
    invoices: number;
    merged_sources: number;
  };
  invoice_summary: {
    total_billed: number;
    outstanding: number;
    last_invoice_at: string | null;
  };
  can_manage_commercial: boolean;
  can_merge_or_archive: boolean;
};

type Props = {
  customerId: string;
  shopId: string;
};

const inputClass =
  "w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]";

export function CustomerAccountDetails({ customerId, shopId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [account, setAccount] = useState<AccountCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showCommercialForm, setShowCommercialForm] = useState(false);
  const [showLifecycleForm, setShowLifecycleForm] = useState<
    "archive" | "merge" | null
  >(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [commercial, setCommercial] = useState<CommercialSettings>({
    primary_billing_contact_id: null,
    primary_approval_contact_id: null,
    po_required: false,
    payment_terms: "due_on_receipt",
    payment_terms_days: 0,
    tax_exempt: false,
    tax_exemption_reference: null,
    account_status: "good_standing",
    account_hold_reason: null,
    billing_notes: null,
    customer_reference: null,
  });
  const [contact, setContact] = useState({
    displayName: "",
    email: "",
    phone: "",
    role: "primary",
  });
  const [location, setLocation] = useState({
    name: "",
    locationType: "service",
    address: "",
    city: "",
    province: "",
    postalCode: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [contactsResult, locationsResult, accountResponse] =
      await Promise.all([
        supabase
          .from("customer_contacts")
          .select("*")
          .eq("customer_id", customerId)
          .eq("active", true)
          .order("is_primary", { ascending: false })
          .order("created_at"),
        supabase
          .from("customer_locations")
          .select("*")
          .eq("customer_id", customerId)
          .eq("active", true)
          .order("is_primary", { ascending: false })
          .order("created_at"),
        fetch(`/api/customers/${customerId}/account`, { cache: "no-store" }),
      ]);

    const accountPayload = (await accountResponse.json().catch(() => null)) as
      | (AccountCenterSummary & { error?: string })
      | null;
    if (
      contactsResult.error ||
      locationsResult.error ||
      !accountResponse.ok ||
      !accountPayload?.ok
    ) {
      toast.error("Customer contacts and locations could not be loaded.");
    } else {
      setContacts(contactsResult.data ?? []);
      setLocations(locationsResult.data ?? []);
      setAccount(accountPayload);
      setCommercial(accountPayload.settings);
    }
    setLoading(false);
  }, [customerId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showLifecycleForm !== "merge" || mergeSearch.trim().length < 2) {
      setMergeCandidates([]);
      return;
    }
    const token = mergeSearch
      .trim()
      .replace(/[%,()]/g, " ")
      .slice(0, 80);
    const timeout = window.setTimeout(() => {
      void supabase
        .from("customers")
        .select("id,name,business_name,email,phone")
        .eq("shop_id", shopId)
        .eq("active", true)
        .neq("id", customerId)
        .or(
          [
            `name.ilike.%${token}%`,
            `business_name.ilike.%${token}%`,
            `email.ilike.%${token}%`,
            `phone.ilike.%${token}%`,
          ].join(","),
        )
        .limit(8)
        .then(({ data }) => setMergeCandidates(data ?? []));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [customerId, mergeSearch, shopId, showLifecycleForm, supabase]);

  async function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("customer_contacts").insert({
      shop_id: shopId,
      customer_id: customerId,
      display_name: contact.displayName.trim() || null,
      email: contact.email.trim().toLowerCase() || null,
      phone: contact.phone.trim() || null,
      role: contact.role,
      is_primary: contacts.length === 0,
      can_approve: contact.role === "approver",
      can_view_billing: contact.role === "billing",
      created_by: auth.user?.id ?? null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setContact({ displayName: "", email: "", phone: "", role: "primary" });
      setShowContactForm(false);
      await load();
      toast.success("Customer contact added.");
    }
    setSaving(false);
  }

  async function addLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("customer_locations").insert({
      shop_id: shopId,
      customer_id: customerId,
      name: location.name.trim(),
      location_type: location.locationType,
      address: location.address.trim() || null,
      city: location.city.trim() || null,
      province: location.province.trim() || null,
      postal_code: location.postalCode.trim() || null,
      is_primary: locations.length === 0,
      created_by: auth.user?.id ?? null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      setLocation({
        name: "",
        locationType: "service",
        address: "",
        city: "",
        province: "",
        postalCode: "",
      });
      setShowLocationForm(false);
      await load();
      toast.success("Customer location added.");
    }
    setSaving(false);
  }

  async function saveCommercialControls(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${customerId}/account`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          action: "update_commercial_controls",
          operationKey: crypto.randomUUID(),
          primaryBillingContactId: commercial.primary_billing_contact_id,
          primaryApprovalContactId: commercial.primary_approval_contact_id,
          poRequired: commercial.po_required,
          paymentTerms: commercial.payment_terms,
          paymentTermsDays: commercial.payment_terms_days,
          taxExempt: commercial.tax_exempt,
          taxExemptionReference: commercial.tax_exemption_reference,
          accountStatus: commercial.account_status,
          accountHoldReason: commercial.account_hold_reason,
          billingNotes: commercial.billing_notes,
          customerReference: commercial.customer_reference,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Commercial controls could not be saved.",
        );
      }
      toast.success("Commercial account controls saved.");
      setShowCommercialForm(false);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Commercial controls could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runLifecycleAction() {
    if (!showLifecycleForm || lifecycleReason.trim().length < 3) return;
    if (showLifecycleForm === "merge" && !mergeTargetId.trim()) return;
    setSaving(true);
    try {
      const operationKey = crypto.randomUUID();
      const response = await fetch(`/api/customers/${customerId}/account`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey,
        },
        body: JSON.stringify({
          action: showLifecycleForm,
          targetCustomerId:
            showLifecycleForm === "merge" ? mergeTargetId.trim() : null,
          reason: lifecycleReason,
          operationKey,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        redirect_customer_id?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Customer account action failed.");
      }
      if (showLifecycleForm === "merge" && payload?.redirect_customer_id) {
        toast.success("Customer records merged without deleting history.");
        router.push(`/customers/${payload.redirect_customer_id}`);
      } else {
        toast.success("Customer account archived. History remains available.");
        router.push("/customers/search");
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Customer account action failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
      }),
    [],
  );

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-[var(--accent-copper-soft)]/45 bg-[radial-gradient(circle_at_top_left,rgba(197,122,74,0.18),transparent_42%),color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <div className="border-b border-[color:var(--desktop-border)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
                Customer Account Center
              </div>
              <h2 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                One account. Every commercial and service relationship.
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                Contacts, locations, assets, work history, invoices, Fleet
                access, and negotiated pricing stay attached to this canonical
                record.
              </p>
            </div>
            {account?.can_manage_commercial ? (
              <button
                type="button"
                onClick={() => setShowCommercialForm((current) => !current)}
                className="rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] hover:brightness-110"
              >
                {showCommercialForm ? "Close controls" : "Commercial controls"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-5">
          {[
            [Wrench, "Assets", account?.counts.vehicles ?? 0],
            [FileClock, "Work orders", account?.counts.work_orders ?? 0],
            [ReceiptText, "Invoices", account?.counts.invoices ?? 0],
            [
              CircleDollarSign,
              "Outstanding",
              money.format(account?.invoice_summary.outstanding ?? 0),
            ],
            [Link2, "Merged history", account?.counts.merged_sources ?? 0],
          ].map(([Icon, label, value]) => {
            const StatIcon = Icon as typeof Wrench;
            return (
              <div
                key={String(label)}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3"
              >
                <StatIcon className="h-4 w-4 text-[var(--accent-copper)]" />
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                  {String(label)}
                </div>
                <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                  {String(value)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 border-t border-[color:var(--desktop-border)] p-4 sm:p-5 xl:grid-cols-[1fr_0.9fr]">
          <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                  Commercial posture
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-[color:var(--desktop-border)] px-2.5 py-1">
                    {commercial.po_required ? "PO required" : "PO optional"}
                  </span>
                  <span className="rounded-full border border-[color:var(--desktop-border)] px-2.5 py-1">
                    {commercial.payment_terms.replaceAll("_", " ")}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 ${
                      commercial.account_status === "good_standing"
                        ? "border-emerald-500/35 text-emerald-200"
                        : "border-amber-500/40 text-amber-200"
                    }`}
                  >
                    {commercial.account_status.replaceAll("_", " ")}
                  </span>
                  {commercial.tax_exempt ? (
                    <span className="rounded-full border border-sky-500/35 px-2.5 py-1 text-sky-200">
                      Tax exempt
                    </span>
                  ) : null}
                </div>
              </div>
              {commercial.account_status !== "good_standing" ? (
                <ShieldAlert className="h-5 w-5 text-amber-300" />
              ) : null}
            </div>
            {commercial.customer_reference || commercial.billing_notes ? (
              <div className="mt-3 border-t border-[color:var(--desktop-border)] pt-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                {commercial.customer_reference ? (
                  <div>Reference: {commercial.customer_reference}</div>
                ) : null}
                {commercial.billing_notes ? (
                  <div>Billing: {commercial.billing_notes}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Fleet workspace
            </div>
            {account?.fleet ? (
              <div className="mt-2">
                <div className="font-semibold text-[color:var(--theme-text-primary)]">
                  {account.fleet.name}
                </div>
                <div className="mt-1 text-xs capitalize text-emerald-200">
                  {account.fleet.link_status.replaceAll("_", " ")}
                  {account.fleet_invite
                    ? ` · invite ${account.fleet_invite.status}`
                    : ""}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                Ordinary customer account. Fleet is optional and is never
                created or billed unless the shop explicitly connects it.
              </p>
            )}
          </div>
        </div>

        {showCommercialForm ? (
          <form
            onSubmit={saveCommercialControls}
            className="border-t border-[color:var(--desktop-border)] bg-black/10 p-4 sm:p-5"
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Billing contact
                <select
                  value={commercial.primary_billing_contact_id ?? ""}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      primary_billing_contact_id: event.target.value || null,
                    }))
                  }
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Account primary</option>
                  {contacts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name || item.email || "Contact"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Approval contact
                <select
                  value={commercial.primary_approval_contact_id ?? ""}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      primary_approval_contact_id: event.target.value || null,
                    }))
                  }
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Account primary</option>
                  {contacts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name || item.email || "Contact"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Payment terms
                <select
                  value={commercial.payment_terms}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      payment_terms: event.target.value,
                      payment_terms_days:
                        event.target.value === "custom"
                          ? draft.payment_terms_days
                          : Number(event.target.value.match(/\d+/)?.[0] ?? 0),
                    }))
                  }
                  className={`${inputClass} mt-1`}
                >
                  <option value="due_on_receipt">Due on receipt</option>
                  <option value="net_7">Net 7</option>
                  <option value="net_15">Net 15</option>
                  <option value="net_30">Net 30</option>
                  <option value="net_45">Net 45</option>
                  <option value="net_60">Net 60</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {commercial.payment_terms === "custom" ? (
                <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  Custom terms (days)
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={commercial.payment_terms_days}
                    onChange={(event) =>
                      setCommercial((draft) => ({
                        ...draft,
                        payment_terms_days: Number(event.target.value),
                      }))
                    }
                    className={`${inputClass} mt-1`}
                  />
                </label>
              ) : null}
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Account standing
                <select
                  value={commercial.account_status}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      account_status: event.target
                        .value as CommercialSettings["account_status"],
                    }))
                  }
                  className={`${inputClass} mt-1`}
                >
                  <option value="good_standing">Good standing</option>
                  <option value="credit_hold">Credit hold</option>
                  <option value="account_hold">Account hold</option>
                </select>
              </label>
              {commercial.account_status !== "good_standing" ? (
                <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  Hold reason
                  <input
                    required
                    value={commercial.account_hold_reason ?? ""}
                    onChange={(event) =>
                      setCommercial((draft) => ({
                        ...draft,
                        account_hold_reason: event.target.value,
                      }))
                    }
                    className={`${inputClass} mt-1`}
                  />
                </label>
              ) : null}
              <label className="flex items-center gap-2 rounded-xl border border-[color:var(--desktop-border)] p-3 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={commercial.po_required}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      po_required: event.target.checked,
                    }))
                  }
                />
                Purchase order required
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[color:var(--desktop-border)] p-3 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={commercial.tax_exempt}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      tax_exempt: event.target.checked,
                    }))
                  }
                />
                Tax exempt
              </label>
              {commercial.tax_exempt ? (
                <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  Exemption reference
                  <input
                    required
                    value={commercial.tax_exemption_reference ?? ""}
                    onChange={(event) =>
                      setCommercial((draft) => ({
                        ...draft,
                        tax_exemption_reference: event.target.value,
                      }))
                    }
                    className={`${inputClass} mt-1`}
                  />
                </label>
              ) : null}
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)] lg:col-span-2">
                Billing notes
                <textarea
                  value={commercial.billing_notes ?? ""}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      billing_notes: event.target.value,
                    }))
                  }
                  rows={2}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Customer-facing reference
                <input
                  value={commercial.customer_reference ?? ""}
                  onChange={(event) =>
                    setCommercial((draft) => ({
                      ...draft,
                      customer_reference: event.target.value,
                    }))
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-4 rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save commercial controls"}
            </button>
          </form>
        ) : null}
      </section>

      <CustomerPricingPanel customerId={customerId} />
      <section className="rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
              Account details
            </div>
            <h2 className="mt-1 text-lg font-semibold">Contacts & locations</h2>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Keep service, approval, billing, and branch details on one
              customer file.
            </p>
          </div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <UserRound className="h-4 w-4 text-[var(--accent-copper)]" />
                Contacts
              </div>
              <button
                type="button"
                onClick={() => setShowContactForm((current) => !current)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-copper)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {showContactForm ? (
              <form onSubmit={addContact} className="mt-3 space-y-2">
                <input
                  required
                  value={contact.displayName}
                  onChange={(event) =>
                    setContact((draft) => ({
                      ...draft,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="Contact name"
                  aria-label="Contact name"
                  className={inputClass}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(event) =>
                      setContact((draft) => ({
                        ...draft,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Email"
                    aria-label="Contact email"
                    className={inputClass}
                  />
                  <input
                    value={contact.phone}
                    onChange={(event) =>
                      setContact((draft) => ({
                        ...draft,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Phone"
                    aria-label="Contact phone"
                    className={inputClass}
                  />
                </div>
                <select
                  value={contact.role}
                  onChange={(event) =>
                    setContact((draft) => ({
                      ...draft,
                      role: event.target.value,
                    }))
                  }
                  aria-label="Contact role"
                  className={inputClass}
                >
                  <option value="primary">Primary</option>
                  <option value="service">Service</option>
                  <option value="billing">Billing</option>
                  <option value="approver">Approver</option>
                  <option value="other">Other</option>
                </select>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60"
                >
                  Save contact
                </button>
              </form>
            ) : null}

            <div className="mt-3 space-y-2">
              {contacts.length === 0 ? (
                <p className="text-xs text-[color:var(--theme-text-muted)]">
                  No additional contacts yet. The existing customer contact
                  stays available above.
                </p>
              ) : (
                contacts.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-[color:var(--theme-surface-inset)] p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {item.display_name ||
                          [item.first_name, item.last_name]
                            .filter(Boolean)
                            .join(" ") ||
                          "Contact"}
                      </span>
                      <span className="capitalize text-[var(--accent-copper)]">
                        {item.role}
                      </span>
                    </div>
                    <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                      {[item.email, item.phone].filter(Boolean).join(" · ") ||
                        "No contact method"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-[var(--accent-copper)]" />
                Locations
              </div>
              <button
                type="button"
                onClick={() => setShowLocationForm((current) => !current)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-copper)] hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {showLocationForm ? (
              <form onSubmit={addLocation} className="mt-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    required
                    value={location.name}
                    onChange={(event) =>
                      setLocation((draft) => ({
                        ...draft,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Location name"
                    aria-label="Location name"
                    className={inputClass}
                  />
                  <select
                    value={location.locationType}
                    onChange={(event) =>
                      setLocation((draft) => ({
                        ...draft,
                        locationType: event.target.value,
                      }))
                    }
                    aria-label="Location type"
                    className={inputClass}
                  >
                    <option value="service">Service</option>
                    <option value="billing">Billing</option>
                    <option value="branch">Branch</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <input
                  value={location.address}
                  onChange={(event) =>
                    setLocation((draft) => ({
                      ...draft,
                      address: event.target.value,
                    }))
                  }
                  placeholder="Street address"
                  aria-label="Location street address"
                  className={inputClass}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={location.city}
                    onChange={(event) =>
                      setLocation((draft) => ({
                        ...draft,
                        city: event.target.value,
                      }))
                    }
                    placeholder="City"
                    aria-label="Location city"
                    className={inputClass}
                  />
                  <input
                    value={location.province}
                    onChange={(event) =>
                      setLocation((draft) => ({
                        ...draft,
                        province: event.target.value,
                      }))
                    }
                    placeholder="Province"
                    aria-label="Location province"
                    className={inputClass}
                  />
                  <input
                    value={location.postalCode}
                    onChange={(event) =>
                      setLocation((draft) => ({
                        ...draft,
                        postalCode: event.target.value,
                      }))
                    }
                    placeholder="Postal code"
                    aria-label="Location postal code"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60"
                >
                  Save location
                </button>
              </form>
            ) : null}

            <div className="mt-3 space-y-2">
              {locations.length === 0 ? (
                <p className="text-xs text-[color:var(--theme-text-muted)]">
                  No additional locations yet. The existing customer address
                  stays available above.
                </p>
              ) : (
                locations.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-[color:var(--theme-surface-inset)] p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 font-semibold">
                        <MapPin className="h-3.5 w-3.5" /> {item.name}
                      </span>
                      <span className="capitalize text-[var(--accent-copper)]">
                        {item.location_type}
                      </span>
                    </div>
                    <div className="mt-1 text-[color:var(--theme-text-secondary)]">
                      {[
                        item.address,
                        item.city,
                        item.province,
                        item.postal_code,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Address not entered"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {account?.can_merge_or_archive && account.customer.active ? (
        <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Record stewardship
              </div>
              <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                No destructive deletion. Archive preserves history; merge moves
                linked records and keeps a permanent redirect and audit event.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLifecycleForm("merge")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--desktop-border)] px-3 py-2 text-xs font-semibold"
              >
                <Link2 className="h-3.5 w-3.5" /> Merge duplicate
              </button>
              <button
                type="button"
                onClick={() => setShowLifecycleForm("archive")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 px-3 py-2 text-xs font-semibold text-amber-200"
              >
                <Archive className="h-3.5 w-3.5" /> Archive account
              </button>
            </div>
          </div>
          {showLifecycleForm ? (
            <div className="mt-4 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3">
              {showLifecycleForm === "merge" ? (
                <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  Find the canonical customer to keep
                  <input
                    value={mergeSearch}
                    onChange={(event) => {
                      setMergeSearch(event.target.value);
                      setMergeTargetId("");
                    }}
                    placeholder="Search name, business, email, or phone"
                    className={`${inputClass} mt-1`}
                  />
                  {mergeCandidates.length > 0 ? (
                    <span className="mt-2 block space-y-1.5">
                      {mergeCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => {
                            setMergeTargetId(candidate.id);
                            setMergeSearch(
                              candidate.business_name ||
                                candidate.name ||
                                candidate.email ||
                                candidate.phone ||
                                candidate.id,
                            );
                            setMergeCandidates([]);
                          }}
                          className={`block w-full rounded-lg border p-2 text-left text-xs ${
                            mergeTargetId === candidate.id
                              ? "border-[var(--accent-copper)] bg-[var(--accent-copper)]/10"
                              : "border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-inset)]"
                          }`}
                        >
                          <span className="font-semibold text-[color:var(--theme-text-primary)]">
                            {candidate.business_name ||
                              candidate.name ||
                              "Customer"}
                          </span>
                          <span className="ml-2 font-normal text-[color:var(--theme-text-muted)]">
                            {[candidate.email, candidate.phone]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      ))}
                    </span>
                  ) : null}
                </label>
              ) : null}
              <label className="mt-3 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Required reason
                <textarea
                  value={lifecycleReason}
                  onChange={(event) => setLifecycleReason(event.target.value)}
                  rows={2}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void runLifecycleAction()}
                  disabled={
                    saving ||
                    lifecycleReason.trim().length < 3 ||
                    (showLifecycleForm === "merge" && !mergeTargetId.trim())
                  }
                  className="rounded-xl bg-[var(--accent-copper)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-50"
                >
                  Confirm {showLifecycleForm}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLifecycleForm(null)}
                  className="rounded-xl border border-[color:var(--desktop-border)] px-3 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
