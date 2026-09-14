/**
 * Vercel Function: HTTP (/health, /api/map) + WebSocket world.
 * Default export is a Node http.Server (Fluid WebSocket-compatible).
 * Implementation lives in ./server.bundle.js (esbuild of server/ + shared/, no .ts).
 */
export { default, server } from "./server.bundle.js";

export const config = {
  maxDuration: 300,
};
