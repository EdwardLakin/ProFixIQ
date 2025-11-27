// app/api/ai/parts/suggest/route.ts
import { NextResponse } from "next/server";
import { openai } from "lib/server/openai";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";


type VehicleContext = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  mileage?: string | number | null;
};

export type AiPartSuggestion = {
  name: string;
  sku?: string | null;
  qty?: number | null;
  confidence?: number | null; // 0–1
  rationale?: string | null;
};

type SuggestRequestBody = {
  workOrderId?: string;
  workOrderLineId?: string | null;
  vehicle?: VehicleContext | null;
  description?: string | null; // complaint / job description
  notes?: string | null;
  prompt?: string | null; // backward-compat
  topK?: number;
};

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.1-mini";

// Build a single human-readable line for the vehicle.
function formatVehicle(v: VehicleContext | null | undefined): string {
  if (!v) return "Unknown vehicle";
  const year =
    v.year != null && String(v.year).trim()
      ? String(v.year).trim()
      : "Unknown year";
  const make = v.make?.trim() || "Unknown make";
  const model = v.model?.trim() || "Unknown model";
  const mileage =
    v.mileage != null && String(v.mileage).trim()
      ? `${v.mileage} km/mi (as entered)`
      : "Unknown mileage";
  return `${year} ${make} ${model}, mileage: ${mileage}`;
}

/**
 * Core handler – uses WO line complaint/description + vehicle + inventory
 * to ask the LLM for part suggestions.
 */
export async function POST(req: Request) {
  const supabase = createAdminSupabase();

  try {
    const body = (await req.json().catch(() => ({}))) as SuggestRequestBody;

    const {
      workOrderId,
      workOrderLineId,
      vehicle: vehicleFromBody,
      description,
      notes,
      prompt,
    } = body;

    const topK =
      typeof body.topK === "number" && body.topK > 0 && body.topK <= 10
        ? body.topK
        : 5;

    // ------------------------------------------------------------
    // 1. Resolve complaint / description from the WO line if needed
    // ------------------------------------------------------------
    let complaintText = (description ?? "").trim();
    let lineNotes = (notes ?? "").trim();
    let resolvedWorkOrderId: string | null = workOrderId ?? null;
    let shopId: string | null = null;

    if (workOrderLineId) {
      const { data: line, error: lineErr } = await supabase
        .from("work_order_lines")
        .select("id, work_order_id, description, complaint, notes")
        .eq("id", workOrderLineId)
        .maybeSingle();

      if (lineErr) {
        console.warn("[ai/parts/suggest] line fetch error", lineErr.message);
      }

      if (line) {
        if (!complaintText) {
          complaintText =
            (line.description ?? "").trim() ||
            (line.complaint ?? "").trim() ||
            complaintText;
        }
        if (!lineNotes) {
          lineNotes = (line.notes ?? "").trim() || lineNotes;
        }
        if (!resolvedWorkOrderId && line.work_order_id) {
          resolvedWorkOrderId = line.work_order_id;
        }
      }
    }

    // Fall back to any free-form prompt we got
    if (!complaintText && prompt) {
      complaintText = String(prompt).trim();
    }

    // ------------------------------------------------------------
    // 2. Resolve shop + inventory from the work order
    // ------------------------------------------------------------
    if (resolvedWorkOrderId) {
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .select("id, shop_id")
        .eq("id", resolvedWorkOrderId)
        .maybeSingle();

      if (woErr) {
        console.warn("[ai/parts/suggest] work_order fetch error", woErr.message);
      }
      shopId = (wo?.shop_id as string | null) ?? null;
    }

    let inventory: { id: string; name: string | null; sku: string | null; category: string | null }[] =
      [];

    if (shopId) {
      const { data: parts, error: partsErr } = await supabase
        .from("parts")
        .select("id, name, sku, category")
        .eq("shop_id", shopId)
        .order("name", { ascending: true })
        .limit(200);

      if (partsErr) {
        console.warn(
          "[ai/parts/suggest] parts fetch error",
          partsErr.message,
        );
      } else {
        inventory = (parts ?? []) as typeof inventory;
      }
    }

    const vehicleSummary = formatVehicle(vehicleFromBody ?? null);

    // If we somehow have *zero* context, just return empty so UI shows "No suggestions".
    if (!complaintText && !inventory.length) {
      return NextResponse.json<{ items: AiPartSuggestion[] }>({
        items: [],
      });
    }

    // ------------------------------------------------------------
    // 3. Call the model with a structured JSON schema
    // ------------------------------------------------------------
    const inventoryLines = inventory
      .map((p) => {
        const sku = p.sku ? p.sku : "NO_SKU";
        const name = p.name ?? "Unnamed";
        const cat = p.category ?? "Uncategorized";
        return `${sku} | ${name} | ${cat}`;
      })
      .join("\n");

    const systemPrompt = [
      "You are an automotive parts advisor working inside a repair shop's inventory system.",
      "Your job is to suggest PARTS (not labor) for a given work order line complaint/description.",
      "You are given:",
      "- Vehicle summary",
      "- Complaint / job description and notes",
      "- The shop's current parts inventory list (SKU | Name | Category).",
      "",
      "Rules:",
      "- Prefer parts that exist in the inventory list when possible.",
      "- When you use an inventory part, set its SKU to the exact SKU from the list.",
      "- If you cannot match the inventory exactly, you may omit SKU or leave it null.",
      "- Suggest realistic quantities for a single job on one vehicle.",
      "- Focus on physical parts or fluids, not shop supplies like rags or brake cleaner.",
      "- Return between 1 and 8 suggestions ordered by usefulness.",
      "",
      "Return JSON only, matching the schema, with no extra commentary.",
    ].join("\n");

    const userPromptText = [
      `Vehicle: ${vehicleSummary}`,
      "",
      "Complaint / job description:",
      complaintText || "(none)",
      "",
      "Additional notes:",
      lineNotes || "(none)",
      "",
      "Parts inventory (SKU | Name | Category):",
      inventoryLines || "(no inventory rows available)",
      "",
      `Suggest up to ${topK} parts for this job.`,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "part_suggestions",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sku: { type: ["string", "null"], nullable: true },
                    qty: { type: ["number", "null"], nullable: true },
                    confidence: {
                      type: ["number", "null"],
                      nullable: true,
                    },
                    rationale: {
                      type: ["string", "null"],
                      nullable: true,
                    },
                  },
                  required: ["name"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPromptText },
      ],
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: { items?: AiPartSuggestion[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];

    // Basic sanitization
    const items: AiPartSuggestion[] = itemsRaw
      .map((it) => ({
        name: String(it.name ?? "").trim(),
        sku:
          typeof it.sku === "string" && it.sku.trim().length
            ? it.sku.trim()
            : null,
        qty:
          typeof it.qty === "number" && Number.isFinite(it.qty) && it.qty > 0
            ? it.qty
            : null,
        confidence:
          typeof it.confidence === "number" && Number.isFinite(it.confidence)
            ? Math.min(1, Math.max(0, it.confidence))
            : null,
        rationale:
          typeof it.rationale === "string" && it.rationale.trim().length
            ? it.rationale.trim()
            : null,
      }))
      .filter((it) => it.name.length > 0)
      .slice(0, topK);

    return NextResponse.json<{ items: AiPartSuggestion[] }>({
      items,
    });
  } catch (err) {
    console.warn("[ai/parts/suggest] error", err);
    // Never break the picker – just show no suggestions.
    return NextResponse.json<{ items: AiPartSuggestion[]; error?: string }>({
      items: [],
      error:
        err instanceof Error
          ? err.message
          : "Unable to generate part suggestions.",
    });
  }
}