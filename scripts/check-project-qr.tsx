import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectQr } from "../app/development/project-qr";

async function main() {
  for (const url of [null, "http://example.com", "https://example.com/?token=secret"]) {
    assert.equal(await ProjectQr({ url }), null);
  }
  const a = renderToStaticMarkup(await ProjectQr({ url: "https://example.com/a" }));
  const b = renderToStaticMarkup(await ProjectQr({ url: "https://example.com/b" }));
  assert.match(a, /data:image\/png;base64,/);
  assert.match(a, /href="https:\/\/example.com\/a"/);
  assert.notEqual(a.match(/src="([^"]+)"/)?.[1], b.match(/src="([^"]+)"/)?.[1]);
  console.log("PROJECT_QR_PASS: absent/unsafe URLs hidden, inline PNG and updated URL verified; no network or database access");
}
main().catch(() => { console.error("PROJECT_QR_FAILED"); process.exitCode = 1; });
