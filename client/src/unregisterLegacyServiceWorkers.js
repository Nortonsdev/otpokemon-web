/** Remove SW legado (deploys antigos); one-shot no boot. */
export function unregisterLegacyServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
}
