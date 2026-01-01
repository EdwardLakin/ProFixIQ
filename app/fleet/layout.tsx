// app/fleet/layout.tsx
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Pass-through layout so /fleet uses the same chrome as the rest of the app.
export default function FleetLayout({ children }: Props) {
  return <>{children}</>;
}