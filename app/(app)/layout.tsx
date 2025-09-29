import type { ReactNode } from "react";
import PhoneShell from "@/features/launcher/PhoneShell";

export default function AppAreaLayout({ children }: { children: ReactNode }) {
  return <PhoneShell>{children}</PhoneShell>;
}