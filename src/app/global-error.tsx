"use client"; // Error boundaries must be Client Components

/**
 * Last-resort screen when the root layout itself fails. It replaces the whole document, so
 * globals.css, the theme and fonts aren't loaded: everything here is inline and plain.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Pack 361</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          boxSizing: "border-box",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          background: "Canvas",
          color: "CanvasText",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 360, width: "100%" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Couldn&apos;t reach the pack app.</h1>
          <p style={{ fontSize: 15, opacity: 0.75, margin: "0 0 20px" }}>Check your signal and try again.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              width: "100%",
              minHeight: 48,
              border: 0,
              borderRadius: 12,
              background: "#1b4332",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
