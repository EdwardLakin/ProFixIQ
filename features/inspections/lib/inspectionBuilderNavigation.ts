export type InspectionBuilderSurface = "shop" | "field";

export type InspectionBuilderNavigation = {
  surface: InspectionBuilderSurface;
  templatesHref: string;
  newTemplateHref: string;
  reviewHref: (search?: string | URLSearchParams) => string;
  editHref: (templateId: string, templateName: string) => string;
  useTemplateHref: (templateId: string) => string;
  menuItemHref: (menuItemId: string) => string;
  mobileImport: boolean;
  supportsStandaloneRun: boolean;
};

export const FIELD_INSPECTION_TEMPLATE_PARAM = "templateId";

function withSearch(
  pathname: string,
  search?: string | URLSearchParams,
): string {
  const value =
    typeof search === "string"
      ? search.replace(/^\?/, "")
      : (search?.toString() ?? "");
  return value ? `${pathname}?${value}` : pathname;
}

export function getInspectionBuilderNavigation(
  surface: InspectionBuilderSurface = "shop",
): InspectionBuilderNavigation {
  if (surface === "field") {
    const base = "/mobile/service/inspection-builder";
    return {
      surface,
      templatesHref: base,
      newTemplateHref: `${base}/new`,
      reviewHref: (search) => withSearch(`${base}/review`, search),
      editHref: (templateId, templateName) => {
        const query = new URLSearchParams({
          templateId,
          template: templateName,
        });
        return withSearch(`${base}/review`, query);
      },
      useTemplateHref: (templateId) => {
        const query = new URLSearchParams({
          [FIELD_INSPECTION_TEMPLATE_PARAM]: templateId,
        });
        return withSearch("/mobile/work-orders", query);
      },
      menuItemHref: () => "/mobile/work-orders",
      mobileImport: true,
      supportsStandaloneRun: false,
    };
  }

  return {
    surface,
    templatesHref: "/inspections/templates",
    newTemplateHref: "/inspections/custom-inspection",
    reviewHref: (search) => withSearch("/inspections/custom-draft", search),
    editHref: (templateId, templateName) => {
      const query = new URLSearchParams({
        templateId,
        template: templateName,
      });
      return withSearch("/inspections/custom-draft", query);
    },
    useTemplateHref: (templateId) =>
      `/inspections/run?templateId=${encodeURIComponent(templateId)}`,
    menuItemHref: (menuItemId) =>
      `/menu/item/${encodeURIComponent(menuItemId)}`,
    mobileImport: false,
    supportsStandaloneRun: true,
  };
}
