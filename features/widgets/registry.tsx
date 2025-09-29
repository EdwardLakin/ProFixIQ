import type { WidgetDef } from "./types";
import { CalendarWidget } from "./widgets/CalendarWidget";
import { WorkOrdersWidget } from "./widgets/WorkOrdersWidget";
import { MessagesPreviewWidget } from "./widgets/MessagesPreviewWidget";
import { QuoteReviewWidget } from "./widgets/QuoteReviewWidget";
import { TechQueueWidget } from "./widgets/TechQueueWidget";
import { PartsDashboardWidget } from "./widgets/PartsDashboardWidget";
import { ReportsKPIWidget } from "./widgets/ReportsKPIWidget";
import { TechAssistantWidget } from "./widgets/TechAssistantWidget";

export const WIDGETS: WidgetDef[] = [
  {
    slug: "calendar-agenda",
    name: "Calendar",
    route: "/appointments",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    loader: async ({ size }) => ({ limit: size === "2x2" ? 8 : 4 }),
    Component: CalendarWidget,
  },
  {
    slug: "wo-queue",
    name: "Work Orders",
    route: "/work-orders/queue",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x2",
    loader: async ({ size }) => ({ limit: size === "1x1" ? 3 : 6 }),
    Component: WorkOrdersWidget,
  },
  {
    slug: "messages-preview",
    name: "Messages",
    route: "/messages",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    loader: async () => ({
      rows: [] as { chatId: string; title: string; preview: string; unread: number }[],
    }),
    Component: MessagesPreviewWidget,
  },
  {
    slug: "wo-quote-review",
    name: "Quote Review",
    route: "/work-orders/quote-review",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    loader: async () => ({
      total: 0,
      items: [] as { id: string; title: string }[],
    }),
    Component: QuoteReviewWidget,
  },
  {
    slug: "tech-queue",
    name: "Tech Queue",
    route: "/tech/queue",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    loader: async ({ userId }) => ({
      me: userId,
      rows: [] as { id: string; label: string; urgent?: boolean }[],
    }),
    Component: TechQueueWidget,
  },
  {
    slug: "parts-dashboard",
    name: "Parts",
    route: "/parts",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    loader: async () => ({
      inventory: 0,
      backorders: 0,
      returns: 0,
    }),
    Component: PartsDashboardWidget,
  },
  {
    slug: "reports-kpi",
    name: "Reports",
    route: "/dashboard/owner/reports",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    loader: async () => ({
      revenueToday: 0,
      jobsDone: 0,
      cycleHrs: 0,
    }),
    Component: ReportsKPIWidget,
  },
  {
    slug: "tech-assistant",
    name: "Tech Assistant",
    route: "/tech/assistant",
    allowedSizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    loader: async () => ({
      tips: [
        "Diagnose brake noise",
        "Torque specs by VIN",
        "Flowchart: No-start",
        "Recall check",
        "Estimate parts list",
      ],
    }),
    Component: TechAssistantWidget,
  },
];

export const widgetsBySlug = Object.fromEntries(WIDGETS.map((w) => [w.slug, w]));
