import type { ProFixIQStoryEvent } from "../types";

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function sanitizeSummary(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]")
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, "[redacted-vin]")
    .replace(/\b[A-Z0-9]{2,8}-[A-Z0-9]{1,8}\b/g, "[redacted-plate]")
    .replace(/\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/g, "[redacted-price]");
}

export function sanitizeProFixIQStoryEvent(
  input: ProFixIQStoryEvent
): ProFixIQStoryEvent {
  const redactions = new Set<string>(input.privacy.redactionsApplied ?? []);

  redactions.add("full_customer_name");
  redactions.add("phone");
  redactions.add("email");
  redactions.add("vin");
  redactions.add("license_plate");
  redactions.add("pricing");
  redactions.add("internal_notes");

  return {
    ...input,
    subject: {
      ...input.subject,
      customerLabel: input.subject.customerLabel
        ? input.subject.customerLabel.split(" ")[0]
        : "Customer",
      workOrderNumber: input.subject.workOrderNumber ?? null,
    },
    storyData: {
      ...input.storyData,
      summary: sanitizeSummary(input.storyData.summary),
      technicianSummary: sanitizeSummary(input.storyData.technicianSummary),
      services: (input.storyData.services ?? []).map((service) => ({
        label: sanitizeSummary(service.label) ?? "Service",
        kind: service.kind,
      })),
      findings: (input.storyData.findings ?? []).map((finding) => ({
        label: sanitizeSummary(finding.label) ?? "Finding",
        status: finding.status,
        category: finding.category ?? null,
      })),
      media: (input.storyData.media ?? [])
        .filter((media) => Boolean(media.url))
        .map((media) => ({
          ...media,
          title: sanitizeSummary(media.title),
        })),
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: Array.from(redactions),
    },
  };
}
