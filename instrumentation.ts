export async function register(): Promise<void> {
  const { logProductionConfigOnce } = await import("./lib/config-check");
  logProductionConfigOnce();
}
