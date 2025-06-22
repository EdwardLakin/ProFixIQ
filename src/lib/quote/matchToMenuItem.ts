import { QuoteLineItem } from "./types";

// Basic smart matcher using keywords — upgradeable later to vector or AI matching
export function matchToMenuItem(name: string, notes: string): QuoteLineItem | null {
  const lowerText = (name + " " + notes).toLowerCase();

  if (lowerText.includes("brake") && lowerText.includes("2mm")) {
    return {
      description: "Front Brake Pad Replacement",
      part: { name: "Front Brake Pads", price: 79.99 },
      laborHours: 1.5,
      price: 189.99,
      type: "repair",
    };
  }

  if (lowerText.includes("battery") && lowerText.includes("low")) {
    return {
      description: "Battery Replacement",
      part: { name: "12V Battery", price: 139.99 },
      laborHours: 0.5,
      price: 89.99,
      type: "repair",
    };
  }

  if (lowerText.includes("air filter")) {
    return {
      description: "Air Filter Replacement",
      part: { name: "Engine Air Filter", price: 24.99 },
      laborHours: 0.3,
      price: 29.99,
      type: "maintenance",
    };
  }

  return null; // Fallback — show for tech review
}