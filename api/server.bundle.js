/**
 * Probe-only handler so GET /api/server.bundle.js is not a Vercel 404.
 * The real Node bundle is api/_lib/server.bundle.js, loaded by api/ws.js.
 * Do not put the esbuild output at this path — it becomes a separate function.
 */
export default function handler(req, res) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(
    JSON.stringify({
      ok: true,
      artifact: false,
      message: "Not the Node server bundle. Vercel loads api/_lib/server.bundle.js from api/ws.js (one Fluid isolate).",
      routes: {
        health: "GET /health",
        mapGet: "GET /api/map",
        mapPost: "POST /api/map  Content-Type: application/octet-stream  x-map-filename: world.otbm",
        mapJson: "GET /api/map/json",
        ws: "GET/WS /ws  (rewritten to /api/ws)",
      },
    }),
  );
}

export const config = {
  maxDuration: 30,
};
