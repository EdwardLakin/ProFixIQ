"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("GlobalError:", error);
  return (
    <html>
      <body style={{ background: "#000", color: "#fff", fontFamily: "monospace" }}>
        <div style={{ maxWidth: 800, margin: "3rem auto", lineHeight: 1.5 }}>
          <h1 style={{ color: "#f97316" }}>Something went wrong</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(error?.stack ?? error?.message)}</pre>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              border: "1px solid #f97316",
              padding: "8px 12px",
              background: "transparent",
              color: "#f97316",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}