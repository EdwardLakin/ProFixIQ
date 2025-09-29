import type { ReactNode } from "react";
import PhoneShell from "@launcher/PhoneShell";
export default function AppAreaLayout({ children }: { children: React.ReactNode }) {
  return <PhoneShell>{children}</PhoneShell>;
}
