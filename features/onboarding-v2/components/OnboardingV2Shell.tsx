import { ReactNode } from "react";

export function OnboardingV2Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      {children}
    </div>
  );
}
