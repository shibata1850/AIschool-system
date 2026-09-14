/** Legacy load scenarios reset data and must never target a deployed service. */
export function assertLocalLoadTarget(baseUrl: string, env: Record<string, string | undefined>): void {
  const url = new URL(baseUrl);
  if (env.LOCAL_LOAD_TEST !== "1" || env.NODE_ENV !== "development" ||
      url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Load tests require an explicitly enabled isolated local development server");
  }
}
