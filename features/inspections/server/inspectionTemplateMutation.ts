import type { Json } from "@shared/types/types/supabase";

const MAX_TEMPLATE_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_VEHICLE_TYPE_LENGTH = 64;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 64;
const MAX_SECTION_COUNT = 64;
const MAX_SECTION_TITLE_LENGTH = 160;
const MAX_ITEMS_PER_SECTION = 256;
const MAX_TOTAL_ITEMS = 2_000;
const MAX_ITEM_LABEL_LENGTH = 500;
const MAX_SECTIONS_JSON_LENGTH = 500_000;
const MAX_LABOR_HOURS = 999.99;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ValidInspectionTemplateMutation = {
  templateName: string;
  sections: Json;
  description: string | null;
  vehicleType: string | null;
  tags: string[] | null;
  laborHours: number | null;
};

export type InspectionTemplateMutationValidation =
  | { ok: true; value: ValidInspectionTemplateMutation }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoundedString(
  value: unknown,
  label: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be text.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${label} must be ${maxLength} characters or fewer.`,
    };
  }
  return { ok: true, value: trimmed || null };
}

export function isInspectionTemplateId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * Validate the canonical inspection shape without rebuilding it. Keeping the
 * original objects intact preserves runner metadata such as field types,
 * units, notes, parts, and future item attributes.
 */
export function validateInspectionTemplateMutation(
  input: unknown,
): InspectionTemplateMutationValidation {
  if (!isRecord(input)) {
    return { ok: false, error: "Invalid inspection template payload." };
  }

  if (typeof input.templateName !== "string") {
    return { ok: false, error: "Template name is required." };
  }
  const templateName = input.templateName.trim();
  if (!templateName) {
    return { ok: false, error: "Template name is required." };
  }
  if (templateName.length > MAX_TEMPLATE_NAME_LENGTH) {
    return {
      ok: false,
      error: `Template name must be ${MAX_TEMPLATE_NAME_LENGTH} characters or fewer.`,
    };
  }

  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    return {
      ok: false,
      error: "At least one inspection section is required.",
    };
  }
  if (input.sections.length > MAX_SECTION_COUNT) {
    return {
      ok: false,
      error: `Inspection templates support up to ${MAX_SECTION_COUNT} sections.`,
    };
  }

  let totalItems = 0;
  for (const [sectionIndex, section] of input.sections.entries()) {
    if (!isRecord(section)) {
      return {
        ok: false,
        error: `Section ${sectionIndex + 1} must be an object.`,
      };
    }
    const title = typeof section.title === "string" ? section.title.trim() : "";
    if (!title) {
      return {
        ok: false,
        error: `Section ${sectionIndex + 1} needs a title.`,
      };
    }
    if (title.length > MAX_SECTION_TITLE_LENGTH) {
      return {
        ok: false,
        error: `Section ${sectionIndex + 1} title is too long.`,
      };
    }
    if (!Array.isArray(section.items) || section.items.length === 0) {
      return {
        ok: false,
        error: `Section ${sectionIndex + 1} needs at least one item.`,
      };
    }
    if (section.items.length > MAX_ITEMS_PER_SECTION) {
      return {
        ok: false,
        error: `Section ${sectionIndex + 1} supports up to ${MAX_ITEMS_PER_SECTION} items.`,
      };
    }

    totalItems += section.items.length;
    if (totalItems > MAX_TOTAL_ITEMS) {
      return {
        ok: false,
        error: `Inspection templates support up to ${MAX_TOTAL_ITEMS} total items.`,
      };
    }

    for (const [itemIndex, item] of section.items.entries()) {
      if (!isRecord(item)) {
        return {
          ok: false,
          error: `Item ${itemIndex + 1} in section ${sectionIndex + 1} must be an object.`,
        };
      }
      const label = typeof item.item === "string" ? item.item.trim() : "";
      if (!label) {
        return {
          ok: false,
          error: `Item ${itemIndex + 1} in section ${sectionIndex + 1} needs a label.`,
        };
      }
      if (label.length > MAX_ITEM_LABEL_LENGTH) {
        return {
          ok: false,
          error: `Item ${itemIndex + 1} in section ${sectionIndex + 1} is too long.`,
        };
      }
    }
  }

  if (JSON.stringify(input.sections).length > MAX_SECTIONS_JSON_LENGTH) {
    return {
      ok: false,
      error: "Inspection template content is too large.",
    };
  }

  const description = optionalBoundedString(
    input.description,
    "Description",
    MAX_DESCRIPTION_LENGTH,
  );
  if (!description.ok) return description;

  const vehicleType = optionalBoundedString(
    input.vehicleType,
    "Vehicle type",
    MAX_VEHICLE_TYPE_LENGTH,
  );
  if (!vehicleType.ok) return vehicleType;

  let tags: string[] | null = null;
  if (input.tags != null) {
    if (!Array.isArray(input.tags) || input.tags.length > MAX_TAG_COUNT) {
      return {
        ok: false,
        error: `Tags must be an array with no more than ${MAX_TAG_COUNT} entries.`,
      };
    }
    tags = [];
    for (const tag of input.tags) {
      if (typeof tag !== "string" || !tag.trim()) {
        return { ok: false, error: "Tags must contain nonempty text values." };
      }
      const trimmed = tag.trim();
      if (trimmed.length > MAX_TAG_LENGTH) {
        return {
          ok: false,
          error: `Tags must be ${MAX_TAG_LENGTH} characters or fewer.`,
        };
      }
      tags.push(trimmed);
    }
  }

  let laborHours: number | null = null;
  if (input.laborHours != null && input.laborHours !== "") {
    if (
      typeof input.laborHours !== "number" ||
      !Number.isFinite(input.laborHours) ||
      input.laborHours < 0 ||
      input.laborHours > MAX_LABOR_HOURS
    ) {
      return {
        ok: false,
        error: `Labor hours must be between 0 and ${MAX_LABOR_HOURS}.`,
      };
    }
    laborHours = input.laborHours;
  }

  return {
    ok: true,
    value: {
      templateName,
      sections: input.sections as Json,
      description: description.value,
      vehicleType: vehicleType.value,
      tags,
      laborHours,
    },
  };
}
