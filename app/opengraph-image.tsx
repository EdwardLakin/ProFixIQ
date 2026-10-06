import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ProFixIQ heavy-duty and automotive repair shop software";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 80% 10%, rgba(11,183,255,0.25), transparent 32%), radial-gradient(circle at 10% 25%, rgba(23,71,255,0.22), transparent 34%), #07111f",
          color: "white",
          padding: "72px 84px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            fontSize: 54,
            fontWeight: 800,
            letterSpacing: "-0.04em",
          }}
        >
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1747ff",
              fontSize: 34,
              fontWeight: 900,
            }}
          >
            P
          </div>
          ProFixIQ
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 58,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
              maxWidth: 940,
            }}
          >
            The operating system for modern repair shops.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              lineHeight: 1.35,
              color: "#cbd5e1",
              maxWidth: 930,
            }}
          >
            Heavy-Duty • Automotive • Fleet — voice inspections, technician-built repairs, parts, approvals, field service, and fleet maintenance.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#93c5fd",
          }}
        >
          profixiq.com
        </div>
      </div>
    ),
    size,
  );
}
