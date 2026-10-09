// The one place the backend location is read. Next inlines NEXT_PUBLIC_*
// variables at build time, and only for a literal `process.env.NAME` access.

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// Derived, not a second variable: http -> ws, https -> wss.
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
