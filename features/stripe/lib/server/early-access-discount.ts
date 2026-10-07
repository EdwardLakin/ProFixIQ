import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  normalizeProductPackageKey,
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
  reissued: boolean;
};

function metadataObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function metadataString(metadata: JsonObject, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataNumber(metadata: JsonObject, key: string): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function createApprovalToken() {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + EARLY_ACCESS_APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return { token, approvalTokenHash: tokenHash(token), expiresAt };
}

function assertGrantContract(
  row: GrantRow,
  application: ApplicationRow,
  options: { requireApprovalWindow?: boolean } = {},
): EarlyAccessGrant {
  const metadata = metadataObject(row.metadata);
  const applicationId = metadataString(metadata, "application_id");
  const email = normalizeEmail(metadataString(metadata, "application_email"));
  const productPackage = normalizeProductPackageKey(metadataString(metadata, "product_package"));
  const expiresAt = metadataString(metadata, "approval_expires_at");
  const termsVersion = metadataString(metadata, "offer_terms_version");

  if (
    row.status !== "active" ||
    application.status !== "approved" ||
    applicationId !== application.id ||
    email !== normalizeEmail(application.email) ||
    !productPackage ||
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
  if (!expiresAt || Number.isNaN(expires.getTime())) {
    throw new Error("Early Access approval is invalid.");
  }
  if (options.requireApprovalWindow !== false && expires.getTime() <= Date.now()) {
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

async function loadApplication(applicationId: string): Promise<ApplicationRow> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("early_access_applications")
    .select("id, email, company_name, product_package, offer_terms_version, status")
    .eq("id", applicationId)
    .maybeSingle<ApplicationRow>();
  if (error) throw new Error(`Failed to load Early Access application: ${error.message}`);
  if (!data) throw new Error("This Early Access application no longer exists.");
  return data;
}

async function loadVerifiedActiveGrantById(grantId: string): Promise<{
  row: GrantRow;
  metadata: JsonObject;
  contract: EarlyAccessGrant;
}> {
  const admin = createAdminSupabase();
  const { data: grant, error: grantError } = await admin
    .from("billing_discount_grants")
    .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
    .eq("id", grantId)
    .maybeSingle<GrantRow>();
  if (grantError || !grant) throw new Error("Early Access discount grant could not be verified.");
  if (grant.status !== "active") throw new Error("Early Access discount grant is no longer active.");

  const metadata = metadataObject(grant.metadata);
  const applicationId = metadataString(metadata, "application_id");
  if (!applicationId) throw new Error("Early Access discount grant is invalid.");
  const application = await loadApplication(applicationId);
  const contract = assertGrantContract(grant, application, { requireApprovalWindow: false });
  return { row: grant, metadata, contract };
}

export async function approveEarlyAccessDiscount(input: {
  applicationId: string;
  actorAuthUserId: string;
  actorProfileId: string;
}): Promise<ApprovedEarlyAccessGrant> {
  const admin = createAdminSupabase();
  const application = await loadApplication(input.applicationId);
  const issued = createApprovalToken();

  if (application.status === "approved") {
    const { data: grants, error: grantError } = await admin
      .from("billing_discount_grants")
      .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
      .eq("status", "active")
      .eq("metadata->>purpose", "early_access")
      .eq("metadata->>application_id", application.id)
      .order("created_at", { ascending: false })
      .limit(2)
      .returns<GrantRow[]>();
    if (grantError) throw new Error(`Failed to load Early Access discount grant: ${grantError.message}`);
    if ((grants?.length ?? 0) !== 1 || !grants?.[0]) {
      throw new Error("This approved application does not have exactly one active Early Access grant to reissue.");
    }

    const existing = grants[0];
    const existingMetadata = metadataObject(existing.metadata);
    const { data: rotated, error: rotateError } = await admin
      .from("billing_discount_grants")
      .update({
        metadata: {
          ...existingMetadata,
          approval_token_hash: issued.approvalTokenHash,
          approval_expires_at: issued.expiresAt,
          token_reissue_count: metadataNumber(existingMetadata, "token_reissue_count") + 1,
          token_reissued_at: new Date().toISOString(),
          token_reissued_by_auth_user_id: input.actorAuthUserId,
          token_reissued_by_profile_id: input.actorProfileId,
        },
      })
      .eq("id", existing.id)
      .eq("status", "active")
      .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
      .maybeSingle<GrantRow>();
    if (rotateError || !rotated) {
      throw new Error(`Failed to reissue Early Access approval link: ${rotateError?.message ?? "grant unavailable"}`);
    }

    return {
      ...assertGrantContract(rotated, application),
      token: issued.token,
      reissued: true,
    };
  }

  if (application.status !== "pending") {
    throw new Error("This Early Access application has already been reviewed or is no longer eligible for approval.");
  }

  const email = normalizeEmail(application.email);
  const metadata = {
    purpose: "early_access",
    application_id: application.id,
    application_email: email,
    product_package: application.product_package,
    approval_token_hash: issued.approvalTokenHash,
    approval_expires_at: issued.expiresAt,
    offer_terms_version: application.offer_terms_version,
    pricing_model: PRODUCT_PACKAGE_BILLING_MODEL,
    trial_days: EARLY_ACCESS_TRIAL_DAYS,
    approved_auth_user_id: input.actorAuthUserId,
    approved_profile_id: input.actorProfileId,
    token_reissue_count: 0,
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
      approved_by: input.actorAuthUserId,
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
      reviewed_by: input.actorProfileId,
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
    token: issued.token,
    reissued: false,
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
    const checkoutStarted = Boolean(metadataString(metadata, "checkout_session_id"));
    if (!checkoutStarted) {
      await admin.from("billing_discount_grants").update({ status: "expired" }).eq("id", grant.id).eq("status", "active");
    }
    throw new Error("Early Access approval has expired.");
  }

  const application = await loadApplication(applicationId);
  return assertGrantContract(grant, application);
}

export async function attachEarlyAccessCheckout(input: {
  grantId: string;
  stripeCouponId: string;
  stripeCustomerId: string;
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
  const { data: updated, error } = await admin
    .from("billing_discount_grants")
    .update({
      stripe_coupon_id: input.stripeCouponId,
      metadata: {
        ...metadata,
        stripe_customer_id: input.stripeCustomerId,
        checkout_session_id: input.checkoutSessionId,
        acquisition_intent_id: input.acquisitionIntentId,
        checkout_started_at: new Date().toISOString(),
      },
    })
    .eq("id", input.grantId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    throw new Error(`Failed to attach Early Access checkout: ${error?.message ?? "grant unavailable"}`);
  }
}

export async function validateEarlyAccessCheckoutBeforeClaim(input: {
  grantId: string;
  checkoutEmail: string;
  packageKey: ProductPackageKey;
  checkoutSessionId: string;
  stripeCustomerId: string;
}): Promise<void> {
  const { metadata } = await loadVerifiedActiveGrantById(input.grantId);
  const expectedEmail = normalizeEmail(metadataString(metadata, "application_email"));
  const expectedPackage = normalizeProductPackageKey(metadataString(metadata, "product_package"));
  const expectedSession = metadataString(metadata, "checkout_session_id");
  const expectedCustomer = metadataString(metadata, "stripe_customer_id");

  if (
    !expectedEmail ||
    expectedEmail !== normalizeEmail(input.checkoutEmail) ||
    !expectedPackage ||
    expectedPackage !== input.packageKey ||
    !expectedSession ||
    expectedSession !== input.checkoutSessionId ||
    !expectedCustomer ||
    expectedCustomer !== input.stripeCustomerId
  ) {
    throw new Error("Early Access checkout identity does not match the approved grant.");
  }
}

export async function deferEarlyAccessGrantShopBinding(input: {
  grantId: string;
  userId: string;
  checkoutEmail: string;
  packageKey: ProductPackageKey;
  checkoutSessionId: string;
  stripeCustomerId: string;
  subscriptionId: string;
}): Promise<void> {
  await validateEarlyAccessCheckoutBeforeClaim(input);
  const { metadata } = await loadVerifiedActiveGrantById(input.grantId);
  const admin = createAdminSupabase();
  const { data: updated, error } = await admin
    .from("billing_discount_grants")
    .update({
      metadata: {
        ...metadata,
        pending_user_id: input.userId,
        pending_checkout_email: normalizeEmail(input.checkoutEmail),
        pending_product_package: input.packageKey,
        checkout_session_id: input.checkoutSessionId,
        stripe_customer_id: input.stripeCustomerId,
        subscription_id: input.subscriptionId,
        pending_shop_binding_at: new Date().toISOString(),
      },
    })
    .eq("id", input.grantId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    throw new Error(`Failed to defer Early Access shop binding: ${error?.message ?? "grant unavailable"}`);
  }
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
  const expectedPackage = normalizeProductPackageKey(metadataString(metadata, "product_package"));
  const expectedSession = metadataString(metadata, "checkout_session_id");

  if (
    !expectedEmail ||
    expectedEmail !== normalizeEmail(input.checkoutEmail) ||
    !expectedPackage ||
    expectedPackage !== input.packageKey ||
    !expectedSession ||
    expectedSession !== input.checkoutSessionId
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
        pending_user_id: null,
        pending_shop_binding_completed_at: new Date().toISOString(),
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

export async function bindPendingEarlyAccessGrantToShop(input: {
  userId: string;
  shopId: string;
}): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data: grants, error: grantsError } = await admin
    .from("billing_discount_grants")
    .select("id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata")
    .eq("status", "active")
    .eq("metadata->>purpose", "early_access")
    .eq("metadata->>pending_user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(2)
    .returns<GrantRow[]>();
  if (grantsError) throw new Error(`Failed to load pending Early Access grant: ${grantsError.message}`);
  if (!grants?.length) return false;
  if (grants.length !== 1) throw new Error("More than one active Early Access grant is awaiting this owner shop binding.");

  const grant = grants[0];
  const metadata = metadataObject(grant.metadata);
  const checkoutEmail = metadataString(metadata, "pending_checkout_email");
  const packageKey = normalizeProductPackageKey(metadataString(metadata, "pending_product_package"));
  const checkoutSessionId = metadataString(metadata, "checkout_session_id");
  const subscriptionId = metadataString(metadata, "subscription_id");
  if (!checkoutEmail || !packageKey || !checkoutSessionId || !subscriptionId) {
    throw new Error("Pending Early Access grant is missing checkout identity.");
  }

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("owner_id, stripe_subscription_id")
    .eq("id", input.shopId)
    .maybeSingle<{ owner_id: string | null; stripe_subscription_id: string | null }>();
  if (shopError || !shop || shop.owner_id !== input.userId || shop.stripe_subscription_id !== subscriptionId) {
    throw new Error("Pending Early Access grant does not match the canonical owner shop billing identity.");
  }

  await redeemEarlyAccessGrantAfterClaim({
    grantId: grant.id,
    shopId: input.shopId,
    checkoutEmail,
    packageKey,
    checkoutSessionId,
    subscriptionId,
  });
  return true;
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
