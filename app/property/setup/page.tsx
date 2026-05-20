import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import {
  createPropertyAsset,
  createPropertyDemoDataset,
  createPropertyPortfolio,
  createPropertyProperty,
  createPropertyUnit,
  createPropertyVendor,
} from "./actions";

const DEMO_PORTFOLIO_NAME = "Property Maintenance Demo Portfolio";

type SearchParams = Record<string, string | string[] | undefined>;

type SetupPageProps = {
  searchParams?: Promise<SearchParams>;
};

function createPropertySetupClient() {
  return createServerSupabaseRSC();
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getCurrentProfile(supabase: ReturnType<typeof createPropertySetupClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,shop_id")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export default async function PropertySetupPage({
  searchParams,
}: SetupPageProps) {
  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);

  if (!user) {
    redirect("/sign-in");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const status = firstSearchValue(resolvedSearchParams.status);
  const message = firstSearchValue(resolvedSearchParams.message);
  const hasShop = Boolean(profile?.shop_id);
  const shopId = profile?.shop_id ?? null;

  const [portfoliosResult, propertiesResult, unitsResult, assetsResult, vendorsResult] =
    shopId
      ? await Promise.all([
          supabase
            .from("property_portfolios")
            .select("id,name")
            .eq("shop_id", shopId)
            .order("name", { ascending: true })
            .limit(5),
          supabase
            .from("property_properties")
            .select("id,name,city,region")
            .eq("shop_id", shopId)
            .order("name", { ascending: true })
            .limit(5),
          supabase
            .from("property_units")
            .select("id,unit_label,property_id")
            .eq("shop_id", shopId)
            .order("unit_label", { ascending: true })
            .limit(5),
          supabase
            .from("property_assets")
            .select("id,name,asset_type,status,property_id,unit_id")
            .eq("shop_id", shopId)
            .order("name", { ascending: true })
            .limit(5),
          supabase
            .from("property_vendors")
            .select("id,name,trade,status")
            .eq("shop_id", shopId)
            .order("name", { ascending: true })
            .limit(5),
        ])
      : [null, null, null, null, null];

  const propertyNameById = new Map(
    (propertiesResult?.data ?? []).map((property) => [property.id, property.name]),
  );
  const unitLabelById = new Map(
    (unitsResult?.data ?? []).map((unit) => [unit.id, unit.unit_label]),
  );

  const overviewItems = [
    {
      title: "Portfolios",
      count: portfoliosResult?.data?.length ?? 0,
      emptyLabel: "No portfolios yet.",
      rows:
        portfoliosResult?.data?.map((portfolio) => ({
          id: portfolio.id,
          primary: portfolio.name,
          secondary: null as string | null,
        })) ?? [],
    },
    {
      title: "Properties",
      count: propertiesResult?.data?.length ?? 0,
      emptyLabel: "No properties yet.",
      rows:
        propertiesResult?.data?.map((property) => ({
          id: property.id,
          primary: property.name,
          secondary:
            property.city || property.region
              ? [property.city, property.region].filter(Boolean).join(", ")
              : "Location not set",
        })) ?? [],
    },
    {
      title: "Units",
      count: unitsResult?.data?.length ?? 0,
      emptyLabel: "No units yet.",
      rows:
        unitsResult?.data?.map((unit) => ({
          id: unit.id,
          primary: unit.unit_label,
          secondary: `Property: ${propertyNameById.get(unit.property_id) ?? "Unknown property"}`,
        })) ?? [],
    },
    {
      title: "Assets",
      count: assetsResult?.data?.length ?? 0,
      emptyLabel: "No assets yet.",
      rows:
        assetsResult?.data?.map((asset) => ({
          id: asset.id,
          primary: asset.name,
          secondary: [
            asset.asset_type,
            asset.status,
            `Property: ${propertyNameById.get(asset.property_id) ?? "Unknown property"}`,
            asset.unit_id
              ? `Unit: ${unitLabelById.get(asset.unit_id) ?? "Unknown unit"}`
              : "Property-level",
          ]
            .filter(Boolean)
            .join(" • "),
        })) ?? [],
    },
    {
      title: "Vendors",
      count: vendorsResult?.data?.length ?? 0,
      emptyLabel: "No vendors yet.",
      rows:
        vendorsResult?.data?.map((vendor) => ({
          id: vendor.id,
          primary: vendor.name,
          secondary: [vendor.trade, vendor.status].filter(Boolean).join(" • "),
        })) ?? [],
    },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] px-4 py-6 text-white md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Link
          href="/property"
          className="w-fit rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-200 transition hover:border-[color:var(--accent-copper)]/70 hover:text-white"
        >
          ← Back to property dashboard
        </Link>

        <section className="rounded-xl border border-[color:var(--metal-border-soft)]/55 bg-black/15 p-4 md:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Admin records workspace
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-100 md:text-4xl">
            Property Setup
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
            Configure the records that power requests, inspections, members, invites, and vendor workflows.
          </p>
          <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Admin records only. Member access is managed through Members and Invites.
          </p>
          <p className="mt-3 text-sm text-neutral-400">
            Member access is managed through Members and Invites.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
            <Link href="/property" className="hover:text-white">Property Dashboard</Link>
            <Link href="/property/members" className="hover:text-white">Members</Link>
            <Link href="/property/invites" className="hover:text-white">Invites</Link>
          </div>

          <div className="mt-5 grid gap-3 text-xs text-neutral-400 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3">
              Uses current shop profile
            </div>
            <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3">
              RLS scoped
            </div>
            <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3">
              Admin records only
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--metal-border-soft)]/70 bg-black/20 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-neutral-100">
              Setup overview
            </h2>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-400">
              Read-only
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overviewItems.map((section) => (
              <article key={section.title} className="rounded-lg border border-[color:var(--metal-border-soft)]/40 bg-black/20 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-100">
                    {section.title}
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {section.count} shown
                  </span>
                </div>
                {section.rows.length === 0 ? (
                  <p className="mt-3 text-sm text-neutral-500">
                    {section.emptyLabel}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {section.rows.map((row) => (
                      <li key={row.id} className="text-sm text-neutral-300">
                        <div>{row.primary}</div>
                        {row.secondary ? (
                          <div className="text-xs text-neutral-500">
                            {row.secondary}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Each list shows up to 5 RLS-visible records for your current shop.
          </p>
        </section>

        {hasShop ? (
          <>
            <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border-t border-[color:var(--metal-border-soft)]/70 pt-4">
              <h2 className="text-base font-semibold text-neutral-100">
                Create portfolio
              </h2>
              <form action={createPropertyPortfolio} className="mt-3 space-y-2.5">
                <label className="block text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Name
                  <input
                    name="name"
                    required
                    className="mt-2 w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2"
                  />
                </label>
                <label className="block text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Description (optional)
                  <textarea
                    name="description"
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-[color:var(--accent-copper)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110"
                >
                  Create portfolio
                </button>
              </form>
            </article>

            <article className="rounded-xl border-t border-[color:var(--metal-border-soft)]/70 pt-4">
              <h2 className="text-base font-semibold text-neutral-100">
                Create property
              </h2>
              <form action={createPropertyProperty} className="mt-3 space-y-2.5">
                <label className="block text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Portfolio (optional)
                  <select
                    name="portfolio_id"
                    defaultValue=""
                    className="mt-2 w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2"
                  >
                    <option value="">No portfolio</option>
                    {(portfoliosResult?.data ?? []).map((portfolio) => (
                      <option key={portfolio.id} value={portfolio.id}>
                        {portfolio.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs uppercase tracking-[0.14em] text-neutral-400">
                  Name
                  <input
                    name="name"
                    required
                    className="mt-2 w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="property_type" placeholder="Property type" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="address_line1" placeholder="Address line 1" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="address_line2" placeholder="Address line 2" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="city" placeholder="City" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="region" placeholder="Region / province" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="postal_code" placeholder="Postal code" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="country" defaultValue="CA" placeholder="Country" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <select name="status" defaultValue="active" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                    <option value="active">active</option>
                    <option value="limited">limited</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="rounded-full bg-[color:var(--accent-copper)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110"
                >
                  Create property
                </button>
              </form>
            </article>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border-t border-[color:var(--metal-border-soft)]/70 pt-4">
              <h2 className="text-base font-semibold text-neutral-100">
                Create unit
              </h2>
              {propertiesResult?.data?.length ? (
                <form action={createPropertyUnit} className="mt-3 space-y-2.5">
                  <select name="property_id" required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                    {(propertiesResult?.data ?? []).map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                  <input name="unit_label" required placeholder="Unit label" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="unit_type" placeholder="Unit type (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="occupancy_status" placeholder="Occupancy status (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <textarea name="access_notes" rows={2} placeholder="Access notes (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <select name="status" defaultValue="active" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                    <option value="active">active</option>
                    <option value="limited">limited</option>
                    <option value="inactive">inactive</option>
                  </select>
                  <button type="submit" className="rounded-full bg-[color:var(--accent-copper)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110">Create unit</button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">Create a property first.</p>
              )}
            </article>
            <article className="rounded-xl border-t border-[color:var(--metal-border-soft)]/70 pt-4">
              <h2 className="text-base font-semibold text-neutral-100">
                Create asset
              </h2>
              {propertiesResult?.data?.length ? (
                <form action={createPropertyAsset} className="mt-3 space-y-2.5">
                  <select name="property_id" required className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                    {(propertiesResult?.data ?? []).map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                  <select name="unit_id" defaultValue="" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                    <option value="">No unit / property-level asset</option>
                    {(unitsResult?.data ?? []).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_label} • {unit.property_id}
                      </option>
                    ))}
                  </select>
                  <input name="name" required placeholder="Asset name" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="asset_type" placeholder="Asset type" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="manufacturer" placeholder="Manufacturer" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="model" placeholder="Model" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="serial_number" placeholder="Serial number" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="install_date" type="date" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="warranty_expires_on" type="date" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="next_service_date" type="date" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <select name="status" defaultValue="active" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                      <option value="active">active</option>
                      <option value="limited">limited</option>
                      <option value="offline">offline</option>
                      <option value="retired">retired</option>
                    </select>
                  </div>
                  <textarea name="location_note" rows={2} placeholder="Location note (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <button type="submit" className="rounded-full bg-[color:var(--accent-copper)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110">Create asset</button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">Create a property first.</p>
              )}
            </article>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border-t border-[color:var(--metal-border-soft)]/70 pt-4">
                <h2 className="text-base font-semibold text-neutral-100">
                  Create vendor
                </h2>
                <p className="mt-2 text-xs text-neutral-400">
                  Member access is managed through Members and Invites.
                </p>
                <form action={createPropertyVendor} className="mt-3 space-y-2.5">
                  <input name="name" required placeholder="Vendor name" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="trade" placeholder="Trade (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <input name="contact_name" placeholder="Contact name (optional)" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="email" type="email" placeholder="Email (optional)" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                    <input name="phone" placeholder="Phone (optional)" className="rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2" />
                  </div>
                  <select name="status" defaultValue="active" className="w-full rounded-xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-sm text-neutral-100 outline-none ring-[color:var(--accent-copper)]/50 transition focus:ring-2">
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                  <button type="submit" className="rounded-full bg-[color:var(--accent-copper)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110">Create vendor</button>
                </form>
              </article>
            </section>
          </>
        ) : null}

        {status ? (
          <SetupStatusCard status={status} message={message} />
        ) : null}

        {!hasShop ? (
          <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-xs text-amber-100">
            <div className="font-semibold">No shop is assigned.</div>
            <p className="mt-2 text-amber-100/80">
              Your authenticated profile does not have a shop_id, so property
              demo data cannot be inserted safely. Assign this user to a shop
              before running setup.
            </p>
          </section>
        ) : (
          <section className="rounded-xl border-t border-[color:var(--metal-border-soft)]/70 pt-4">
            <h2 className="text-lg font-semibold text-neutral-100">
              Demo tools
            </h2>
            <p className="mt-2 text-sm text-neutral-300">
              Seed baseline records for local validation.
            </p>
            <h3 className="mt-4 text-base font-semibold text-neutral-100">
              Dataset to create
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-neutral-300">
              <li>• Portfolio: Property Maintenance Demo Portfolio</li>
              <li>• Property: Riverbend Duplex in Calgary, AB</li>
              <li>• Unit: Unit A, occupied residential unit</li>
              <li>• Asset: active HVAC furnace with future service date</li>
              <li>• Request: noisy furnace startup, routine/open</li>
              <li>• Vendor and assigned vendor work placeholder</li>
            </ul>

            <form action={createPropertyDemoDataset} className="mt-6">
              <button
                type="submit"
                className="rounded-full bg-[color:var(--accent-copper)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-black transition hover:brightness-110"
              >
                Create demo property data
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

function SetupStatusCard({
  status,
  message,
}: {
  status: string;
  message?: string;
}) {
  if (status === "created") {
    return (
      <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
        <div className="font-semibold">Demo data created.</div>
        <p className="mt-2 text-emerald-100/80">
          The live property maintenance dataset is now available through the
          internal read-only dashboard.
        </p>
        <Link
          href="/property"
          className="mt-3 inline-flex rounded-full border border-emerald-200/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50 hover:bg-emerald-100/10"
        >
          View property dashboard
        </Link>
      </section>
    );
  }

  if (status === "exists") {
    return (
      <section className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3.5 text-xs text-sky-100">
        <div className="font-semibold">Demo data already exists.</div>
        <p className="mt-2 text-sky-100/80">
          A portfolio named {DEMO_PORTFOLIO_NAME} already exists for this shop,
          so setup did not create another copy.
        </p>
        <Link
          href="/property"
          className="mt-3 inline-flex rounded-full border border-sky-200/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-50 hover:bg-sky-100/10"
        >
          View property dashboard
        </Link>
      </section>
    );
  }

  if (status === "missing-shop") {
    return (
      <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-xs text-amber-100">
        <div className="font-semibold">No shop is assigned.</div>
        <p className="mt-2 text-amber-100/80">
          Your authenticated profile does not have a shop_id, so setup did not
          insert property data.
        </p>
      </section>
    );
  }

  if (status === "portfolio-created") {
    return (
      <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
        <div className="font-semibold">Portfolio created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new portfolio is now available in setup overview and property creation.
        </p>
      </section>
    );
  }

  if (status === "property-created") {
    return (
      <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
        <div className="font-semibold">Property created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new property is now available in setup overview for this shop.
        </p>
      </section>
    );
  }

  if (status === "unit-created") {
    return (
      <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
        <div className="font-semibold">Unit created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new unit is now available for property setup and asset linking.
        </p>
      </section>
    );
  }

  if (status === "asset-created") {
    return (
      <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
        <div className="font-semibold">Asset created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new asset is now available in setup overview for this shop.
        </p>
      </section>
    );
  }

  if (status === "vendor-created") {
    return (
      <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
        <div className="font-semibold">Vendor created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new vendor record is now available in setup overview for this shop.
        </p>
      </section>
    );
  }

  if (status === "validation-error") {
    return (
      <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-xs text-amber-100">
        <div className="font-semibold">Validation error.</div>
        <p className="mt-2 text-amber-100/80">
          {message ?? "Please review form values and try again."}
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="rounded-xl border border-red-400/30 bg-red-500/10 p-3.5 text-xs text-red-100">
        <div className="font-semibold">Setup failed.</div>
        <p className="mt-2 text-red-100/80">
          {message ?? "Property demo data could not be created."}
        </p>
      </section>
    );
  }

  return null;
}
