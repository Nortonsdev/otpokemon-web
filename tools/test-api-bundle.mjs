/**
 * Assert the Vercel bundle loads as plain Node (no tsx) and serves /health + /api/map.
 */
process.env.VERCEL = "1";

const { server } = await import("../api/server.bundle.js");

function request(method, url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers,
      readableEnded: true,
      on() {
        return req;
      },
    };
    const chunks = [];
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h || {});
      },
      end(c) {
        if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        resolve({
          status: this.statusCode,
          headers: this.headers,
          body: Buffer.concat(chunks),
        });
      },
    };
    server.emit("request", req, res);
    setTimeout(() => reject(new Error(`timeout ${url}`)), 5000);
  });
}

const health = await request("GET", "/health");
if (health.status !== 200 || !health.body.toString().includes('"ok":true')) {
  throw new Error(`health ${health.status} ${health.body}`);
}

const map = await request("GET", "/api/map");
if (map.status !== 200 || map.body[4] !== 0xfe) {
  throw new Error(`map ${map.status} ${map.body?.slice?.(0, 80)}`);
}

const viaRewrite = await request("GET", "/api/ws?otpMap=1");
if (viaRewrite.status !== 200 || viaRewrite.body.length !== map.body.length) {
  throw new Error(`rewrite map ${viaRewrite.status} len ${viaRewrite.body.length}`);
}

console.log("API BUNDLE OK", { mapBytes: map.body.length, w: map.headers["x-map-width"] });
process.exit(0);
