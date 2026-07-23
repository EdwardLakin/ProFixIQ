import type { ShopAssistantAgentDefinition } from "../types";

export const schedulingAgent = {
  id: "scheduling_agent",
  domain: "scheduling",
  name: "Scheduling Agent",
  description: "Coordinates appointments, booking windows, rescheduling, and schedule conflicts.",
  keywords: ["appointment", "booking", "schedule", "reschedule", "calendar", "tomorrow"],
  allowedTools: ["list_bookings", "reschedule_booking"],
  stateMetrics: ["todaysBookings"],
} as const satisfies ShopAssistantAgentDefinition;
