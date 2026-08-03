import { DEFAULT_DOCUMENT_REQUIREMENTS, type RequiredDocType, type RequirementRule } from "./documentRequirementsDefaults";
import {
  addScheduleDateKeyDays,
  isValidScheduleDateKey,
} from "@/features/workforce/lib/scheduleValidation";

type WorkforcePerson = {
  id: string;
  full_name: string | null;
  email?: string | null;
  workforce_role: string | null;
  workforce_category: string | null;
  employment_status: string | null;
};

type WorkforceDocument = {
  id: string;
  user_id: string;
  doc_type: string | null;
  status: string | null;
  expires_at: string | null;
  uploaded_at: string | null;
};

export type PersonReadiness = "missing_required" | "expired_required" | "needs_review" | "expiring_soon" | "ready";
export type DocumentExpirationState =
  | "none"
  | "expired"
  | "expiring_soon"
  | "current";

const ACCEPTED_STATUSES = new Set(["active", "approved", "accepted"]);
const REVIEW_STATUSES = new Set(["received", "pending", "review", "needs_review"]);
const ACTIVE_EMPLOYMENT = new Set(["active"]);

const normalize = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

const expirationDateKey = (
  value: string | null | undefined,
): string | null => {
  const dateKey = typeof value === "string" ? value.slice(0, 10) : "";
  return isValidScheduleDateKey(dateKey) ? dateKey : null;
};

export function classifyDocumentExpiration({
  expiresAt,
  todayDateKey,
  warningDays,
}: {
  expiresAt: string | null | undefined;
  todayDateKey: string;
  warningDays: number;
}): DocumentExpirationState {
  const expiryDateKey = expirationDateKey(expiresAt);
  if (!expiryDateKey || !isValidScheduleDateKey(todayDateKey)) return "none";

  if (expiryDateKey < todayDateKey) return "expired";
  const warningDateKey = addScheduleDateKeyDays(
    todayDateKey,
    Math.max(0, Math.trunc(warningDays)),
  );
  return expiryDateKey <= warningDateKey ? "expiring_soon" : "current";
}

const docTypeLabel: Record<RequiredDocType, string> = {
  drivers_license: "Driver's License",
  certification: "Certification",
  tax_form: "Tax Form",
  other: "Other",
};

function getRequirementsForPerson(person: WorkforcePerson, requirements: RequirementRule[]): RequirementRule[] {
  const role = normalize(person.workforce_role);
  const category = normalize(person.workforce_category);

  const matched = requirements.filter((requirement) => {
    if (!requirement.required) return false;
    const reqRole = normalize(requirement.workforceRole);
    const reqCategory = normalize(requirement.workforceCategory);

    if (!reqRole && !reqCategory) return true;
    if (reqRole && reqRole === role) return true;
    return !!reqCategory && reqCategory === category;
  });

  const dedup = new Map<RequiredDocType, RequirementRule>();
  for (const rule of matched) {
    if (!dedup.has(rule.docType)) dedup.set(rule.docType, rule);
  }

  return Array.from(dedup.values());
}

export function buildDocumentRequirementsReadiness({
  people,
  documents,
  requirements = DEFAULT_DOCUMENT_REQUIREMENTS,
  warningDays = 30,
  todayDateKey = new Date().toISOString().slice(0, 10),
}: {
  people: WorkforcePerson[];
  documents: WorkforceDocument[];
  requirements?: RequirementRule[];
  warningDays?: number;
  todayDateKey?: string;
}) {
  const docsByUser = new Map<string, WorkforceDocument[]>();
  for (const doc of documents) {
    const userDocs = docsByUser.get(doc.user_id) ?? [];
    userDocs.push(doc);
    docsByUser.set(doc.user_id, userDocs);
  }

  const activePeople = people.filter((person) => ACTIVE_EMPLOYMENT.has(normalize(person.employment_status)));

  const readinessItems = activePeople.map((person) => {
    const neededRules = getRequirementsForPerson(person, requirements);
    const userDocs = docsByUser.get(person.id) ?? [];

    const missingDocTypes: RequiredDocType[] = [];
    const expiredDocTypes: RequiredDocType[] = [];
    const expiringDocTypes: RequiredDocType[] = [];
    const needsReviewDocTypes: RequiredDocType[] = [];

    for (const rule of neededRules) {
      const docsForType = userDocs.filter((doc) => normalize(doc.doc_type) === rule.docType);
      const accepted = docsForType.filter((doc) => ACCEPTED_STATUSES.has(normalize(doc.status)));
      const review = docsForType.filter((doc) => REVIEW_STATUSES.has(normalize(doc.status)));

      if (accepted.length === 0) {
        if (review.length > 0) needsReviewDocTypes.push(rule.docType);
        else missingDocTypes.push(rule.docType);
        continue;
      }

      if (rule.expiresRequired) {
        const acceptedWithDateKey = accepted
          .map((doc) => ({
            doc,
            dateKey: expirationDateKey(doc.expires_at),
          }))
          .filter(
            (
              item,
            ): item is { doc: WorkforceDocument; dateKey: string } =>
              item.dateKey !== null,
          );

        if (acceptedWithDateKey.length === 0) {
          missingDocTypes.push(rule.docType);
          continue;
        }

        const bestAccepted = acceptedWithDateKey.sort((a, b) =>
          b.dateKey.localeCompare(a.dateKey),
        )[0];
        const expirationState = classifyDocumentExpiration({
          expiresAt: bestAccepted.dateKey,
          todayDateKey,
          warningDays: rule.warningDays ?? warningDays,
        });
        if (expirationState === "expired") {
          expiredDocTypes.push(rule.docType);
        } else if (expirationState === "expiring_soon") {
          expiringDocTypes.push(rule.docType);
        }
      }
    }

    let readiness: PersonReadiness = "ready";
    if (missingDocTypes.length > 0) readiness = "missing_required";
    else if (expiredDocTypes.length > 0) readiness = "expired_required";
    else if (needsReviewDocTypes.length > 0) readiness = "needs_review";
    else if (expiringDocTypes.length > 0) readiness = "expiring_soon";

    return {
      personId: person.id,
      personName: person.full_name ?? person.email ?? "Unknown person",
      personEmail: person.email ?? null,
      workforceRole: person.workforce_role,
      workforceCategory: person.workforce_category,
      readiness,
      missingDocTypes,
      expiredDocTypes,
      expiringDocTypes,
      needsReviewDocTypes,
      href: `/dashboard/workforce/people/${person.id}?focus=documents`,
      requiredDocTypes: neededRules.map((rule) => ({
        docType: rule.docType,
        label: rule.label || docTypeLabel[rule.docType],
      })),
    };
  });

  const summary = {
    activePeople: activePeople.length,
    ready: readinessItems.filter((item) => item.readiness === "ready").length,
    missingRequired: readinessItems.filter((item) => item.readiness === "missing_required").length,
    expiredRequired: readinessItems.filter((item) => item.readiness === "expired_required").length,
    needsReview: readinessItems.filter((item) => item.readiness === "needs_review").length,
    expiringSoon: readinessItems.filter((item) => item.readiness === "expiring_soon").length,
  };

  const missingByPerson = readinessItems
    .filter((item) => item.missingDocTypes.length > 0)
    .map((item) => ({ personId: item.personId, personName: item.personName, missingDocTypes: item.missingDocTypes, href: item.href }));

  const missingCounts = new Map<RequiredDocType, number>();
  for (const item of readinessItems) {
    for (const docType of item.missingDocTypes) {
      missingCounts.set(docType, (missingCounts.get(docType) ?? 0) + 1);
    }
  }

  const missingByDocType = Array.from(missingCounts.entries()).map(([docType, count]) => ({ docType, label: docTypeLabel[docType], count }));

  const expiringRequired = readinessItems
    .filter((item) => item.expiredDocTypes.length > 0 || item.expiringDocTypes.length > 0)
    .map((item) => ({
      personId: item.personId,
      personName: item.personName,
      expiredDocTypes: item.expiredDocTypes,
      expiringDocTypes: item.expiringDocTypes,
      href: item.href,
    }));

  return { requirements, readinessItems, missingByPerson, missingByDocType, expiringRequired, summary };
}
