"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

const DEMO_PORTFOLIO_NAME = "Property Maintenance Demo Portfolio";

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

export async function createPropertyDemoDataset() {
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

export async function createPropertyPortfolio(formData: FormData) {
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

export async function createPropertyProperty(formData: FormData) {
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

export async function createPropertyUnit(formData: FormData) {
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

export async function createPropertyAsset(formData: FormData) {
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

export async function createPropertyVendor(formData: FormData) {
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
