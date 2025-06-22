import { ParsedCommand, PartSuggestion, RepairStep, DeferredWorkRecommendation } from "./types";
import { parseCommand } from "./parseCommand";
import { processCommand } from "./processCommand";
import { generateSummary } from "./naturalLanguageSummary";
import { matchToMenuItem } from "../quote/matchToMenu";
import { generateRepairStory } from "./generateRepairStory";
import { defaultUserSettings } from "../config/userSettings";

export const AIRepairAssistant = {
  async parseCommand(input: string): Promise<ParsedCommand> {
    return parseCommand(input);
  },

  async getSuggestedParts({
    complaint,
    vin,
    inspectionData,
  }: {
    complaint: string;
    vin?: string;
    inspectionData?: any;
  }): Promise<PartSuggestion[]> {
    const menuItem = matchToMenuItem(complaint);
    if (!menuItem) return [];

    return menuItem.parts.map((part) => ({
      name: part.name,
      partNumber: part.sku || "UNKNOWN",
      source: part.supplier || "Ford OEM",
      estimatedCost: part.cost || 0,
      availability: "in_stock",
    }));
  },

  async getRepairSteps({
    complaint,
    vin,
  }: {
    complaint: string;
    vin?: string;
  }): Promise<RepairStep[]> {
    // Placeholder: Replace with real service procedure lookup
    return [
      { stepNumber: 1, description: "Verify concern from customer complaint", estimatedTime: 0.2 },
      { stepNumber: 2, description: `Inspect affected component (${complaint})`, estimatedTime: 0.5 },
      { stepNumber: 3, description: "Replace faulty component if needed", estimatedTime: 1.0 },
    ];
  },

  async generateRepairStory({
    transcript,
    inspectionData,
  }: {
    transcript: string;
    inspectionData?: any;
  }): Promise<string> {
    return generateRepairStory(transcript, inspectionData);
  },

  async evaluateInspectionQuality(data: any): Promise<{
    score: number;
    missingItems: string[];
    suggestions: string[];
  }> {
    // Simple scoring logic placeholder
    const itemsInspected = Object.keys(data?.sections || {});
    const score = itemsInspected.length >= 5 ? 95 : 60;

    const missingItems = itemsInspected.length < 5 ? ["Undercarriage", "Steering"] : [];
    const suggestions = itemsInspected.length < 5 ? ["Be sure to check all safety-critical areas"] : [];

    return { score, missingItems, suggestions };
  },

  async suggestDeferredWork({
    vin,
    history,
  }: {
    vin: string;
    history: any;
  }): Promise<DeferredWorkRecommendation[]> {
    const deferred = history?.declinedItems || [];
    return deferred.map((item: string) => ({
      item,
      reason: "Previously declined but still recommended",
      urgency: "medium",
    }));
  },
};