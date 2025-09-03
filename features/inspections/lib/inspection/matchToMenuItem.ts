// features/inspections/lib/inspection/matchToMenuItem.ts
import type {
  InspectionSession,
  InspectionItem,
  QuoteLineItem,
} from "./types";
import { serviceMenu } from "@shared/lib/menuItems";
import { v4 as uuidv4 } from "uuid";

export default function matchToMenuItem(
  session: InspectionSession,
  item: InspectionItem,
): InspectionSession {
  // Only create quote lines for actionable statuses
  if (!item || !item.status || !["fail", "recommend"].includes(item.status)) {
    return session;
  }

  const newQuoteLines: QuoteLineItem[] = [];

  // Try the primary name + any recommended follow-ups
  const namesToMatch = [item.name, ...(item.recommend ?? [])];

  namesToMatch.forEach((term) => {
    if (!term) return;

    const match = serviceMenu.find((menuItem) =>
      term.toLowerCase().includes(menuItem.name.toLowerCase()),
    );

    if (match) {
      // Guard the status to the allowed set
      const statusSafe: QuoteLineItem["status"] =
        item.status === "ok" ||
        item.status === "fail" ||
        item.status === "na" ||
        item.status === "recommend"
          ? item.status
          : "ok";

      const quoteLine: QuoteLineItem = {
        id: uuidv4(),
        // display + identifiers
        item: match.name,
        name: "", // optional helper field in some UIs
        description: match.name,

        // status/notes
        status: statusSafe,
        notes: item.notes ?? "",

        // pricing (total can be computed elsewhere; keep price present)
        price: 0,
        laborTime: match.laborHours || 1,
        parts: [
          {
            name: match.name,
            price: match.partCost || 0,
          },
        ],
        totalCost:
          (match.partCost ?? 0) + (match.laborHours ?? 1) * 120,

        // provenance + misc helpers used around the app
        source: "inspection",
        partName: "",
      };

      newQuoteLines.push(quoteLine);
    }
  });

  return {
    ...session,
    quote: [...(session.quote ?? []), ...newQuoteLines],
  };
}