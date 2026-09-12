"use client";

import {
  INSPECTION_FORM_CONTEXT_BLOCKS,
  inspectionFormContextValueKey,
  isInspectionFormContextEmpty,
  type InspectionFormContext,
  type InspectionFormContextBlock,
} from "@/features/inspections/lib/form-import";

/**
 * Renders the parts of an imported customer form that are not checklist rows.
 *
 * A commercial trip-inspection report is not just its defect list: it also
 * records the unit and trailer numbers, the odometer and hour-meter readings,
 * where and when the inspection happened, the regulatory declaration, and who
 * signed it. The importer preserves those blocks; this captures them so the
 * digital inspection carries the same record the paper form did.
 *
 * "before" shows what belongs at the top of the form (header, printed
 * statements). "after" shows what belongs at the bottom (free-text boxes,
 * completion and signatures). Branding is display-only in both places.
 */
export type ImportedFormContextPlacement = "before" | "after";

const PLACEMENT_BLOCKS: Record<
  ImportedFormContextPlacement,
  readonly InspectionFormContextBlock[]
> = {
  before: ["branding", "header", "notices"],
  after: ["notes", "completion"],
};

const BLOCK_HEADING: Record<InspectionFormContextBlock, string> = {
  branding: "",
  header: "Trip and vehicle record",
  notices: "",
  notes: "Details",
  completion: "Completion",
};

/** Blocks that are read to the person running the inspection, not filled in. */
const READ_ONLY_BLOCKS = new Set<InspectionFormContextBlock>([
  "branding",
  "notices",
]);

function isLongAnswer(block: InspectionFormContextBlock, label: string): boolean {
  return block === "notes" || /details|observations|remarks/i.test(label);
}

export default function ImportedFormContextCard({
  context,
  values,
  placement,
  onChange,
  disabled = false,
}: {
  context: InspectionFormContext | null | undefined;
  values: Record<string, string>;
  placement: ImportedFormContextPlacement;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  if (!context || isInspectionFormContextEmpty(context)) return null;

  const blocks = INSPECTION_FORM_CONTEXT_BLOCKS.filter(
    (block) =>
      PLACEMENT_BLOCKS[placement].includes(block) && context[block].length > 0,
  );
  if (!blocks.length) return null;

  return (
    <section className="mb-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
      {blocks.map((block, blockIndex) => (
        <div key={block} className={blockIndex === 0 ? undefined : "mt-5"}>
          {BLOCK_HEADING[block] ? (
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-copper)]">
              {BLOCK_HEADING[block]}
            </h3>
          ) : null}

          {context[block].map((section, sectionIndex) => (
            <div key={`${section.title}-${sectionIndex}`} className="mt-3">
              {block === "branding" ? (
                <div className="space-y-0.5">
                  {section.items.map((item, itemIndex) => (
                    <div
                      key={`${item.item}-${itemIndex}`}
                      className={
                        itemIndex === 0
                          ? "text-sm font-semibold text-[color:var(--theme-text-primary)]"
                          : "text-xs text-[color:var(--theme-text-secondary)]"
                      }
                    >
                      {item.item}
                    </div>
                  ))}
                </div>
              ) : READ_ONLY_BLOCKS.has(block) ? (
                <div className="space-y-1 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  {section.items.map((item, itemIndex) => (
                    <p
                      key={`${item.item}-${itemIndex}`}
                      className="text-[11px] leading-relaxed text-[color:var(--theme-text-secondary)]"
                    >
                      {item.item}
                    </p>
                  ))}
                </div>
              ) : (
                <>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                    {section.title}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {section.items.map((item, itemIndex) => {
                      const key = inspectionFormContextValueKey(
                        block,
                        section.title,
                        item.item,
                      );
                      const longAnswer = isLongAnswer(block, item.item);
                      return (
                        <label
                          key={`${item.item}-${itemIndex}`}
                          className={`text-xs text-[color:var(--theme-text-secondary)] ${longAnswer ? "sm:col-span-2" : ""}`}
                        >
                          {item.item}
                          {item.unit ? ` (${item.unit})` : ""}
                          {longAnswer ? (
                            <textarea
                              rows={3}
                              disabled={disabled}
                              value={values[key] ?? ""}
                              onChange={(event) =>
                                onChange(key, event.target.value)
                              }
                              className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-50"
                            />
                          ) : (
                            <input
                              disabled={disabled}
                              value={values[key] ?? ""}
                              onChange={(event) =>
                                onChange(key, event.target.value)
                              }
                              className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-50"
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
