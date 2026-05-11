"use client"

import { useEffect } from "react"

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[/reports error boundary]", error)
  }, [error])

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 13,
        color: "#0f172a",
        background: "#fff7f7",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontFamily: "Mulish, sans-serif", fontSize: 20, marginBottom: 12 }}>
        Reports — runtime error
      </h1>
      <p style={{ color: "#dc2626", marginBottom: 8 }}>
        <strong>{error.name}:</strong> {error.message}
      </p>
      {error.digest ? (
        <p style={{ color: "#64748b" }}>digest: {error.digest}</p>
      ) : null}
      {error.stack ? (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#0f172a",
            color: "#e2e8f0",
            padding: 16,
            borderRadius: 8,
            marginTop: 16,
            fontSize: 12,
          }}
        >
          {error.stack}
        </pre>
      ) : null}
      <button
        onClick={reset}
        style={{
          marginTop: 16,
          padding: "8px 16px",
          background: "#3ea3db",
          color: "white",
          border: 0,
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Try again
      </button>
    </div>
  )
}
