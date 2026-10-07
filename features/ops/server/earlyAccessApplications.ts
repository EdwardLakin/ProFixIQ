import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export type EarlyAccessStatus = "pending" | "approved" | "declined";

export type EarlyAccessApplication = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  companyName: string;
  location: string | null;
  operationType: string;
  locationCount: number;
  technicianCount: number | null;
  teamSize: number | null;
  fleetAssetCount: number | null;
  currentSoftware: string | null;
  primaryChallenge: string;
  interestedSurfaces: string[];
  purchaseTimeline: string | null;
  feedbackCommitment: boolean;
  offerTermsAccepted: boolean;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: EarlyAccessStatus;
  reviewedAt: string | null;
  createdAt: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESUBMIT_COOLDOWN_MINUTES = 10;
const ALLOWED_OPERATION_TYPES = new Set(["automotive", "heavy_duty", "fleet", "field_service", "mixed", "other"]);
const ALLOWED_SURFACES = new Set(["shop", "fleet", "field_service", "shop_mobile", "customer_portal"]);
const ALLOWED_TIMELINES = new Set(["now", "30_days", "90_days", "6_months", "researching"]);

export type SubmitEarlyAccessApplicationInput = {
  fullName: string;
  email: string;
  phone?: string;
  companyName: string;
  location?: string;
  operationType: string;
  locationCount: number;
  technicianCount?: number | null;
  teamSize?: number | null;
  fleetAssetCount?: number | null;
  currentSoftware?: string;
  primaryChallenge: string;
  interestedSurfaces: string[];
  purchaseTimeline?: string;
  feedbackCommitment: boolean;
  offerTermsAccepted: boolean;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  website?: string;
};

function optionalText(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maxLength) throw new Error("One or more fields are too long.");
  return normalized;
}

function validateCount(value: number | null | undefined, label: string, min: number, max: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} is invalid.`);
  return value;
}

export async function submitEarlyAccessApplication(input: SubmitEarlyAccessApplicationInput): Promise<void> {
  if (input.website && input.website.trim() !== "") return;

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const companyName = input.companyName.trim();
  const primaryChallenge = input.primaryChallenge.trim();
  const operationType = input.operationType.trim();
  const purchaseTimeline = input.purchaseTimeline?.trim() || null;
  const interestedSurfaces = [...new Set(input.interestedSurfaces.map((surface) => surface.trim()))];

  if (!fullName) throw new Error("Name is required.");
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  if (!companyName) throw new Error("Company name is required.");
  if (!primaryChallenge) throw new Error("Tell us the main workflow problem you want to solve.");
  if (!ALLOWED_OPERATION_TYPES.has(operationType)) throw new Error("Choose a valid operation type.");
  if (purchaseTimeline && !ALLOWED_TIMELINES.has(purchaseTimeline)) throw new Error("Choose a valid timeline.");
  if (interestedSurfaces.length === 0 || interestedSurfaces.some((surface) => !ALLOWED_SURFACES.has(surface))) {
    throw new Error("Choose at least one ProFixIQ surface.");
  }
  if (!input.feedbackCommitment) throw new Error("Early Access requires active product feedback.");
  if (!input.offerTermsAccepted) throw new Error("Accept the Early Access offer terms to continue.");
  if (fullName.length > 200 || companyName.length > 200 || primaryChallenge.length > 2000) {
    throw new Error("One or more fields are too long.");
  }

  const locationCount = validateCount(input.locationCount, "Location count", 1, 500);
  if (locationCount == null) throw new Error("Location count is required.");
  const technicianCount = validateCount(input.technicianCount, "Technician count", 0, 10000);
  const teamSize = validateCount(input.teamSize, "Team size", 1, 25000);
  const fleetAssetCount = validateCount(input.fleetAssetCount, "Fleet asset count", 0, 1000000);

  const admin = createAdminSupabase();
  const cooldownSince = new Date(Date.now() - RESUBMIT_COOLDOWN_MINUTES * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await admin
    .from("early_access_applications")
    .select("id")
    .eq("email", email)
    .gte("created_at", cooldownSince)
    .limit(1);

  if (recentError) throw new Error(`Failed to check recent applications: ${recentError.message}`);
  if (recent && recent.length > 0) return;

  const { error } = await admin.from("early_access_applications").insert({
    full_name: fullName,
    email,
    phone: optionalText(input.phone, 100),
    company_name: companyName,
    location: optionalText(input.location, 200),
    operation_type: operationType,
    location_count: locationCount,
    technician_count: technicianCount,
    team_size: teamSize,
    fleet_asset_count: fleetAssetCount,
    current_software: optionalText(input.currentSoftware, 300),
    primary_challenge: primaryChallenge,
    interested_surfaces: interestedSurfaces,
    purchase_timeline: purchaseTimeline,
    feedback_commitment: true,
    offer_terms_accepted: true,
    source: optionalText(input.source, 500),
    utm_source: optionalText(input.utmSource, 200),
    utm_medium: optionalText(input.utmMedium, 200),
    utm_campaign: optionalText(input.utmCampaign, 200),
  });

  if (error) {
    if (error.code === "23505") return;
    throw new Error(`Failed to submit early access application: ${error.message}`);
  }
}

type EarlyAccessRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company_name: string;
  location: string | null;
  operation_type: string;
  location_count: number;
  technician_count: number | null;
  team_size: number | null;
  fleet_asset_count: number | null;
  current_software: string | null;
  primary_challenge: string;
  interested_surfaces: string[];
  purchase_timeline: string | null;
  feedback_commitment: boolean;
  offer_terms_accepted: boolean;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: EarlyAccessStatus;
  reviewed_at: string | null;
  created_at: string;
};

function mapRow(row: EarlyAccessRow): EarlyAccessApplication {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    location: row.location,
    operationType: row.operation_type,
    locationCount: row.location_count,
    technicianCount: row.technician_count,
    teamSize: row.team_size,
    fleetAssetCount: row.fleet_asset_count,
    currentSoftware: row.current_software,
    primaryChallenge: row.primary_challenge,
    interestedSurfaces: row.interested_surfaces ?? [],
    purchaseTimeline: row.purchase_timeline,
    feedbackCommitment: row.feedback_commitment,
    offerTermsAccepted: row.offer_terms_accepted,
    source: row.source,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    status: row.status,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id, full_name, email, phone, company_name, location, operation_type, location_count, technician_count, team_size, fleet_asset_count, current_software, primary_challenge, interested_surfaces, purchase_timeline, feedback_commitment, offer_terms_accepted, source, utm_source, utm_medium, utm_campaign, status, reviewed_at, created_at";

export async function listEarlyAccessApplications(): Promise<EarlyAccessApplication[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("early_access_applications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<EarlyAccessRow[]>();

  if (error) throw new Error(`Failed to list early access applications: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function reviewEarlyAccessApplication(
  applicationId: string,
  status: Extract<EarlyAccessStatus, "approved" | "declined">,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("early_access_applications")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: actorProfileId })
    .eq("id", applicationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to review early access application: ${error.message}`);
  if (!data) throw new Error("This application has already been reviewed or no longer exists.");
}
