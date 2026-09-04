"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { filterInventoryResultsByQuery } from "./inventorySearch";
import type { PartsRequestInventoryResult } from "./types";

const SUGGESTION_LIMIT = 6;

/**
 * Lightweight searchable combobox for the Description / Part # / Manufacturer
 * fields on a parts-request row. Typing filters the same inventory result set
 * used by the full Inventory Picker modal (by description, SKU, part number,
 * or manufacturer). Picking a suggestion hands the matched inventory record
 * back to the caller, which links it via the existing attach-inventory
 * command. Manual free-text entry is always preserved — the dropdown never
 * substitutes a value on its own.
 */
export function InventoryFieldCombobox({
  value,
  placeholder,
  ariaLabel,
  className,
  results,
  disabled = false,
  onChange,
  onSelect,
}: {
  value: string;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  results: PartsRequestInventoryResult[];
  disabled?: boolean;
  onChange?: (value: string) => void;
  onSelect?: (result: PartsRequestInventoryResult) => void;
}): JSX.Element {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    return filterInventoryResultsByQuery(results, value).slice(0, SUGGESTION_LIMIT);
  }, [results, value]);

  const showDropdown = isOpen && suggestions.length > 0;

  function closeSoon(): void {
    blurTimer.current = window.setTimeout(() => setIsOpen(false), 120);
  }

  function cancelClose(): void {
    if (blurTimer.current != null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  return (
    <div className="relative">
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(event) => {
          onChange?.(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={closeSoon}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
        }}
      />
      {showDropdown ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`Inventory matches for ${ariaLabel}`}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-page)] py-1 shadow-lg"
          onMouseDown={cancelClose}
        >
          {suggestions.map((result) => {
            const metadata = [result.partNumber || result.sku, result.manufacturer]
              .filter(Boolean)
              .join(" • ");
            return (
              <li
                key={result.value}
                role="option"
                aria-selected={false}
                tabIndex={-1}
                className="cursor-pointer px-3 py-2 text-sm text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
                onMouseDown={(event) => {
                  event.preventDefault();
                  cancelClose();
                  setIsOpen(false);
                  onSelect?.(result);
                }}
              >
                <div className="truncate font-medium">{result.label}</div>
                {metadata ? (
                  <div className="truncate text-xs text-[color:var(--theme-text-secondary)]">{metadata}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
