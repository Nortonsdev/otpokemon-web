import type { IncomingMessage, ServerResponse } from "node:http";
import {
  exportOtbmBytes,
  loadActiveMap,
  reloadMap,
  saveOtbmBuffer,
} from "./mapLoader.ts";

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function handleMapHttp(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === "/api/map" && req.method === "GET") {
    const runtime = loadActiveMap();
    const bytes = await exportOtbmBytes();
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="world.otbm"',
      "x-map-width": String(runtime.w),
      "x-map-height": String(runtime.h),
    });
    res.end(Buffer.from(bytes));
    return true;
  }

  if (pathname === "/api/map/json" && req.method === "GET") {
    const runtime = loadActiveMap();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        w: runtime.w,
        h: runtime.h,
        z: runtime.z,
        towns: runtime.towns,
        waypoints: runtime.waypoints,
        spawn: runtime.spawn,
      }),
    );
    return true;
  }

  if (pathname === "/api/map" && req.method === "POST") {
    const body = await readBody(req);
    if (!body.length) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Empty body" }));
      return true;
    }
    const name = String(req.headers["x-map-filename"] || "world.otbm");
    await saveOtbmBuffer(new Uint8Array(body), name);
    reloadMap();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (pathname === "/api/map/reload" && req.method === "POST") {
    reloadMap();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  return false;
}
