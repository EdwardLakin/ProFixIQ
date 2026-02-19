// app/portal/shop/[slug]/ShopPublicProfileView.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ReviewsList from "@shared/components/reviews/ReviewsList";
import ReviewForm from "@shared/components/reviews/ReviewForm";

type DB = Database;
type ShopsRow = DB["public"]["Tables"]["shops"]["Row"];

type Props = { slug: string };

type PublicFields = Pick<
  ShopsRow,
  | "id"
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
  id: "",
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

const COPPER = "var(--pfq-copper)";

function SignalDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        background: "rgba(197,122,74,0.95)",
        boxShadow: "0 0 18px rgba(197,122,74,0.55)",
      }}
      aria-hidden
    />
  );
}

export default function PublicProfileClient({ slug }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [data, setData] = useState<PublicFields>(emptyPublic);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);

      const { data: row, error } = await supabase
        .from("shops")
        .select(
          [
            "id",
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

      setData({
        id: row.id,
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
        // description: (row as any).description ?? null,
        // website: (row as any).website ?? null,
      });

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, supabase]);

  const images: string[] = Array.isArray(data.images)
    ? (data.images as string[])
    : [];
  const hero = images[0] ?? null;
  const gallery = images.slice(1);

  const Card =
    "rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card sm:p-6";

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
        <h1 className="text-2xl font-blackops" style={{ color: COPPER }}>
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
      {hero ? (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/25 backdrop-blur-md shadow-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            alt={`${data.name} hero`}
            className="h-64 w-full object-cover"
          />
        </div>
      ) : null}

      {/* Header */}
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
          <SignalDot />
          Public shop profile
        </div>

        <h1 className="text-3xl font-blackops" style={{ color: COPPER }}>
          {data.name}
        </h1>

        {data.description ? (
          <p className="text-sm text-neutral-300">{data.description}</p>
        ) : null}
      </header>

      {/* Contact / Location */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={Card}>
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
                  className="underline underline-offset-2"
                  style={{ color: COPPER }}
                >
                  {data.website}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className={Card + " md:col-span-2"}>
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
                className="underline underline-offset-2"
                style={{ color: COPPER }}
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
      {gallery.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-50">Gallery</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt="Shop photo"
                className="h-40 w-full rounded-2xl border border-white/10 object-cover bg-black/25"
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Primary CTA to book */}
      <div className="pt-2">
        <Link
          href={`/portal/booking?shop=${encodeURIComponent(slug)}`}
          className="inline-flex items-center rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-100 backdrop-blur transition hover:bg-white/5"
          style={{
            boxShadow: "0 0 26px rgba(197,122,74,0.18)",
          }}
        >
          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COPPER }} />
          Book an appointment
        </Link>
      </div>

      {/* Reviews */}
      {data.id ? (
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SignalDot />
              <h2 className="text-lg font-semibold text-neutral-50">
                Customer reviews
              </h2>
            </div>
            <span className="text-xs text-neutral-500">
              Evidence-first feedback
            </span>
          </div>

          <div className={Card}>
            <ReviewsList shopId={data.id} />
          </div>

          <div className={Card}>
            <ReviewForm shopId={data.id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}