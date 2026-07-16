export const LEGAL_REVIEW_STATUS = "draft-counsel-review" as const;
export const LEGAL_VERSION = "2026-07-16-draft.1" as const;
export const LEGAL_DRAFT_DATE = "July 16, 2026" as const;

export const LEGAL_CONTACT = {
  operatingName: "ProFixIQ Technologies",
  jurisdiction: "Alberta, Canada",
  supportEmail: "support@profixiq.com",
  privacyOfficer: "Privacy Officer, ProFixIQ Technologies",
} as const;

export const LEGAL_DOCUMENTS = {
  terms: {
    type: "terms_of_service",
    slug: "terms",
    title: "SaaS Terms of Service",
    version: LEGAL_VERSION,
  },
  privacy: {
    type: "privacy_policy",
    slug: "privacy",
    title: "Privacy Policy",
    version: LEGAL_VERSION,
  },
  dpa: {
    type: "data_processing_addendum",
    slug: "data-processing-addendum",
    title: "Data Processing Addendum",
    version: LEGAL_VERSION,
  },
  acceptableUse: {
    type: "acceptable_use_policy",
    slug: "acceptable-use",
    title: "Acceptable Use Policy",
    version: LEGAL_VERSION,
  },
  cookies: {
    type: "cookie_notice",
    slug: "cookies",
    title: "Cookie Notice",
    version: LEGAL_VERSION,
  },
  portalTerms: {
    type: "portal_terms",
    slug: "portal-terms",
    title: "Customer, Fleet and Property Portal Terms",
    version: LEGAL_VERSION,
  },
  repairAuthorization: {
    type: "repair_authorization",
    slug: "repair-authorization",
    title: "Electronic Repair Authorization Terms",
    version: LEGAL_VERSION,
  },
  retention: {
    type: "retention_notice",
    slug: "retention",
    title: "Data Retention and Deletion Notice",
    version: LEGAL_VERSION,
  },
  subprocessors: {
    type: "subprocessor_notice",
    slug: "subprocessors",
    title: "Subprocessor List",
    version: LEGAL_VERSION,
  },
  support: {
    type: "support_policy",
    slug: "support",
    title: "Support, Cancellation and Security Contacts",
    version: LEGAL_VERSION,
  },
} as const;

export type LegalDocument =
  (typeof LEGAL_DOCUMENTS)[keyof typeof LEGAL_DOCUMENTS];
export type LegalDocumentType = LegalDocument["type"];

export const SHOP_SIGNUP_DOCUMENTS = [
  LEGAL_DOCUMENTS.terms,
  LEGAL_DOCUMENTS.privacy,
  LEGAL_DOCUMENTS.dpa,
] as const;

export const PORTAL_ACTIVATION_DOCUMENTS = [
  LEGAL_DOCUMENTS.portalTerms,
  LEGAL_DOCUMENTS.privacy,
] as const;

export function legalHref(document: Pick<LegalDocument, "slug">): string {
  return `/legal/${document.slug}`;
}

export function signupLegalMetadata() {
  return {
    accepted: true,
    surface: "shop_signup",
    documents: SHOP_SIGNUP_DOCUMENTS.map((document) => ({
      type: document.type,
      version: document.version,
    })),
  };
}
