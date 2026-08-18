import http from "node:http";
import { WebSocketServer } from "ws";
import { World } from "./game.js";
import { STEP_MS } from "./species.js";

const PORT = Number(process.env.PORT || 3001);
const world = new World();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  world.attach(ws);
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    world.handle(ws, msg);
  });
  ws.on("close", () => world.detach(ws));
  ws.on("error", () => world.detach(ws));
});

setInterval(() => world.tick(), STEP_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OTPokemon server ws://0.0.0.0:${PORT}/ws`);
});

function shutdown() {
  for (const ws of wss.clients) {
    const client = world.clients.get(ws);
    if (client?.playerId) world.logoutPlayer(client, false);
  }
  world.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
