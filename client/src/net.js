export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.reconnectTimer = null;
    this.openedOnce = false;
    this.reconnectDelay = 1000;
    this.connecting = null;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  url() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws`;
  }

  emit(type, payload) {
    const fn = this.handlers.get(type);
    if (fn) fn(payload);
  }

  connect() {
    if (this.connecting) return this.connecting;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch {
          /* ignore */
        }
      }
    }
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const specific = this.handlers.get(msg.t);
      const all = this.handlers.get("*");
      if (specific) specific(msg);
      if (all) all(msg);
    };
    this.connecting = new Promise((resolve, reject) => {
      ws.onopen = () => {
        this.connecting = null;
        this.reconnectDelay = 1000;
        const reconnect = this.openedOnce;
        this.openedOnce = true;
        this.emit("_open", { reconnect });
        resolve();
      };
      ws.onerror = () => {
        this.connecting = null;
        if (!this.openedOnce) reject(new Error("WebSocket failed"));
      };
      ws.onclose = () => {
        this.connecting = null;
        if (this.ws === ws) this.ws = null;
        this.emit("_close", {});
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connect().catch(() => {});
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
      };
    });
    return this.connecting;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
