import assert from "node:assert/strict";
import { postJson } from "../src/lib/client/postJson";

// Isolated transport checks: no real requests, credentials, or database access.
async function main() {
  const original = globalThis.fetch;
  let count = 0;
  try {
    for (const status of [403, 409, 500, 503]) {
      globalThis.fetch = async () => new Response("rejected", { status });
      const result = await postJson("https://example.invalid", {});
      assert.equal(result.ok, false);
      if (result.ok) throw new Error("Unexpected success");
      assert.equal(result.status, status);
      count++;
    }
    globalThis.fetch = async () => { throw new TypeError("Network unavailable"); };
    const network = await postJson("https://example.invalid", {});
    assert.equal(network.ok, false);
    if (network.ok) throw new Error("Unexpected success");
    assert.equal(network.status, undefined);
    count++;
    globalThis.fetch = async () => { throw new DOMException("Aborted", "AbortError"); };
    const timeout = await postJson("https://example.invalid", {});
    assert.equal(timeout.ok, false);
    if (timeout.ok) throw new Error("Unexpected success");
    assert.equal(timeout.aborted, true);
    count++;
    globalThis.fetch = async () => new Response("<html>proxy error</html>", { status: 200 });
    assert.equal((await postJson("https://example.invalid", {})).ok, false);
    count++;
    globalThis.fetch = async () => Response.json({ revision: 2 });
    assert.deepEqual(await postJson("https://example.invalid", {}), { ok: true, data: { revision: 2 } });
    count++;
    console.log(`DEVELOPMENT_TRANSPORT_PASS ${count} checks; no network or database access`);
  } finally {
    globalThis.fetch = original;
  }
}
main().catch(() => { console.error("DEVELOPMENT_TRANSPORT_FAILED"); process.exitCode = 1; });
