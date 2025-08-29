"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { toast } from "sonner";

/** Type shorthands */
type DB = Database;
type ShopsRow = DB["public"]["Tables"]["shops"]["Row"];
type ShopsUpdate = DB["public"]["Tables"]["shops"]["Update"];

type Props = {
  shopId: string;
  isUnlocked: boolean;
};

/**
 * Form model:
 * - keep a CSV string for gallery (easy to edit)
 * - everything else mirrors the DB nullable shapes
 */
type Form = {
  name: ShopsRow["name"];
  address: ShopsRow["address"];
  city: ShopsRow["city"];
  province: ShopsRow["province"];
  postal_code: ShopsRow["postal_code"];
  phone_number: ShopsRow["phone_number"];
  email: ShopsRow["email"];
  description: ShopsRow["description"];
  website: ShopsRow["website"];
  logo_url: ShopsRow["logo_url"];
  hero_image_url: ShopsRow["hero_image_url"];
  gallery_csv: string;                // <- CSV the user edits
  latitude: ShopsRow["latitude"];
  longitude: ShopsRow["longitude"];
};

const EMPTY_FORM: Form = {
  name: "",
  address: null,
  city: null,
  province: null,
  postal_code: null,
  phone_number: null,
  email: null,
  description: null,
  website: null,
  logo_url: null,
  hero_image_url: null,
  gallery_csv: "",
  latitude: null,
  longitude: null,
};

export default function ShopPublicProfileSection({ shopId, isUnlocked }: Props) {
  const supabase = createClientComponentClient<DB>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);

  /** Load current values */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("shops")
        .select(
          [
            "name",
            "address",
            "city",
            "province",
            "postal_code",
            "phone_number",
            "email",
            "description",
            "website",
            "logo_url",
            "hero_image_url",
            "gallery_urls", // string[] | null in DB
            "latitude",
            "longitude",
          ].join(","),
        )
        .eq("id", shopId)
        .maybeSingle<ShopsRow>();

      if (cancelled) return;

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const gallery_csv =
        Array.isArray(data?.gallery_urls) && data!.gallery_urls.length > 0
          ? data!.gallery_urls.join(", ")
          : "";

      const next: Form = {
        name: data?.name ?? "",
        address: data?.address ?? null,
        city: data?.city ?? null,
        province: data?.province ?? null,
        postal_code: data?.postal_code ?? null,
        phone_number: data?.phone_number ?? null,
        email: data?.email ?? null,
        description: data?.description ?? null,
        website: data?.website ?? null,
        logo_url: data?.logo_url ?? null,
        hero_image_url: data?.hero_image_url ?? null,
        gallery_csv,
        latitude: data?.latitude ?? null,
        longitude: data?.longitude ?? null,
      };

      setForm(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, supabase]);

  /** Helpers */
  const onChange = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const parseNumberOrNull = (value: string): number | null => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  };

  /** Save */
  const onSave = async (): Promise<void> => {
    if (!isUnlocked) {
      toast.warning("Unlock settings with your Owner PIN first.");
      return;
    }
    setSaving(true);

    // Convert CSV -> string[] | null for DB
    const galleryArray: string[] | null =
      form.gallery_csv.trim().length > 0
        ? form.gallery_csv
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : null;

    const update: ShopsUpdate = {
        name: form.name,
        address: form.address,
        city: form.city,
        province: form.province,
        postal_code: form.postal_code,
        phone_number: form.phone_number,
        email: form.email,
        description: form.description,
        website: form.website,
        logo_url: form.logo_url,
        hero_image_url: form.hero_image_url,
        gallery_urls: galleryArray, // ✅ matches DB type string[] | null
        latitude: form.latitude,
        longitude: form.longitude,
        role: null,
        default_labor_rate: null,
        default_shop_supplies_percent: null,
        default_diagnostic_fee: null,
        default_tax_rate: null,
        require_cause_correction: null,
        require_job_authorization: null,
        enable_ai: null,
        invoice_terms: null,
        invoice_footer: null,
        auto_email_quotes: null,
        auto_pdf_quotes: null,
        timezone: null,
        accepts_online_booking: null,
        owner_pin_hash: null
    };

    const { error } = await supabase.from("shops").update(update).eq("id", shopId);
    setSaving(false);

    if (error) toast.error(error.message);
    else toast.success("Public profile saved.");
  };

  if (loading) {
    return <div className="p-4 text-sm text-neutral-400">Loading public profile…</div>;
  }

  /** UI */
  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Public Profile</h2>
        <Button onClick={onSave} disabled={!isUnlocked || saving}>
          {saving ? "Saving…" : isUnlocked ? "Save" : "Unlock to Save"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input value={form.name} onChange={(e) => onChange("name", e.target.value)} placeholder="Shop name" disabled={!isUnlocked} />
        <Input value={form.website ?? ""} onChange={(e) => onChange("website", e.target.value || null)} placeholder="Website (https://…)" disabled={!isUnlocked} />

        <Input value={form.phone_number ?? ""} onChange={(e) => onChange("phone_number", e.target.value || null)} placeholder="Phone" disabled={!isUnlocked} />
        <Input value={form.email ?? ""} onChange={(e) => onChange("email", e.target.value || null)} placeholder="Public email" disabled={!isUnlocked} />

        <Input value={form.address ?? ""} onChange={(e) => onChange("address", e.target.value || null)} placeholder="Street address" disabled={!isUnlocked} />
        <Input value={form.city ?? ""} onChange={(e) => onChange("city", e.target.value || null)} placeholder="City" disabled={!isUnlocked} />

        <Input value={form.province ?? ""} onChange={(e) => onChange("province", e.target.value || null)} placeholder="Province/State" disabled={!isUnlocked} />
        <Input value={form.postal_code ?? ""} onChange={(e) => onChange("postal_code", e.target.value || null)} placeholder="Postal Code" disabled={!isUnlocked} />

        <Input value={form.logo_url ?? ""} onChange={(e) => onChange("logo_url", e.target.value || null)} placeholder="Logo URL" disabled={!isUnlocked} />
        <Input value={form.hero_image_url ?? ""} onChange={(e) => onChange("hero_image_url", e.target.value || null)} placeholder="Hero image URL" disabled={!isUnlocked} />

        {/* CSV editor for gallery (UI) */}
        <Input
          value={form.gallery_csv}
          onChange={(e) => onChange("gallery_csv", e.target.value)}
          placeholder="Gallery image URLs (comma-separated)"
          disabled={!isUnlocked}
        />

        <Input
          value={form.latitude !== null ? String(form.latitude) : ""}
          onChange={(e) => onChange("latitude", parseNumberOrNull(e.target.value))}
          placeholder="Latitude"
          disabled={!isUnlocked}
        />
        <Input
          value={form.longitude !== null ? String(form.longitude) : ""}
          onChange={(e) => onChange("longitude", parseNumberOrNull(e.target.value))}
          placeholder="Longitude"
          disabled={!isUnlocked}
        />
      </div>

      <textarea
        className="w-full rounded border border-neutral-800 bg-neutral-900 p-2 text-sm"
        rows={4}
        placeholder="Public description"
        value={form.description ?? ""}
        onChange={(e) => onChange("description", e.target.value || null)}
        disabled={!isUnlocked}
      />
    </section>
  );
}