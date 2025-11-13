"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

type DB = Database;
type ShopsRow = DB["public"]["Tables"]["shops"]["Row"];

type Props = { slug: string };

type PublicFields = Pick<
  ShopsRow,
  | "name"
  | "phone_number"
  | "email"
  | "address"
  | "city"
  | "province"
  | "postal_code"
  | "images"
  | "geo_lat"
  | "geo_lng"
> & {
  description?: string | null;
  website?: string | null;
};

const emptyPublic: PublicFields = {
  name: "",
  phone_number: null,
  email: null,
  address: null,
  city: null,
  province: null,
  postal_code: null,
  images: null,
  geo_lat: null,
  geo_lng: null,
  description: null,
  website: null,
};

export default function PublicProfileClient({ slug }: Props) {
  const supabase = createClientComponentClient<DB>();
  const [data, setData] = useState<PublicFields>(emptyPublic);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: row, error } = await supabase
        .from("shops")
        .select(
          [
            "name",
            "phone_number",
            "email",
            "address",
            "city",
            "province",
            "postal_code",
            "images",
            "geo_lat",
            "geo_lng",
            // Uncomment if these exist in your DB:
            // "description",
            // "website",
          ].join(","),
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
        phone_number: row.phone_number ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        city: row.city ?? null,
        province: row.province ?? null,
        postal_code: row.postal_code ?? null,
        images: row.images ?? null,
        geo_lat: row.geo_lat ?? null,
        geo_lng: row.geo_lng ?? null,
        // description: row.description ?? null, // if column exists
        // website: row.website ?? null,         // if column exists
      };

      setData(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, supabase]);

  // Defensive: ensure we always have an array
  const images: string[] = Array.isArray(data.images)
    ? (data.images as string[])
    : [];
  const hero = images[0] ?? null;
  const gallery = images.slice(1);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-sm text-neutral-400">
        Loading shop…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-2">
        <h1 className="text-2xl font-blackops text-orange-400">
          Shop not found
        </h1>
        <p className="text-sm text-neutral-400">
          We couldn’t find a shop with slug{" "}
          <span className="font-mono">{slug}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Hero */}
      {hero && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            alt={`${data.name} hero`}
            className="h-64 w-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-3xl font-blackops text-orange-400">
          {data.name}
        </h1>
        {data.description ? (
          <p className="text-sm text-neutral-300">{data.description}</p>
        ) : null}
      </header>

      {/* Contact / Basics */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Contact
          </h2>
          <ul className="space-y-1 text-sm text-neutral-100">
            {data.phone_number ? <li>📞 {data.phone_number}</li> : null}
            {data.email ? <li>✉️ {data.email}</li> : null}
            {data.website ? (
              <li>
                🌐{" "}
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 underline underline-offset-2"
                >
                  {data.website}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 md:col-span-2">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
            Location
          </h2>
          <p className="text-sm text-neutral-100">
            {[data.address, data.city, data.province, data.postal_code]
              .filter(Boolean)
              .join(", ")}
          </p>

          {data.geo_lat !== null && data.geo_lng !== null ? (
            <p className="mt-2 text-sm">
              <a
                className="text-orange-400 underline underline-offset-2"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${data.geo_lat},${data.geo_lng}`,
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
      {gallery.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-50">Gallery</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((url) => (
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
      )}

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