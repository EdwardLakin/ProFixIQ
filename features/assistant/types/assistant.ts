export type AssistantAction = {
  label: string;
  href: string;
};

export type AssistantNotification = {
  level: "info" | "warning" | "urgent";
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
};

export type AssistantResponse = {
  summary: string;
  bullets: string[];
  actions: AssistantAction[];
  notifications: AssistantNotification[];
};
