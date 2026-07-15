export type PortalAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PortalAssistantContext = {
  workOrderId?: string;
  pageType?: "work_order" | "history" | "appointments" | "portal";
};

export type PortalAssistantAnswer = {
  intent: "service_history" | "repair_explanation" | "appointment" | "status" | "help";
  summary: string;
  bullets: string[];
  actions: Array<{ label: string; href: string }>;
};
