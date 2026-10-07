import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
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
const ATTEMPT_NAMESPACE_PATTERN = /^[0-9a-f]{32}$/;

type JsonObject = Record<string, unknown>;
type RpcError = { message: string; code?: string | null };
type EarlyAccessRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

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

type IssueGrantRow = {
  grant_id: string;
  reissued: boolean;
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
  checkoutAttemptNamespace: string;
};

export type ApprovedEarlyAccessGrant = EarlyAccessGrant & {
  token: string;
  reissued: boolean;
};

function rpcClient(admin: ReturnType<typeof createAdminSupabase>): EarlyAccessRpcClient {
  return admin as unknown as EarlyAccessRpcClient;
}

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

function createApprovalMaterial() {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + EARLY_ACCESS_APPROVAL_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    token,
    approvalTokenHash: tokenHash(token),
    expiresAt,
    checkoutAttemptNamespace: randomBytes(16).toString("hex"),
  };
}

function assertGrantContract(
  row: GrantRow,
  application: ApplicationRow,
  options: { requireApprovalWindow?: boolean } = {},
): EarlyAccessGrant {
  const metadata = metadataObject(row.metadata);
  const applicationId = metadataString(metadata, "application_id");
  const email = normalizeEmail(metadataString(metadata, "application_email"));
  const productPackage = normalizeProductPackageKey(
    metadataString(metadata, "product_package"),
  );
  const expiresAt = metadataString(metadata, "approval_expires_at");
  const termsVersion = metadataString(metadata, "offer_terms_version");
  const checkoutAttemptNamespace = metadataString(
    metadata,
    "checkout_attempt_namespace",
  );

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
    row.duration_in_months !== EARLY_ACCESS_DURATION_MONTHS ||
    !ATTEMPT_NAMESPACE_PATTERN.test(checkoutAttemptNamespace)
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
    checkoutAttemptNamespace,
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

async function loadActiveGrantForApplication(applicationId: string): Promise<GrantRow> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("billing_discount_grants")
    .select(
      "id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata",
    )
    .eq("status", "active")
    .eq("metadata->>purpose", "early_access")
    .eq("metadata->>application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(2)
    .returns<GrantRow[]>();
  if (error) throw new Error(`Failed to load Early Access discount grant: ${error.message}`);
  if ((data?.length ?? 0) !== 1 || !data?.[0]) {
    throw new Error("This approved application does not have exactly one active Early Access grant.");
  }
  return data[0];
}

async function loadVerifiedActiveGrantById(grantId: string): Promise<{
  row: GrantRow;
  metadata: JsonObject;
  contract: EarlyAccessGrant;
}> {
  const admin = createAdminSupabase();
  const { data: grant, error: grantError } = await admin
    .from("billing_discount_grants")
    .select(
      "id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata",
    )
    .eq("id", grantId)
    .maybeSingle<GrantRow>();
  if (grantError || !grant) {
    throw new Error("Early Access discount grant could not be verified.");
  }
  if (grant.status !== "active") {
    throw new Error("Early Access discount grant is no longer active.");
  }

  const metadata = metadataObject(grant.metadata);
  const applicationId = metadataString(metadata, "application_id");
  if (!applicationId) throw new Error("Early Access discount grant is invalid.");
  const application = await loadApplication(applicationId);
  const contract = assertGrantContract(grant, application, {
    requireApprovalWindow: false,
  });
  return { row: grant, metadata, contract };
}

export async function approveEarlyAccessDiscount(input: {
  applicationId: string;
  actorAuthUserId: string;
  actorProfileId: string;
}): Promise<ApprovedEarlyAccessGrant> {
  const admin = createAdminSupabase();
  const application = await loadApplication(input.applicationId);
  const issued = createApprovalMaterial();
  const reissue = application.status === "approved";

  if (!reissue && application.status !== "pending") {
    throw new Error(
      "This Early Access application has already been reviewed or is no longer eligible for approval.",
    );
  }

  let expectedReissueCount = 0;
  if (reissue) {
    const existing = await loadActiveGrantForApplication(application.id);
    expectedReissueCount = metadataNumber(
      metadataObject(existing.metadata),
      "token_reissue_count",
    );
  }

  const { data, error } = await rpcClient(admin).rpc(
    "issue_early_access_discount_grant_atomic",
    {
      p_application_id: application.id,
      p_actor_auth_user_id: input.actorAuthUserId,
      p_actor_profile_id: input.actorProfileId,
      p_approval_token_hash: issued.approvalTokenHash,
      p_approval_expires_at: issued.expiresAt,
      p_checkout_attempt_namespace: issued.checkoutAttemptNamespace,
      p_reissue: reissue,
      p_expected_reissue_count: expectedReissueCount,
    },
  );
  if (error) {
    throw new Error(`Failed to issue Early Access approval: ${error.message}`);
  }

  const row = Array.isArray(data)
    ? (data[0] as IssueGrantRow | undefined)
    : undefined;
  if (!row?.grant_id) {
    throw new Error("Failed to issue Early Access approval: empty result");
  }

  const { data: grant, error: grantError } = await admin
    .from("billing_discount_grants")
    .select(
      "id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata",
    )
    .eq("id", row.grant_id)
    .maybeSingle<GrantRow>();
  if (grantError || !grant) {
    throw new Error(
      `Failed to load issued Early Access grant: ${grantError?.message ?? "empty result"}`,
    );
  }

  return {
    ...assertGrantContract(grant, { ...application, status: "approved" }),
    token: issued.token,
    reissued: row.reissued === true,
  };
}

export async function findEarlyAccessGrantByToken(
  token: string,
): Promise<EarlyAccessGrant> {
  if (!validToken(token)) {
    throw new Error("Early Access approval link is invalid.");
  }

  const admin = createAdminSupabase();
  const approvalTokenHash = tokenHash(token);
  const { data: grant, error: grantError } = await admin
    .from("billing_discount_grants")
    .select(
      "id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata",
    )
    .eq("status", "active")
    .eq("metadata->>purpose", "early_access")
    .eq("metadata->>approval_token_hash", approvalTokenHash)
    .maybeSingle<GrantRow>();

  if (grantError) {
    throw new Error(`Early Access approval lookup failed: ${grantError.message}`);
  }
  if (!grant) {
    throw new Error("Early Access approval link is invalid or has already been used.");
  }

  const metadata = metadataObject(grant.metadata);
  const applicationId = metadataString(metadata, "application_id");
  if (!applicationId) throw new Error("Early Access approval link is invalid.");

  const expiresAt = metadataString(metadata, "approval_expires_at");
  const expires = new Date(expiresAt);
  if (!expiresAt || Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    const checkoutStarted = Boolean(
      metadataString(metadata, "checkout_session_id"),
    );
    if (!checkoutStarted) {
      await admin
        .from("billing_discount_grants")
        .update({ status: "expired" })
        .eq("id", grant.id)
        .eq("status", "active");
    }
    throw new Error("Early Access approval has expired.");
  }

  const application = await loadApplication(applicationId);
  return assertGrantContract(grant, application);
}

export async function attachEarlyAccessCheckout(input: {
  grantId: string;
  checkoutAttemptNamespace: string;
  stripeCouponId: string;
  stripeCustomerId: string;
  checkoutSessionId: string;
  acquisitionIntentId: string;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { data, error } = await rpcClient(admin).rpc(
    "attach_early_access_checkout_grant",
    {
      p_grant_id: input.grantId,
      p_checkout_attempt_namespace: input.checkoutAttemptNamespace,
      p_stripe_coupon_id: input.stripeCouponId,
      p_stripe_customer_id: input.stripeCustomerId,
      p_checkout_session_id: input.checkoutSessionId,
      p_acquisition_intent_id: input.acquisitionIntentId,
    },
  );
  if (error || data !== true) {
    throw new Error(
      `Failed to attach Early Access checkout: ${error?.message ?? "grant unavailable"}`,
    );
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
  const expectedEmail = normalizeEmail(
    metadataString(metadata, "application_email"),
  );
  const expectedPackage = normalizeProductPackageKey(
    metadataString(metadata, "product_package"),
  );
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
    throw new Error(
      "Early Access checkout identity does not match the approved grant.",
    );
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
  const { metadata, contract } = await loadVerifiedActiveGrantById(input.grantId);
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
    .eq("metadata->>checkout_attempt_namespace", contract.checkoutAttemptNamespace)
    .eq("metadata->>checkout_session_id", input.checkoutSessionId)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    throw new Error(
      `Failed to defer Early Access shop binding: ${error?.message ?? "grant unavailable"}`,
    );
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
    .select(
      "id, shop_id, stripe_coupon_id, percent_off, duration, duration_in_months, status, terms_version, metadata",
    )
    .eq("id", input.grantId)
    .maybeSingle<GrantRow>();

  if (loadError || !grant) {
    throw new Error("Early Access discount grant could not be verified.");
  }
  if (grant.status === "redeemed" && grant.shop_id === input.shopId) return;
  if (grant.status !== "active") {
    throw new Error("Early Access discount grant is no longer active.");
  }

  const metadata = metadataObject(grant.metadata);
  const applicationId = metadataString(metadata, "application_id");
  const application = await loadApplication(applicationId);
  const contract = assertGrantContract(grant, application, {
    requireApprovalWindow: false,
  });
  const expectedEmail = normalizeEmail(
    metadataString(metadata, "application_email"),
  );
  const expectedPackage = normalizeProductPackageKey(
    metadataString(metadata, "product_package"),
  );
  const expectedSession = metadataString(metadata, "checkout_session_id");

  if (
    !expectedEmail ||
    expectedEmail !== normalizeEmail(input.checkoutEmail) ||
    !expectedPackage ||
    expectedPackage !== input.packageKey ||
    !expectedSession ||
    expectedSession !== input.checkoutSessionId
  ) {
    throw new Error(
      "Early Access checkout identity does not match the approved grant.",
    );
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
    .eq("metadata->>checkout_attempt_namespace", contract.checkoutAttemptNamespace)
    .eq("metadata->>checkout_session_id", input.checkoutSessionId)
    .select("id")
    .maybeSingle();

  if (error || !redeemed) {
    throw new Error(
      `Failed to redeem Early Access discount grant: ${error?.message ?? "grant already consumed"}`,
    );
  }
}

export async function bindPendingEarlyAccessGrantToShop(input: {
  userId: string;
  shopId: string;
}): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await rpcClient(admin).rpc(
    "bind_pending_early_access_discount_grant",
    {
      p_user_id: input.userId,
      p_shop_id: input.shopId,
    },
  );
  if (error) {
    throw new Error(`Failed to bind pending Early Access grant: ${error.message}`);
  }
  return data === true;
}

export async function rearmExpiredEarlyAccessAcquisitionIntent(input: {
  grantId: string;
  userId: string;
  intentId: string;
  nonce: string;
  checkoutSessionId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  checkoutEmail: string;
}): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await rpcClient(admin).rpc(
    "rearm_expired_early_access_acquisition_intent",
    {
      p_grant_id: input.grantId,
      p_user_id: input.userId,
      p_intent_id: input.intentId,
      p_nonce: input.nonce,
      p_checkout_session_id: input.checkoutSessionId,
      p_customer_id: input.customerId,
      p_subscription_id: input.subscriptionId,
      p_stripe_price_id: input.priceId,
      p_checkout_email: input.checkoutEmail,
    },
  );
  if (error) {
    throw new Error(
      `Early Access acquisition recovery failed: ${error.message}`,
    );
  }
  return data === true;
}

export function earlyAccessGrantIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const value = String(metadata?.early_access_grant_id ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

export function earlyAccessSurface(packageKey: ProductPackageKey) {
  return productAcquisitionSurface(packageKey);
}
