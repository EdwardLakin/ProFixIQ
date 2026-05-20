import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  city: string | null;
  region: string | null;
};

type PropertyInsert = {
  shop_id: string;
  portfolio_id?: string | null;
  name: string;
  property_type?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
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
  unit_type?: string | null;
  occupancy_status?: string | null;
  access_notes?: string | null;
  status?: string;
};

type AssetRow = {
  id: string;
  shop_id: string;
  property_id: string;
  unit_id: string | null;
  name: string;
  asset_type: string | null;
  status: string | null;
};

type AssetInsert = {
  shop_id: string;
  property_id: string;
  unit_id?: string | null;
  name: string;
  asset_type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  install_date?: string | null;
  warranty_expires_on?: string | null;
  location_note?: string | null;
  status: string;
  next_service_date?: string | null;
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
  trade: string | null;
  status: string | null;
};

type VendorInsert = {
  shop_id: string;
  name: string;
  trade?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
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

async function createPropertyPortfolio(formData: FormData) {
  "use server";
  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);
  if (!user) redirect("/sign-in");
  const shopId = profile?.shop_id;
  if (!shopId) redirect("/property/setup?status=missing-shop");

  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;

  if (!name) {
    redirect("/property/setup?status=validation-error&message=Portfolio%20name%20is%20required.");
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("property_portfolios")
    .select("id")
    .eq("shop_id", shopId)
    .eq("name", name)
    .maybeSingle();

  if (duplicateError) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(duplicateError.message)}`,
    );
  }

  if (duplicate) {
    redirect(
      "/property/setup?status=validation-error&message=Portfolio%20name%20already%20exists%20for%20this%20shop.",
    );
  }

  const { error } = await supabase.from("property_portfolios").insert({
    shop_id: shopId,
    name,
    description,
  });

  if (error) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/property");
  revalidatePath("/property/setup");
  redirect("/property/setup?status=portfolio-created");
}

async function createPropertyProperty(formData: FormData) {
  "use server";
  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);
  if (!user) redirect("/sign-in");
  const shopId = profile?.shop_id;
  if (!shopId) redirect("/property/setup?status=missing-shop");

  const portfolioIdRaw = String(formData.get("portfolio_id") ?? "").trim();
  const portfolioId = portfolioIdRaw.length > 0 ? portfolioIdRaw : null;
  const name = String(formData.get("name") ?? "").trim();
  const propertyType = String(formData.get("property_type") ?? "").trim() || null;
  const addressLine1 = String(formData.get("address_line1") ?? "").trim() || null;
  const addressLine2 = String(formData.get("address_line2") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const region = String(formData.get("region") ?? "").trim() || null;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || "CA";
  const status = String(formData.get("status") ?? "active").trim() || "active";

  if (!name) {
    redirect("/property/setup?status=validation-error&message=Property%20name%20is%20required.");
  }

  if (!["active", "limited", "inactive"].includes(status)) {
    redirect(
      "/property/setup?status=validation-error&message=Property%20status%20must%20be%20active%2C%20limited%2C%20or%20inactive.",
    );
  }

  if (portfolioId) {
    const { data: portfolio, error: portfolioError } = await supabase
      .from("property_portfolios")
      .select("id,shop_id")
      .eq("id", portfolioId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (portfolioError) {
      redirect(
        `/property/setup?status=error&message=${encodeURIComponent(portfolioError.message)}`,
      );
    }

    if (!portfolio) {
      redirect(
        "/property/setup?status=validation-error&message=Selected%20portfolio%20is%20not%20available%20for%20this%20shop.",
      );
    }
  }

  const { error } = await supabase.from("property_properties").insert({
    shop_id: shopId,
    portfolio_id: portfolioId,
    name,
    property_type: propertyType,
    address_line1: addressLine1,
    address_line2: addressLine2,
    city,
    region,
    postal_code: postalCode,
    country,
    status,
  });

  if (error) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/property");
  revalidatePath("/property/setup");
  redirect("/property/setup?status=property-created");
}

async function createPropertyUnit(formData: FormData) {
  "use server";
  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);
  if (!user) redirect("/sign-in");
  const shopId = profile?.shop_id;
  if (!shopId) redirect("/property/setup?status=missing-shop");

  const propertyId = String(formData.get("property_id") ?? "").trim();
  const unitLabel = String(formData.get("unit_label") ?? "").trim();
  const unitType = String(formData.get("unit_type") ?? "").trim() || null;
  const occupancyStatus =
    String(formData.get("occupancy_status") ?? "").trim() || null;
  const accessNotes = String(formData.get("access_notes") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active").trim() || "active";

  if (!propertyId) {
    redirect("/property/setup?status=validation-error&message=Property%20is%20required%20for%20a%20unit.");
  }
  if (!unitLabel) {
    redirect("/property/setup?status=validation-error&message=Unit%20label%20is%20required.");
  }
  if (!["active", "limited", "inactive"].includes(status)) {
    redirect(
      "/property/setup?status=validation-error&message=Unit%20status%20must%20be%20active%2C%20limited%2C%20or%20inactive.",
    );
  }

  const { data: property, error: propertyError } = await supabase
    .from("property_properties")
    .select("id,shop_id")
    .eq("id", propertyId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (propertyError) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(propertyError.message)}`,
    );
  }
  if (!property) {
    redirect(
      "/property/setup?status=validation-error&message=Selected%20property%20is%20not%20available%20for%20this%20shop.",
    );
  }

  const { error } = await supabase.from("property_units").insert({
    shop_id: shopId,
    property_id: propertyId,
    unit_label: unitLabel,
    unit_type: unitType,
    occupancy_status: occupancyStatus,
    access_notes: accessNotes,
    status,
  });

  if (error) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/property");
  revalidatePath("/property/setup");
  redirect("/property/setup?status=unit-created");
}

async function createPropertyAsset(formData: FormData) {
  "use server";
  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);
  if (!user) redirect("/sign-in");
  const shopId = profile?.shop_id;
  if (!shopId) redirect("/property/setup?status=missing-shop");

  const propertyId = String(formData.get("property_id") ?? "").trim();
  const unitIdRaw = String(formData.get("unit_id") ?? "").trim();
  const unitId = unitIdRaw.length > 0 ? unitIdRaw : null;
  const name = String(formData.get("name") ?? "").trim();
  const assetType = String(formData.get("asset_type") ?? "").trim() || null;
  const manufacturer = String(formData.get("manufacturer") ?? "").trim() || null;
  const model = String(formData.get("model") ?? "").trim() || null;
  const serialNumber = String(formData.get("serial_number") ?? "").trim() || null;
  const installDate = String(formData.get("install_date") ?? "").trim() || null;
  const warrantyExpiresOn =
    String(formData.get("warranty_expires_on") ?? "").trim() || null;
  const locationNote = String(formData.get("location_note") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active").trim() || "active";
  const nextServiceDate =
    String(formData.get("next_service_date") ?? "").trim() || null;

  if (!propertyId) {
    redirect("/property/setup?status=validation-error&message=Property%20is%20required%20for%20an%20asset.");
  }
  if (!name) {
    redirect("/property/setup?status=validation-error&message=Asset%20name%20is%20required.");
  }
  if (!["active", "limited", "offline", "retired"].includes(status)) {
    redirect(
      "/property/setup?status=validation-error&message=Asset%20status%20must%20be%20active%2C%20limited%2C%20offline%2C%20or%20retired.",
    );
  }

  const { data: property, error: propertyError } = await supabase
    .from("property_properties")
    .select("id,shop_id")
    .eq("id", propertyId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (propertyError) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(propertyError.message)}`,
    );
  }
  if (!property) {
    redirect(
      "/property/setup?status=validation-error&message=Selected%20property%20is%20not%20available%20for%20this%20shop.",
    );
  }

  if (unitId) {
    const { data: unit, error: unitError } = await supabase
      .from("property_units")
      .select("id,property_id")
      .eq("id", unitId)
      .eq("shop_id", shopId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (unitError) {
      redirect(
        `/property/setup?status=error&message=${encodeURIComponent(unitError.message)}`,
      );
    }
    if (!unit) {
      redirect(
        "/property/setup?status=validation-error&message=Selected%20unit%20is%20not%20available%20for%20the%20selected%20property.",
      );
    }
  }

  const { error } = await supabase.from("property_assets").insert({
    shop_id: shopId,
    property_id: propertyId,
    unit_id: unitId,
    name,
    asset_type: assetType,
    manufacturer,
    model,
    serial_number: serialNumber,
    install_date: installDate,
    warranty_expires_on: warrantyExpiresOn,
    location_note: locationNote,
    status,
    next_service_date: nextServiceDate,
  });

  if (error) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/property");
  revalidatePath("/property/setup");
  redirect("/property/setup?status=asset-created");
}

async function createPropertyVendor(formData: FormData) {
  "use server";
  const supabase = createPropertySetupClient();
  const { user, profile } = await getCurrentProfile(supabase);
  if (!user) redirect("/sign-in");
  const shopId = profile?.shop_id;
  if (!shopId) redirect("/property/setup?status=missing-shop");

  const name = String(formData.get("name") ?? "").trim();
  const trade = String(formData.get("trade") ?? "").trim() || null;
  const contactName = String(formData.get("contact_name") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active").trim() || "active";

  if (!name) {
    redirect("/property/setup?status=validation-error&message=Vendor%20name%20is%20required.");
  }
  if (!["active", "inactive"].includes(status)) {
    redirect(
      "/property/setup?status=validation-error&message=Vendor%20status%20must%20be%20active%20or%20inactive.",
    );
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("property_vendors")
    .select("id")
    .eq("shop_id", shopId)
    .eq("name", name)
    .maybeSingle();

  if (duplicateError) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(duplicateError.message)}`,
    );
  }
  if (duplicate) {
    redirect(
      "/property/setup?status=validation-error&message=Vendor%20name%20already%20exists%20for%20this%20shop.",
    );
  }

  const { error } = await supabase.from("property_vendors").insert({
    shop_id: shopId,
    name,
    trade,
    contact_name: contactName,
    email,
    phone,
    status,
  });

  if (error) {
    redirect(
      `/property/setup?status=error&message=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/property");
  revalidatePath("/property/setup");
  redirect("/property/setup?status=vendor-created");
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

        <section className="rounded-2xl border border-[color:var(--metal-border-soft)]/70 bg-black/20 p-5 md:p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Internal setup workspace
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-100 md:text-4xl">
            Property Setup
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-300">
            Configure portfolios, properties, units, assets, and vendors for property maintenance.
          </p>
          <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Admin setup workspace. Create the property records that power requests, inspections, members, invites, and vendor workflows.
          </p>
          <p className="mt-3 text-sm text-neutral-400">
            Tenant/member access is managed through Property Members and Invites.
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
          <div className="mt-4 divide-y divide-[color:var(--metal-border-soft)]/70">
            {overviewItems.map((section) => (
              <article key={section.title} className="py-3 first:pt-0 last:pb-0">
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
            <article className="metal-card rounded-3xl p-5">
              <h2 className="text-base font-semibold text-neutral-100">
                Create portfolio
              </h2>
              <form action={createPropertyPortfolio} className="mt-4 space-y-3">
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

            <article className="metal-card rounded-3xl p-5">
              <h2 className="text-base font-semibold text-neutral-100">
                Create property
              </h2>
              <form action={createPropertyProperty} className="mt-4 space-y-3">
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
            <article className="metal-card rounded-3xl p-5">
              <h2 className="text-base font-semibold text-neutral-100">
                Create unit
              </h2>
              {propertiesResult?.data?.length ? (
                <form action={createPropertyUnit} className="mt-4 space-y-3">
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
            <article className="metal-card rounded-3xl p-5">
              <h2 className="text-base font-semibold text-neutral-100">
                Create asset
              </h2>
              {propertiesResult?.data?.length ? (
                <form action={createPropertyAsset} className="mt-4 space-y-3">
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
              <article className="metal-card rounded-3xl p-5">
                <h2 className="text-base font-semibold text-neutral-100">
                  Create vendor
                </h2>
                <p className="mt-2 text-xs text-neutral-400">
                  Tenant/member access is managed through Property Members and Invites.
                </p>
                <form action={createPropertyVendor} className="mt-4 space-y-3">
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
              Demo tools
            </h2>
            <p className="mt-2 text-sm text-neutral-300">
              Seed a compact internal dataset when you need baseline records for
              local validation or demos.
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

  if (status === "portfolio-created") {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        <div className="font-semibold">Portfolio created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new portfolio is now available in setup overview and property creation.
        </p>
      </section>
    );
  }

  if (status === "property-created") {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        <div className="font-semibold">Property created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new property is now available in setup overview for this shop.
        </p>
      </section>
    );
  }

  if (status === "unit-created") {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        <div className="font-semibold">Unit created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new unit is now available for property setup and asset linking.
        </p>
      </section>
    );
  }

  if (status === "asset-created") {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        <div className="font-semibold">Asset created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new asset is now available in setup overview for this shop.
        </p>
      </section>
    );
  }

  if (status === "vendor-created") {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
        <div className="font-semibold">Vendor created.</div>
        <p className="mt-2 text-emerald-100/80">
          The new vendor record is now available in setup overview for this shop.
        </p>
      </section>
    );
  }

  if (status === "validation-error") {
    return (
      <section className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
        <div className="font-semibold">Validation error.</div>
        <p className="mt-2 text-amber-100/80">
          {message ?? "Please review form values and try again."}
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
