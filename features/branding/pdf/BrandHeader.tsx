import React from "react";

type Props = {
  logoUrl?: string | null;
  shopName?: string;
  colors: {
    primary: string;
    secondary: string;
  };
};

export default function BrandHeader({ logoUrl, shopName, colors }: Props) {
  return (
    <div
      style={{
        width: "100%",
        padding: "16px 20px",
        background: `linear-gradient(135deg, ${colors.secondary}, #020617)`,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            style={{ height: 40, objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: colors.primary,
            }}
          >
            {shopName ?? "ProFixIQ"}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
        }}
      >
        Powered by ProFixIQ
      </div>
    </div>
  );
}
