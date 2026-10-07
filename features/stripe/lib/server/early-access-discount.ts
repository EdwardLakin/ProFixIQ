import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  productAcquisitionSurface,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";

export const EARLY_ACCESS_PERCENT_OFF = 30;
export const EARLY_ACCESS_DURATION_MONTHS = 6;
export const EARLY_ACCESS_TRIAL_DAYS = 7;
export const EARLY_ACCESS_APPROVAL_TTL_DAYS = 14;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,}$/;

type JsonObject = Record<string, unknown>;

type ApplicationRow = {
  id: string;
  email: string;
  company_name: string;
  product_package: ProductPackageKey;
  offer_terms_version: string;
  status: string;
};

type GrantRow = {
  id: string;
  shop_id: string | null;
  stripe_coupon_id: string | null;
  percent_off: number | string | null;
  duration: string;
  duration_in_months: number | null;
  status: string;
  terms_version: string | null;
  metadata: unknown;
};

export type EarlyAccessGrant = {
  grantId: string;
  applicationId: string;
  email: string;
  companyName: string;
  productPackage: ProductPackageKey;
  offerTermsVersion: string;
  expiresAt: string;
  stripeCouponId: string | null;
};

export type ApprovedEarlyAccessGrant = EarlyAccessGrant & {
  token: string;
};

function metadataObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function metadataString(metadata: JsonObject, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function validToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

function assertGrantContract(row: GrantRow, application: ApplicationRow): EarlyAccessGrant {
  const metadata = metadataObject(row.metadata);
  const applicationId = metadataString(metadata, "application_id");
  const email = normalizeEmail(metadataString(metadata, "application_email"));
  const productPackage = metadataString(metadata, "product_package") as ProductPackageKey;
  const expiresAt = metadataString(metadata, "approval_expires_at");
  const termsVersion = metadataString(metadata, "offer_terms_version");

  if (
    row.status !== "active" ||
    application.status !== "approved" ||
    applicationId !== application.id ||
    email !== normalizeEmail(application.email) ||
    productPackage !== application.product_package ||
    termsVersion !== application.offer_terms_version ||
    row.terms_version !== application.offer_terms_version ||
    Number(row.percent_off) !== EARLY_ACCESS_PERCENT_OFF ||
    row.duration !== "repeating" ||
    row.duration_in_months !== EARLY_ACCESS_DURATION_MONTHS
  ) {
    throw new Error("Early Access approval is no longer valid.");
  }

  const expires = new Date(expiresAt);
  if (!expiresAt || Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    throw new Error("Early Access approval has expired.");
  }

  return {
    grantId: row.id,
    applicationId: application.id,
    email,
    companyName: application.company_name,
    productPackage,
    offerTermsVersion: application.offer_terms_version,
    expiresAt,
    stripeCouponId: row.stripe_coupon_id,
  };
}

export async function approveEarlyAccessDiscount(input: {
  applicationId: string;
  actorUserId: string | null;
}): Promise<ApprovedEarlyAccessGrant> {
  const admin = createAdminSupabase();
  const { data: application, error: applicationError } = await admin
    .from("early_access_applications")
    .select("id, email, company_name, product_package, offer_terms_version, status")
    .eq("id", input.applicationId)
    .maybeSingle<ApplicationRow>();

  if (applicationError) {
    throw new Error(`Failed to load Early Access application: ${applicationError.message}`);
  }
  if (!application || application.status !== "pending") {
    throw new Error("This Early Access application has already been reviewed or no longer exists.");
  }

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const approvalTokenHash = tokenHash(token);
  const expiresAt = new Date(
    Date.now() + EARLY_ACCESS_APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const email = normalizeEmail(application.email);

  const metadata = {
    purpose: "early_access",
    application_id: application.id,
    application_email: email,
    product_package: application.product_package,
    approval_token_hash: approvalTokenHash,
    approval_expires_at: expiresAt,
    offer_terms_version: application.offer_terms_version,
    pricing_model: PRODUCT_PACKAGE_BILLING_MODEL,
    trial_days: EARLY_ACCESS_TRIAL_DAYS,
  };

  const { data: grant, error: grantError } = await admin
    .from("billing_discount_grants")
    .insert({
      shop_id: null,
      discount_class: "beta",
      percent_off: EARLY_ACCESS_PERCENT_OFF,
      duration: "repeating",
      duration_in_months: EARLY_ACCESS_DURATION_MONTHS,
      status: "active",
      approved_by: input.actorUserId,
      terms_version: application.offer_terms_version,
      metadata,
    })
    .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
    .single<GrantRow>();

  if (grantError || !grant) {
    throw new Error(`Failed to create Early Access discount grant: ${grantError?.message ?? "empty result"}`);
  }

  const reviewedAt = new Date().toISOString();
  const { data: reviewed, error: reviewError } = await admin
    .from("early_access_applications")
    .update({
      status: "approved",
      reviewed_at: reviewedAt,
      reviewed_by: input.actorUserId,
    })
    .eq("id", application.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (reviewError || !reviewed) {
    await admin.from("billing_discount_grants").delete().eq("id", grant.id).eq("status", "active");
    throw new Error(
      `Failed to approve Early Access application: ${reviewError?.message ?? "application already reviewed"}`,
    );
  }

  return {
    ...assertGrantContract(grant, { ...application, status: "approved" }),
    token,
  };
}

export async function findEarlyAccessGrantByToken(token: string): Promise<EarlyAccessGrant> {
  if (!validToken(token)) throw new Error("Early Access approval link is invalid.");

  const admin = createAdminSupabase();
  const approvalTokenHash = tokenHash(token);
  const { data: grant, error: grantError } = await admin
    .from("billing_discount_grants")
    .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
    .eq("status", "active")
    .eq("metadata->>purpose", "early_access")
    .eq("metadata->>approval_token_hash", approvalTokenHash)
    .maybeSingle<GrantRow>();

  if (grantError) throw new Error(`Early Access approval lookup failed: ${grantError.message}`);
  if (!grant) throw new Error("Early Access approval link is invalid or has already been used.");

  const metadata = metadataObject(grant.metadata);
  const applicationId = metadataString(metadata, "application_id");
  if (!applicationId) throw new Error("Early Access approval link is invalid.");

  const expiresAt = metadataString(metadata, "approval_expires_at");
  const expires = new Date(expiresAt);
  if (!expiresAt || Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    await admin.from("billing_discount_grants").update({ status: "expired" }).eq("id", grant.id).eq("status", "active");
    throw new Error("Early Access approval has expired.");
  }

  const { data: application, error: applicationError } = await admin
    .from("early_access_applications")
    .select("id, email, company_name, product_package, offer_terms_version, status")
    .eq("id", applicationId)
    .maybeSingle<ApplicationRow>();

  if (applicationError) {
    throw new Error(`Failed to verify Early Access application: ${applicationError.message}`);
  }
  if (!application) throw new Error("Early Access approval link is invalid.");

  return assertGrantContract(grant, application);
}

export async function attachEarlyAccessCheckout(input: {
  grantId: string;
  stripeCouponId: string;
  checkoutSessionId: string;
  acquisitionIntentId: string;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { data: row, error: loadError } = await admin
    .from("billing_discount_grants")
    .select("metadata")
    .eq("id", input.grantId)
    .eq("status", "active")
    .maybeSingle<{ metadata: unknown }>();
  if (loadError || !row) throw new Error("Early Access discount grant is no longer active.");

  const metadata = metadataObject(row.metadata);
  const { error } = await admin
    .from("billing_discount_grants")
    .update({
      stripe_coupon_id: input.stripeCouponId,
      metadata: {
        ...metadata,
        checkout_session_id: input.checkoutSessionId,
        acquisition_intent_id: input.acquisitionIntentId,
        checkout_started_at: new Date().toISOString(),
      },
    })
    .eq("id", input.grantId)
    .eq("status", "active");
  if (error) throw new Error(`Failed to attach Early Access checkout: ${error.message}`);
}

export async function redeemEarlyAccessGrantAfterClaim(input: {
  grantId: string;
  shopId: string;
  checkoutEmail: string;
  packageKey: ProductPackageKey;
  checkoutSessionId: string;
  subscriptionId: string;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { data: grant, error: loadError } = await admin
    .from("billing_discount_grants")
    .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
    .eq("id", input.grantId)
    .maybeSingle<GrantRow>();

  if (loadError || !grant) throw new Error("Early Access discount grant could not be verified.");
  if (grant.status === "redeemed" && grant.shop_id === input.shopId) return;
  if (grant.status !== "active") throw new Error("Early Access discount grant is no longer active.");

  const metadata = metadataObject(grant.metadata);
  const expectedEmail = normalizeEmail(metadataString(metadata, "application_email"));
  const expectedPackage = metadataString(metadata, "product_package");
  const expectedSession = metadataString(metadata, "checkout_session_id");

  if (
    !expectedEmail ||
    expectedEmail !== normalizeEmail(input.checkoutEmail) ||
    expectedPackage !== input.packageKey ||
    (expectedSession && expectedSession !== input.checkoutSessionId)
  ) {
    throw new Error("Early Access checkout identity does not match the approved grant.");
  }

  const { data: redeemed, error } = await admin
    .from("billing_discount_grants")
    .update({
      shop_id: input.shopId,
      status: "redeemed",
      metadata: {
        ...metadata,
        checkout_session_id: input.checkoutSessionId,
        subscription_id: input.subscriptionId,
        redeemed_at: new Date().toISOString(),
      },
    })
    .eq("id", input.grantId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error || !redeemed) {
    throw new Error(`Failed to redeem Early Access discount grant: ${error?.message ?? "grant already consumed"}`);
  }
}

export function earlyAccessGrantIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const value = String(metadata?.early_access_grant_id ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function earlyAccessSurface(packageKey: ProductPackageKey) {
  return productAcquisitionSurface(packageKey);
}
