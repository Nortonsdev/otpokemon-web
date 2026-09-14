import { handleMapHttp } from "../server/mapHttp.ts";

export default async function handler(req, res) {
  const pathname = (req.url || "/").split("?")[0];
  const handled = await handleMapHttp(req, res, pathname);
  if (!handled) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
