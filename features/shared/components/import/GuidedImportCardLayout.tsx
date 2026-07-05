import type { ReactNode } from "react";
import { GuidedSetupCardShell } from "@/features/onboarding-v2/components/GuidedSetupCardShell";

type Props = {
  testId: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function GuidedImportCardLayout({
  testId,
  eyebrow,
  title,
  description,
  actions,
  children,
}: Props) {
  return (
    <GuidedSetupCardShell
      testId={testId}
      eyebrow={eyebrow}
      title={title}
      description={description}
      guided={null}
      variant="workspace"
      actions={actions}
    >
      {children}
    </GuidedSetupCardShell>
  );
}
