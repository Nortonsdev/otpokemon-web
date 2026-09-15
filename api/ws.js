/**
 * Vercel Function: HTTP (/health, /api/map) + WebSocket world.
 * Default export is a Node http.Server (Fluid WebSocket-compatible).
 *
 * Implementation lives in ./_lib/server.bundle.js (esbuild of server/ + shared/).
 * That file must NOT sit at api/server.bundle.js — Vercel would treat it as its
 * own function route and GET /api/server.bundle.js would 404.
 */
export { default, server } from "./_lib/server.bundle.js";

export const config = {
  maxDuration: 300,
};
