import Link from "next/link";

import {
  equipmentSectionsForRole,
  type EquipmentSectionKey,
} from "@/features/equipment/lib/equipmentSections";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { WORKSPACE_PANEL as PANEL } from "@/features/workspace/components";

const LINK =
  "shrink-0 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]";
const ACTIVE = "bg-[color:var(--theme-surface-overlay)]";

export default function EquipmentSectionNav({
  current,
  role,
}: {
  current: EquipmentSectionKey;
  role: CanonicalRole;
}) {
  const sections = equipmentSectionsForRole(role);
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <nav
        className={`${PANEL} flex gap-2 overflow-x-auto p-3`}
        aria-label="Equipment sections"
      >
        {sections.map((section) => (
          <Link
            key={section.key}
            href={section.href}
            className={`${LINK} ${current === section.key ? ACTIVE : ""}`}
            aria-current={current === section.key ? "page" : undefined}
          >
            {section.label}
            {section.external ? <span aria-hidden="true"> ↗</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
