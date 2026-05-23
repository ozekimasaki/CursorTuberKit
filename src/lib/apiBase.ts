// Detect Tauri runtime
const isTauri = typeof window !== "undefined" && "__TAURI__" in window

// Default to empty string (relative) for browser dev;
// use absolute URL in Tauri desktop so requests reach the separate backend.
export const API_BASE = isTauri
  ? (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000")
  : ""
