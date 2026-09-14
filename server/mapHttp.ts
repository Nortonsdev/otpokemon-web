import type { IncomingMessage, ServerResponse } from "node:http";
import {
  exportOtbmBytes,
  loadActiveMap,
  reloadMap,
  saveOtbmBuffer,
} from "./mapLoader.ts";

function readBody(req: IncomingMessage & { body?: unknown }): Promise<Buffer> {
  const existing = req.body;
  if (Buffer.isBuffer(existing)) return Promise.resolve(existing);
  if (existing instanceof Uint8Array) return Promise.resolve(Buffer.from(existing));
  if (typeof existing === "string") return Promise.resolve(Buffer.from(existing));
  if (existing && typeof existing === "object" && ArrayBuffer.isView(existing)) {
    const view = existing as ArrayBufferView;
    return Promise.resolve(Buffer.from(view.buffer, view.byteOffset, view.byteLength));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    if (req.readableEnded) {
      resolve(Buffer.concat(chunks));
      return;
    }
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function safeFilename(raw: string) {
  const base = raw.replace(/\\/g, "/").split("/").pop() || "world.otbm";
  return base.toLowerCase().endsWith(".otbm") ? base : "world.otbm";
}

export async function handleMapHttp(req: IncomingMessage, res: ServerResponse, pathname: string) {
  try {
    if (pathname === "/api/map" && req.method === "GET") {
      const runtime = loadActiveMap();
      const bytes = await exportOtbmBytes();
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="world.otbm"',
        "cache-control": "no-store",
        "x-map-width": String(runtime.w),
        "x-map-height": String(runtime.h),
        "x-map-z": String(runtime.z),
        "x-map-tiles": String(runtime.w * runtime.h),
      });
      res.end(Buffer.from(bytes));
      return true;
    }

    if (pathname === "/api/map/json" && req.method === "GET") {
      const runtime = loadActiveMap();
      const small = runtime.w * runtime.h <= 4096;
      sendJson(res, 200, {
        w: runtime.w,
        h: runtime.h,
        z: runtime.z,
        towns: runtime.towns,
        waypoints: runtime.waypoints,
        spawn: runtime.spawn,
        ...(small
          ? {
              ground: runtime.ground,
              walls: runtime.walls,
              roofs: runtime.roofs,
              items: runtime.items,
              cells: runtime.cells,
            }
          : {}),
      });
      return true;
    }

    if (pathname === "/api/map" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.length) {
        sendJson(res, 400, { error: "Empty body" });
        return true;
      }
      const name = safeFilename(String(req.headers["x-map-filename"] || "world.otbm"));
      const runtime = await saveOtbmBuffer(new Uint8Array(body), name);
      sendJson(res, 200, { ok: true, w: runtime.w, h: runtime.h, z: runtime.z, spawn: runtime.spawn });
      return true;
    }

    if (pathname === "/api/map/reload" && req.method === "POST") {
      const runtime = reloadMap();
      sendJson(res, 200, { ok: true, w: runtime.w, h: runtime.h, z: runtime.z });
      return true;
    }

    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/map]", message);
    sendJson(res, 500, { error: message });
    return true;
  }
}

/** Resolve /api/map* even when Vercel rewrites the request onto /api/ws. */
export function resolveMapPath(req: IncomingMessage, pathname: string): string {
  const headers = req.headers;
  const candidates = [
    pathname,
    String(headers["x-invoke-path"] || ""),
    String(headers["x-forwarded-uri"] || ""),
    String(headers["x-vercel-original-path"] || ""),
  ];
  for (const raw of candidates) {
    const path = raw.split("?")[0];
    if (path === "/api/map" || path.startsWith("/api/map/")) return path;
  }
  try {
    const url = new URL(req.url || "/", "http://otpokemon.local");
    const flag = url.searchParams.get("otpMap");
    if (flag === "1" || flag === "otbm") return "/api/map";
    if (flag === "json") return "/api/map/json";
    if (flag === "reload") return "/api/map/reload";
  } catch {
    /* ignore */
  }
  const method = req.method || "GET";
  const ct = String(req.headers["content-type"] || "");
  if (method === "POST" && ct.includes("octet-stream") && pathname.startsWith("/api/")) {
    return "/api/map";
  }
  return pathname;
}
