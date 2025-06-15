import React from "react";
import { VehicleProvider } from "@hooks/useVehicleInfo";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <VehicleProvider>{children}</VehicleProvider>
      </body>
    </html>
  );
}