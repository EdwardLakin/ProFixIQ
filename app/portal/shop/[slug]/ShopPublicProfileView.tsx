// app/portal/shop/[slug]/ShopPublicProfileView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

type DB = Database;
type ShopsRow = DB["public"]["Tables"]["shops"]["Row"];

type Props = { slug: string };

/**
 * Public fields projected from `shops`.
 * NOTE: We widen `gallery_urls` to `string | string[] | null` so this keeps working
 * whether your DB column is a CSV string or a string[].
 */
type PublicFields = Omit<
  Pick<
    ShopsRow,
    | "name"
    | "description"
    | "website"
    | "phone_number"
    | "email"
    | "address"
    | "city"
    | "province"
    | "postal_code"
    | "hero_image_url"
    | "gallery_urls"
    | "latitude"
    | "longitude"
  >,
  "gallery_urls"
> & {
  gallery_urls: string | string[] | null;
};

const emptyPublic: PublicFields = {
  name: "",
  description: null,
  website: null,
  phone_number: null,
  email: null,
  address: null,
  city: null,
  province: null,
  postal_code: null,
  hero_image_url: null,
  gallery_urls: null,
  latitude: null,
  longitude: null,
};

export default function PublicProfileClient({ slug }: Props) {
  const supabase = createClientComponentClient<DB>();
  const [data, setData] = useState<PublicFields>(emptyPublic);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: row, error } = await supabase
        .from("shops")
        .select(
          [
            "name",
            "description",
            "website",
            "phone_number",
            "email",
            "address",
            "city",
            "province",
            "postal_code",
            "hero_image_url",
            "gallery_urls",
            "latitude",
            "longitude",
          ].join(",")
        )
        .eq("slug", slug)
        .maybeSingle<ShopsRow>();

      if (cancelled) return;

      if (error || !row) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const next: PublicFields = {
        name: row.name ?? "",
        description: row.description ?? null,
        website: row.website ?? null,
        phone_number: row.phone_number ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        city: row.city ?? null,
        province: row.province ?? null,
        postal_code: row.postal_code ?? null,
        hero_image_url: row.hero_image_url ?? null,
        // Accept either CSV string or string[] from the DB type
        gallery_urls: (row as PublicFields).gallery_urls ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
      };

      setData(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, supabase]);

  /** Normalize gallery_urls into a clean string[] (no implicit any) */
  const gallery: string[] = useMemo(() => {
    const g = data.gallery_urls;
    if (!g) return [];
    if (Array.isArray(g)) {
      return g
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
    }
    return g
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
  }, [data.gallery_urls]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-sm text-neutral-400">
        Loading shop…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Shop not found</h1>
        <p className="text-neutral-400">
          We couldn’t find a shop with slug <span className="font-mono">{slug}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Hero */}
      {data.hero_image_url ? (
        <div className="overflow-hidden rounded-xl border border-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.hero_image_url}
            alt={`${data.name} hero`}
            className="h-64 w-full object-cover"
          />
        </div>
      ) : null}

      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{data.name}</h1>
        {data.description ? (
          <p className="text-neutral-300">{data.description}</p>
        ) : null}
      </header>

      {/* Contact / Basics */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">Contact</h2>
          <ul className="space-y-1 text-sm">
            {data.phone_number ? <li>📞 {data.phone_number}</li> : null}
            {data.email ? <li>✉️ {data.email}</li> : null}
            {data.website ? (
              <li>
                🌐{" "}
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 underline"
                >
                  {data.website}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 md:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">Location</h2>
          <p className="text-sm">
            {[data.address, data.city, data.province, data.postal_code]
              .filter(Boolean)
              .join(", ")}
          </p>

          {/* Map link if coords exist */}
          {data.latitude !== null && data.longitude !== null ? (
            <p className="mt-2 text-sm">
              <a
                className="text-orange-400 underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${data.latitude},${data.longitude}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Google Maps
              </a>
            </p>
          ) : null}
        </div>
      </section>

      {/* Gallery */}
      {gallery.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Gallery</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((url: string) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt="Shop photo"
                className="h-40 w-full rounded-lg border border-neutral-800 object-cover"
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Primary CTA to book */}
      <div className="pt-2">
        <Link
          href={`/portal/booking?shop=${encodeURIComponent(slug)}`}
          className="inline-flex items-center rounded-lg border border-orange-600 px-4 py-2 text-sm font-semibold text-orange-400 transition hover:bg-orange-600 hover:text-black"
        >
          Book an appointment
        </Link>
      </div>
    </div>
  );
}