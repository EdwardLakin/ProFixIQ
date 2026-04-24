import type { OwnerPinPurpose } from "@/features/shared/lib/server/owner-pin";
import {
  getOwnerPinCookieFromRequest,
  verifyOwnerPinToken,
} from "@/features/shared/lib/server/owner-pin";
import type { AiActorContext } from "./types";

export const AI_OWNER_PIN_PROOF_TYPE = "owner_pin_attestation" as const;

export const AI_OWNER_PIN_PROOF_PURPOSES = {
  ACTION_PREVIEW_HIGH_RISK: "ai_action_preview_high_risk",
  ACTION_APPROVAL_HIGH_RISK: "ai_action_approval_high_risk",
  ACTION_EXECUTION_FUTURE: "ai_action_execution_future",
} as const;

export type AiOwnerPinProofPurpose =
  (typeof AI_OWNER_PIN_PROOF_PURPOSES)[keyof typeof AI_OWNER_PIN_PROOF_PURPOSES];

const AI_OWNER_PIN_PROOF_PURPOSE_SET = new Set<AiOwnerPinProofPurpose>(
  Object.values(AI_OWNER_PIN_PROOF_PURPOSES),
);

const UNSAFE_PIN_FIELDS = new Set(["pin", "ownerPin", "owner_pin", "pin_hash", "owner_pin_hash", "token"]);

export type AiOwnerPinProofReference = {
  proofType: typeof AI_OWNER_PIN_PROOF_TYPE;
  shopId: string;
  actorId: string;
  purpose: AiOwnerPinProofPurpose;
  verifiedAt: string;
  expiresAt: string;
  verificationRef?: string;
  cookiePurpose?: OwnerPinPurpose;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateString(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function hasUnsafePinFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => UNSAFE_PIN_FIELDS.has(key));
}

export function isAiOwnerPinProofPurpose(value: unknown): value is AiOwnerPinProofPurpose {
  return typeof value === "string" && AI_OWNER_PIN_PROOF_PURPOSE_SET.has(value as AiOwnerPinProofPurpose);
}

export function isAiOwnerPinProofReference(value: unknown): value is AiOwnerPinProofReference {
  if (!isRecord(value) || hasUnsafePinFields(value)) return false;
  if (value.proofType !== AI_OWNER_PIN_PROOF_TYPE) return false;
  if (!isNonEmptyString(value.shopId)) return false;
  if (!isNonEmptyString(value.actorId)) return false;
  if (!isAiOwnerPinProofPurpose(value.purpose)) return false;
  if (!isNonEmptyString(value.verifiedAt) || !isIsoDateString(value.verifiedAt)) return false;
  if (!isNonEmptyString(value.expiresAt) || !isIsoDateString(value.expiresAt)) return false;

  if (value.verificationRef != null && !isNonEmptyString(value.verificationRef)) return false;
  if (value.cookiePurpose != null && !isNonEmptyString(value.cookiePurpose)) return false;

  return Date.parse(value.expiresAt) > Date.now();
}

export function parseAiOwnerPinProofReference(value: unknown): AiOwnerPinProofReference | null {
  if (!isAiOwnerPinProofReference(value)) return null;
  return {
    proofType: AI_OWNER_PIN_PROOF_TYPE,
    shopId: value.shopId,
    actorId: value.actorId,
    purpose: value.purpose,
    verifiedAt: value.verifiedAt,
    expiresAt: value.expiresAt,
    verificationRef: value.verificationRef,
    cookiePurpose: value.cookiePurpose,
  };
}

export function assertAiOwnerPinProofReference(
  value: unknown,
  args?: { expectedShopId?: string; expectedActorId?: string; expectedPurpose?: AiOwnerPinProofPurpose },
): AiOwnerPinProofReference {
  const parsed = parseAiOwnerPinProofReference(value);
  if (!parsed) {
    throw new Error("invalid owner PIN proof reference");
  }
  if (args?.expectedShopId && parsed.shopId !== args.expectedShopId) {
    throw new Error("owner PIN proof reference shop mismatch");
  }
  if (args?.expectedActorId && parsed.actorId !== args.expectedActorId) {
    throw new Error("owner PIN proof reference actor mismatch");
  }
  if (args?.expectedPurpose && parsed.purpose !== args.expectedPurpose) {
    throw new Error("owner PIN proof reference purpose mismatch");
  }
  return parsed;
}

export function buildAiOwnerPinProofReference(input: AiOwnerPinProofReference): AiOwnerPinProofReference {
  return assertAiOwnerPinProofReference(input, {
    expectedShopId: input.shopId,
    expectedActorId: input.actorId,
    expectedPurpose: input.purpose,
  });
}

export function validateAiOwnerPinProofForRequest(input: {
  request: Request;
  actorContext: Pick<AiActorContext, "shopId" | "actorId">;
  requiredPurpose: AiOwnerPinProofPurpose;
  allowedCookiePurposes?: ReadonlyArray<OwnerPinPurpose>;
}): AiOwnerPinProofReference | null {
  const cookieToken = getOwnerPinCookieFromRequest(input.request);
  if (!cookieToken) return null;

  const verification = verifyOwnerPinToken(cookieToken);
  if (!verification.ok) return null;

  if (
    verification.claims.shop_id !== input.actorContext.shopId ||
    verification.claims.sub !== input.actorContext.actorId
  ) {
    return null;
  }

  const allowedCookiePurposes = input.allowedCookiePurposes;
  if (allowedCookiePurposes && !allowedCookiePurposes.includes(verification.claims.purpose)) {
    return null;
  }

  const verifiedAtIso = new Date(verification.claims.iat * 1000).toISOString();
  const expiresAtIso = new Date(verification.claims.exp * 1000).toISOString();

  return {
    proofType: AI_OWNER_PIN_PROOF_TYPE,
    shopId: verification.claims.shop_id,
    actorId: verification.claims.sub,
    purpose: input.requiredPurpose,
    verifiedAt: verifiedAtIso,
    expiresAt: expiresAtIso,
    verificationRef: `${verification.claims.sub}:${verification.claims.shop_id}:${verification.claims.iat}:${verification.claims.exp}`,
    cookiePurpose: verification.claims.purpose,
  };
}
