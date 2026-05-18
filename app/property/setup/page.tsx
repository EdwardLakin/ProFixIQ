import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

const DEMO_PORTFOLIO_NAME = "Property Maintenance Demo Portfolio";

type SearchParams = Record<string, string | string[] | undefined>;

type SetupPageProps = {
  searchParams?: Promise<SearchParams>;
};

type PropertySetupTable<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: never;
  Relationships: [];
};

type ProfileRow = {
  id: string;
  shop_id: string | null;
};

type PortfolioRow = {
  id: string;
  shop_id: string;
  name: string;
};

type PortfolioInsert = {
  shop_id: string;
  name: string;
  description?: string | null;
};

type PropertyRow = {
  id: string;
  shop_id: string;
  portfolio_id: string | null;
  name: string;
};

type PropertyInsert = {
  shop_id: string;
  portfolio_id: string;
  name: string;
  property_type: string;
  city: string;
  region: string;
  country: string;
  status?: string;
};

type UnitRow = {
  id: string;
  shop_id: string;
  property_id: string;
  unit_label: string;
};

type UnitInsert = {
  shop_id: string;
  property_id: string;
  unit_label: string;
  unit_type: string;
  occupancy_status: string;
  status?: string;
};

type AssetRow = {
  id: string;
  shop_id: string;
  property_id: string;
  unit_id: string | null;
  name: string;
};

type AssetInsert = {
  shop_id: string;
  property_id: string;
  unit_id: string;
  name: string;
  asset_type: string;
  manufacturer?: string | null;
  model?: string | null;
  location_note?: string | null;
  status: string;
  next_service_date: string;
};

type MaintenanceRequestRow = {
  id: string;
  shop_id: string;
  property_id: string;
  unit_id: string | null;
  asset_id: string | null;
  title: string;
};

type MaintenanceRequestInsert = {
  shop_id: string;
  property_id: string;
  unit_id: string;
  asset_id: string;
  requester_profile_id: string;
  title: string;
  summary: string;
  category: string;
  severity: string;
  status: string;
  source: string;
};

type VendorRow = {
  id: string;
  shop_id: string;
  name: string;
};

type VendorInsert = {
  shop_id: string;
  name: string;
  trade: string;
  status: string;
};

type VendorAssignmentRow = {
  id: string;
  shop_id: string;
  request_id: string | null;
  vendor_id: string;
};

type VendorAssignmentInsert = {
  shop_id: string;
  request_id: string;
  vendor_id: string;
  status: string;
  notes?: string | null;
};

type PropertySetupDatabase = {
  public: {
    Tables: {
      profiles: PropertySetupTable<ProfileRow, never>;
      property_portfolios: PropertySetupTable<PortfolioRow, PortfolioInsert>;
      property_properties: PropertySetupTable<PropertyRow, PropertyInsert>;
      property_units: PropertySetupTable<UnitRow, UnitInsert>;
      property_assets: PropertySetupTable<AssetRow, AssetInsert>;
      property_maintenance_requests: PropertySetupTable<
        MaintenanceRequestRow,
        MaintenanceRequestInsert
      >;
      property_vendors: PropertySetupTable<VendorRow, VendorInsert>;
      property_vendor_assignments: PropertySetupTable<
        VendorAssignmentRow,
        VendorAssignmentInsert
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function createPropertySetupClient() {
  return createServerSupabaseRSC() as unknown as SupabaseClient<PropertySetupDatabase>;
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getNextServiceDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 90);
  return date.toISOString().slice(0, 10);
}

async function getCurrentProfile(
  supabase: SupabaseClient<PropertySetupDatabase>,
) {
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

async function insertAndReturnId<Row extends { id: string }>(
  query: PromiseLike<{ data: Row | null; error: { message: string } | null }>,
  label: string,
) {
  const { data, error } = await query;

  if (error || !data?.id) {
    throw new Error(error?.message ?? `Unable to create ${label}.`);
  }

  return data.id;
}

async function createPropertyDemoDataset() {
  "use server";

  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);

  if (!user) {
    redirect("/sign-in");
  }

  const shopId = profile?.shop_id;
  if (!shopId) {
    redirect("/property/setup?status=missing-shop");
  }

  const { data: existingPortfolio, error: existingPortfolioError } =
    await supabase
      .from("property_portfolios")
      .select("id")
      .eq("shop_id", shopId)
      .eq("name", DEMO_PORTFOLIO_NAME)
      .maybeSingle();

  if (existingPortfolioError) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(existingPortfolioError.message)}`,
    );
  }

  if (existingPortfolio) {
    redirect("/property/setup?status=exists");
  }

  try {
    const portfolioId = await insertAndReturnId(
      supabase
        .from("property_portfolios")
        .insert({
          shop_id: shopId,
          name: DEMO_PORTFOLIO_NAME,
          description:
            "Small internal-only demo portfolio seeded from the ProFixIQ app.",
        })
        .select("id")
        .single(),
      "property portfolio",
    );

    const propertyId = await insertAndReturnId(
      supabase
        .from("property_properties")
        .insert({
          shop_id: shopId,
          portfolio_id: portfolioId,
          name: "Riverbend Duplex",
          property_type: "Residential",
          city: "Calgary",
          region: "AB",
          country: "CA",
          status: "active",
        })
        .select("id")
        .single(),
      "property",
    );

    const unitId = await insertAndReturnId(
      supabase
        .from("property_units")
        .insert({
          shop_id: shopId,
          property_id: propertyId,
          unit_label: "Unit A",
          unit_type: "Residential Unit",
          occupancy_status: "Occupied",
          status: "active",
        })
        .select("id")
        .single(),
      "property unit",
    );

    const assetId = await insertAndReturnId(
      supabase
        .from("property_assets")
        .insert({
          shop_id: shopId,
          property_id: propertyId,
          unit_id: unitId,
          name: "Furnace",
          asset_type: "HVAC",
          manufacturer: "Demo Mechanical",
          model: "PFIQ-90",
          location_note: "Mechanical room",
          status: "active",
          next_service_date: getNextServiceDate(),
        })
        .select("id")
        .single(),
      "property asset",
    );

    const requestId = await insertAndReturnId(
      supabase
        .from("property_maintenance_requests")
        .insert({
          shop_id: shopId,
          property_id: propertyId,
          unit_id: unitId,
          asset_id: assetId,
          requester_profile_id: user.id,
          title: "Noisy furnace during startup",
          summary:
            "Tenant reported the furnace makes a loud noise during startup.",
          category: "HVAC",
          severity: "routine",
          status: "open",
          source: "internal_seed",
        })
        .select("id")
        .single(),
      "maintenance request",
    );

    const vendorId = await insertAndReturnId(
      supabase
        .from("property_vendors")
        .insert({
          shop_id: shopId,
          name: "Demo HVAC Vendor",
          trade: "HVAC",
          status: "active",
        })
        .select("id")
        .single(),
      "property vendor",
    );

    await insertAndReturnId(
      supabase
        .from("property_vendor_assignments")
        .insert({
          shop_id: shopId,
          request_id: requestId,
          vendor_id: vendorId,
          status: "assigned",
          notes:
            "Internal seed assignment for validating the read-only property dashboard.",
        })
        .select("id")
        .single(),
      "vendor assignment",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed failed.";
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(message)}`,
    );
  }

  redirect("/property/setup?status=created");
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] px-4 py-6 text-white md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Link
          href="/property"
          className="w-fit rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-200 transition hover:border-[color:var(--accent-copper)]/70 hover:text-white"
        >
          ← Back to property dashboard
        </Link>

        <section className="metal-card rounded-3xl p-6 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Internal setup
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-100 md:text-4xl">
            Property Maintenance Demo Seed
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
            Create a minimal property operations dataset for the current
            internal shop so the live read-only property dashboard can be
            verified without manual SQL inserts.
          </p>

          <div className="mt-5 grid gap-3 text-xs text-neutral-400 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3">
              Uses current profile.shop_id
            </div>
            <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3">
              No service role or schema changes
            </div>
            <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/30 p-3">
              No tenant/vendor auth wiring
            </div>
          </div>
        </section>

        {status ? (
          <SetupStatusCard status={status} message={message} />
        ) : null}

        {!hasShop ? (
          <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
            <div className="font-semibold">No shop is assigned.</div>
            <p className="mt-2 text-amber-100/80">
              Your authenticated profile does not have a shop_id, so property
              demo data cannot be inserted safely. Assign this user to a shop
              before running setup.
            </p>
          </section>
        ) : (
          <section className="metal-card rounded-3xl p-5">
            <h2 className="text-lg font-semibold text-neutral-100">
              Dataset to create
            </h2>
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
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        <div className="font-semibold">Demo data created.</div>
        <p className="mt-2 text-emerald-100/80">
          The live property maintenance dataset is now available through the
          internal read-only dashboard.
        </p>
        <Link
          href="/property"
          className="mt-4 inline-flex rounded-full border border-emerald-200/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50 hover:bg-emerald-100/10"
        >
          View property dashboard
        </Link>
      </section>
    );
  }

  if (status === "exists") {
    return (
      <section className="rounded-3xl border border-sky-400/30 bg-sky-500/10 p-5 text-sm text-sky-100">
        <div className="font-semibold">Demo data already exists.</div>
        <p className="mt-2 text-sky-100/80">
          A portfolio named {DEMO_PORTFOLIO_NAME} already exists for this shop,
          so setup did not create another copy.
        </p>
        <Link
          href="/property"
          className="mt-4 inline-flex rounded-full border border-sky-200/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-50 hover:bg-sky-100/10"
        >
          View property dashboard
        </Link>
      </section>
    );
  }

  if (status === "missing-shop") {
    return (
      <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
        <div className="font-semibold">No shop is assigned.</div>
        <p className="mt-2 text-amber-100/80">
          Your authenticated profile does not have a shop_id, so setup did not
          insert property data.
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
        <div className="font-semibold">Setup failed.</div>
        <p className="mt-2 text-red-100/80">
          {message ?? "Property demo data could not be created."}
        </p>
      </section>
    );
  }

  return null;
}
