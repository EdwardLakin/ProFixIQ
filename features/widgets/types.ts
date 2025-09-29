export type WidgetSize = "1x1" | "2x1" | "2x2";
export type WidgetConfig = Record<string, unknown>;

export type WidgetDef = {
  slug: string;
  name: string;
  route: string;                  // where a tap should navigate
  allowedSizes: WidgetSize[];
  defaultSize: WidgetSize;
  loader?: (ctx: { userId: string; size: WidgetSize; config: WidgetConfig }) => Promise<any>;
  Component: React.ComponentType<{
    data: any;
    size: WidgetSize;
    config: WidgetConfig;
    route: string;                // <— serializable; no functions across the boundary
  }>;
};
