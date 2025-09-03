// features/shops/components/ShopPublicProfileSection.tsx
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
 * Form model aligned to current DB columns.
 * `gallery_csv` is UI-only and maps to `images` (string[] | null).
 */
type Form = {
  name: ShopsRow["name"];
  street: ShopsRow["street"];
  city: ShopsRow["city"];
  province: ShopsRow["province"];
  postal_code: ShopsRow["postal_code"];
  phone_number: ShopsRow["phone_number"];
  email: ShopsRow["email"];
  logo_url: ShopsRow["logo_url"];
  gallery_csv: string; // UI helper for images[]
  geo_lat: ShopsRow["geo_lat"];
  geo_lng: ShopsRow["geo_lng"];
};

const EMPTY_FORM: Form = {
  name: "",
  street: null,
  city: null,
  province: null,
  postal_code: null,
  phone_number: null,
  email: null,
  logo_url: null,
  gallery_csv: "",
  geo_lat: null,
  geo_lng: null,
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
            "street",
            "city",
            "province",
            "postal_code",
            "phone_number",
            "email",
            "logo_url",
            "images",   // string[] | null
            "geo_lat",
            "geo_lng",
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
        Array.isArray(data?.images) && data!.images.length > 0
          ? data!.images.join(", ")
          : "";

      const next: Form = {
        name: data?.name ?? "",
        street: data?.street ?? null,
        city: data?.city ?? null,
        province: data?.province ?? null,
        postal_code: data?.postal_code ?? null,
        phone_number: data?.phone_number ?? null,
        email: data?.email ?? null,
        logo_url: data?.logo_url ?? null,
        gallery_csv,
        geo_lat: data?.geo_lat ?? null,
        geo_lng: data?.geo_lng ?? null,
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

    // CSV -> string[] | null
    const images: string[] | null =
      form.gallery_csv.trim()
        ? form.gallery_csv.split(",").map((s) => s.trim()).filter(Boolean)
        : null;

    const update: ShopsUpdate = {
      name: form.name,
      street: form.street,
      city: form.city,
      province: form.province,
      postal_code: form.postal_code,
      phone_number: form.phone_number,
      email: form.email,
      logo_url: form.logo_url,
      images,          // ✅ maps to DB `images`
      geo_lat: form.geo_lat,
      geo_lng: form.geo_lng,
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Basic */}
        <Input
          value={form.name ?? ""}                // ← coerce null -> ""
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Shop name"
          disabled={!isUnlocked}
        />
        <Input
          value={form.phone_number ?? ""}
          onChange={(e) => onChange("phone_number", e.target.value || null)}
          placeholder="Phone"
          disabled={!isUnlocked}
        />
        <Input
          value={form.email ?? ""}
          onChange={(e) => onChange("email", e.target.value || null)}
          placeholder="Public email"
          disabled={!isUnlocked}
        />

        {/* Address */}
        <Input
          value={form.street ?? ""}
          onChange={(e) => onChange("street", e.target.value || null)}
          placeholder="Street"
          disabled={!isUnlocked}
        />
        <Input
          value={form.city ?? ""}
          onChange={(e) => onChange("city", e.target.value || null)}
          placeholder="City"
          disabled={!isUnlocked}
        />
        <Input
          value={form.province ?? ""}
          onChange={(e) => onChange("province", e.target.value || null)}
          placeholder="Province/State"
          disabled={!isUnlocked}
        />
        <Input
          value={form.postal_code ?? ""}
          onChange={(e) => onChange("postal_code", e.target.value || null)}
          placeholder="Postal Code"
          disabled={!isUnlocked}
        />

        {/* Branding */}
        <Input
          value={form.logo_url ?? ""}
          onChange={(e) => onChange("logo_url", e.target.value || null)}
          placeholder="Logo URL"
          disabled={!isUnlocked}
        />

        {/* Gallery (CSV → images[]) */}
        <Input
          value={form.gallery_csv}
          onChange={(e) => onChange("gallery_csv", e.target.value)}
          placeholder="Gallery image URLs (comma-separated)"
          disabled={!isUnlocked}
        />

        {/* Coordinates */}
        <Input
          value={form.geo_lat !== null ? String(form.geo_lat) : ""}
          onChange={(e) => onChange("geo_lat", parseNumberOrNull(e.target.value))}
          placeholder="Latitude"
          disabled={!isUnlocked}
        />
        <Input
          value={form.geo_lng !== null ? String(form.geo_lng) : ""}
          onChange={(e) => onChange("geo_lng", parseNumberOrNull(e.target.value))}
          placeholder="Longitude"
          disabled={!isUnlocked}
        />
      </div>
    </section>
  );
}