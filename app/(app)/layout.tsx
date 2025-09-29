// app/(app)/layout.tsx   <-- or wherever AppAreaLayout lives
"use client";

import type { ReactNode } from "react";
import PhoneShell from "@/features/launcher/PhoneShell";
import { TasksProvider } from "@/features/launcher/tasks/TasksProvider";

export default function AppAreaLayout({ children }: { children: ReactNode }) {
  return (
    <TasksProvider initialRoute="/dashboard">
      <PhoneShell>{children}</PhoneShell>
    </TasksProvider>
  );
}