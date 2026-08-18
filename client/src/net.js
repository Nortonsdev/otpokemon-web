export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const specific = this.handlers.get(msg.t);
      const all = this.handlers.get("*");
      if (specific) specific(msg);
      if (all) all(msg);
    };
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error("WebSocket failed"));
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
