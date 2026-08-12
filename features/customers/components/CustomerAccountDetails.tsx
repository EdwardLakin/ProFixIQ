"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, MapPin, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@/features/shared/types/types/supabase";
import { CustomerPricingPanel } from "@/features/customers/components/CustomerPricingPanel";

type Contact = Database["public"]["Tables"]["customer_contacts"]["Row"];
type Location = Database["public"]["Tables"]["customer_locations"]["Row"];

type Props = {
  customerId: string;
  shopId: string;
};

const inputClass =
  "w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]";

export function CustomerAccountDetails({ customerId, shopId }: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
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
    const [contactsResult, locationsResult] = await Promise.all([
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
    ]);

    if (contactsResult.error || locationsResult.error) {
      toast.error("Customer contacts and locations could not be loaded.");
    } else {
      setContacts(contactsResult.data ?? []);
      setLocations(locationsResult.data ?? []);
    }
    setLoading(false);
  }, [customerId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-4">
      <CustomerPricingPanel customerId={customerId} />
      <section className="rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
            Account details
          </div>
          <h2 className="mt-1 text-lg font-semibold">Contacts & locations</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Keep service, approval, billing, and branch details on one customer
            file.
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
                No additional contacts yet. The existing customer contact stays
                available above.
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
                No additional locations yet. The existing customer address stays
                available above.
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
                    {[item.address, item.city, item.province, item.postal_code]
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
    </div>
  );
}
