import type { ReactNode } from "react";
import { CollapsibleCsvImportCard } from "@/features/shared/components/import/CollapsibleCsvImportCard";

type Props = {
  testId: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  guidedActive?: boolean;
  forceExpanded?: boolean;
  hasSelectedFile?: boolean;
  isParsing?: boolean;
  isImporting?: boolean;
  hasValidationIssues?: boolean;
  hasImportResult?: boolean;
  compactDescription?: string;
};

export function GuidedImportCardLayout({
  testId,
  eyebrow,
  title,
  description,
  actions,
  children,
  guidedActive,
  forceExpanded,
  hasSelectedFile,
  isParsing,
  isImporting,
  hasValidationIssues,
  hasImportResult,
  compactDescription,
}: Props) {
  return (
    <CollapsibleCsvImportCard
      testId={testId}
      eyebrow={eyebrow}
      title={title}
      description={description}
      guidedActive={guidedActive}
      forceExpanded={forceExpanded}
      hasSelectedFile={hasSelectedFile}
      isParsing={isParsing}
      isImporting={isImporting}
      hasValidationIssues={hasValidationIssues}
      hasImportResult={hasImportResult}
      compactDescription={compactDescription}
      headerActions={actions}
      variant="workspace"
    >
      {children}
    </CollapsibleCsvImportCard>
  );
}
