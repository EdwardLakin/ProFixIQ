"use client";

import { useEffect, useRef, useState } from "react";
import {
  INSPECTION_FORM_CONTEXT_BLOCKS,
  certificationFieldKind,
  inspectionFormContextValueKey,
  isInspectionFormContextEmpty,
  isSignaturePanelField,
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
 * statements). "after" shows the free-text boxes that follow the checklist.
 * "certification" shows the printed certificate / sign-off fields and sits
 * directly above ProFixIQ's own signature block, at the very end. Branding is
 * display-only.
 */
export type ImportedFormContextPlacement = "before" | "after" | "certification";

const PLACEMENT_BLOCKS: Record<
  ImportedFormContextPlacement,
  readonly InspectionFormContextBlock[]
> = {
  before: ["branding", "header", "notices"],
  after: ["notes"],
  certification: ["completion"],
};

const BLOCK_HEADING: Record<InspectionFormContextBlock, string> = {
  branding: "",
  header: "Trip and vehicle record",
  notices: "",
  notes: "Details",
  completion: "Certification",
};

/** Blocks that are read to the person running the inspection, not filled in. */
const READ_ONLY_BLOCKS = new Set<InspectionFormContextBlock>([
  "branding",
  "notices",
]);

type CertificationDefaults = {
  stationName?: string | null;
  stationLocation?: string | null;
  licenseNumber?: string | null;
};

function isLongAnswer(block: InspectionFormContextBlock, label: string): boolean {
  return block === "notes" || /details|observations|remarks/i.test(label);
}

/** "Section" is the importer's placeholder for an untitled block, not a title. */
function visibleTitle(title: string): string {
  const t = title.trim();
  return /^section$/i.test(t) ? "" : t;
}

function localDateKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function ImportedFormContextCard({
  context,
  values,
  placement,
  onChange,
  onChangeMany,
  disabled = false,
}: {
  context: InspectionFormContext | null | undefined;
  values: Record<string, string>;
  placement: ImportedFormContextPlacement;
  onChange: (key: string, value: string) => void;
  /**
   * Applies several values as one update. Autofill must use this: separate
   * onChange calls in the same render each start from the same snapshot of
   * the captured values, so each would overwrite the one before it.
   */
  onChangeMany?: (updates: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [defaults, setDefaults] = useState<CertificationDefaults | null>(null);
  const appliedRef = useRef<Set<string>>(new Set());

  const certificationKinds =
    placement === "certification" && context
      ? context.completion.flatMap((section) =>
          section.items.map((item) => certificationFieldKind(item.item)),
        )
      : [];
  const wantsShopDefaults =
    !disabled &&
    certificationKinds.some(
      (kind) =>
        kind === "stationName" ||
        kind === "stationLocation" ||
        kind === "licenseNumber",
    );

  useEffect(() => {
    if (!wantsShopDefaults) return;
    let cancelled = false;
    fetch("/api/inspections/certification-defaults", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: CertificationDefaults | null) => {
        if (!cancelled && json) setDefaults(json);
      })
      .catch(() => {
        // Defaults are a convenience only; the fields stay typeable.
      });
    return () => {
      cancelled = true;
    };
  }, [wantsShopDefaults]);

  // Fill each recognised certification field once, and only if still empty,
  // so a technician's own edit (or a cleared field) is never overwritten.
  useEffect(() => {
    if (placement !== "certification" || disabled || !context) return;
    const updates: Record<string, string> = {};
    context.completion.forEach((section, sectionIndex) => {
      section.items.forEach((item) => {
        const kind = certificationFieldKind(item.item);
        if (!kind) return;
        const key = inspectionFormContextValueKey(
          "completion",
          sectionIndex,
          section.title,
          item.item,
        );
        if (appliedRef.current.has(key) || (values[key] ?? "").trim()) return;
        const value =
          kind === "inspectionDate"
            ? localDateKey()
            : kind === "stationName"
              ? defaults?.stationName
              : kind === "stationLocation"
                ? defaults?.stationLocation
                : kind === "licenseNumber"
                  ? defaults?.licenseNumber
                  : null;
        if (!value) return;
        updates[key] = value;
      });
    });
    const keys = Object.keys(updates);
    if (!keys.length) return;
    for (const key of keys) appliedRef.current.add(key);
    if (onChangeMany) onChangeMany(updates);
    else for (const key of keys) onChange(key, updates[key]);
  }, [context, defaults, disabled, onChange, onChangeMany, placement, values]);

  if (!context || isInspectionFormContextEmpty(context)) return null;

  const blocks = INSPECTION_FORM_CONTEXT_BLOCKS.filter(
    (block) =>
      PLACEMENT_BLOCKS[placement].includes(block) && context[block].length > 0,
  );
  if (!blocks.length) return null;

  // ProFixIQ's signature block records the printed name, signature and signed
  // date, so the paper copies of those lines are not shown a second time.
  // A line that already holds a captured value stays visible: that is data
  // someone entered, and it must not vanish from an inspection in progress.
  const visibleItems = (
    block: InspectionFormContextBlock,
    sectionIndex: number,
    section: { title: string },
    items: typeof context.header[number]["items"],
  ) =>
    block === "completion"
      ? items.filter(
          (item) =>
            !isSignaturePanelField(item.item) ||
            Boolean(
              (
                values[
                  inspectionFormContextValueKey(
                    block,
                    sectionIndex,
                    section.title,
                    item.item,
                  )
                ] ?? ""
              ).trim(),
            ),
        )
      : items;

  const rendered = blocks.filter((block) =>
    context[block].some(
      (section, sectionIndex) =>
        visibleItems(block, sectionIndex, section, section.items).length > 0,
    ),
  );
  if (!rendered.length) return null;

  return (
    <section className="mb-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
      {rendered.map((block, blockIndex) => (
        <div key={block} className={blockIndex === 0 ? undefined : "mt-5"}>
          {BLOCK_HEADING[block] ? (
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-copper)]">
              {BLOCK_HEADING[block]}
            </h3>
          ) : null}

          {context[block].map((section, sectionIndex) => {
            const items = visibleItems(block, sectionIndex, section, section.items);
            if (!items.length) return null;
            const title = visibleTitle(section.title);
            return (
              <div key={`${section.title}-${sectionIndex}`} className="mt-3">
                {block === "branding" ? (
                  <div className="space-y-0.5">
                    {items.map((item, itemIndex) => (
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
                    {items.map((item, itemIndex) => (
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
                    {title ? (
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                        {title}
                      </div>
                    ) : null}
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {items.map((item, itemIndex) => {
                        // A printed statement inside a certificate (an
                        // attestation) is read, not answered.
                        if (item.fieldType === "instruction") {
                          return (
                            <p
                              key={`${item.item}-${itemIndex}`}
                              className="text-[11px] leading-relaxed text-[color:var(--theme-text-secondary)] sm:col-span-2"
                            >
                              {item.item}
                            </p>
                          );
                        }
                        const key = inspectionFormContextValueKey(
                          block,
                          sectionIndex,
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
            );
          })}

          {block === "completion" ? (
            <p className="mt-3 text-[11px] text-[color:var(--theme-text-secondary)]">
              Printed name and signature are captured by the signature block
              below.
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
