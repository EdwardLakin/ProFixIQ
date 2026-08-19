import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";
import {
  WORKSPACE_ITEM,
  WORKSPACE_LINK_FOCUS,
} from "@/features/workspace/components/workspaceStyles";

export type WorkspaceCardProps = {
  children: ReactNode;
  href?: string | null;
  sourceId?: string;
  sourceType?: string;
  className?: string;
  interactiveClassName?: string;
};

/**
 * Presentation-only card surface. Callers must authorize and shape data before
 * passing an href or children; this component is not a security boundary.
 */
export function WorkspaceCard({
  children,
  href,
  sourceId,
  sourceType,
  className,
  interactiveClassName,
}: WorkspaceCardProps) {
  const dataAttributes = {
    "data-source-id": sourceId,
    "data-source-type": sourceType,
  };
  const baseClassName = cn(WORKSPACE_ITEM, className);

  if (!href) {
    return (
      <div {...dataAttributes} className={baseClassName}>
        {children}
      </div>
    );
  }

  return (
    <Link
      href={href}
      {...dataAttributes}
      className={cn(
        baseClassName,
        WORKSPACE_LINK_FOCUS,
        interactiveClassName,
      )}
    >
      {children}
    </Link>
  );
}
