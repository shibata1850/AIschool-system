import { describe, expect, it } from "vitest";
import { assertLocalLoadTarget } from "../loadSafety";

const env = { LOCAL_LOAD_TEST: "1", NODE_ENV: "development" };
describe("legacy load target safety", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])("permits explicit local target %s", url => {
    expect(() => assertLocalLoadTarget(url, env)).not.toThrow();
  });
  it.each(["https://app.133-125-225-64.sslip.io", "http://133.125.225.64", "http://localhost.example.com", "https://localhost", "http://user:pass@localhost", "http://localhost/path", "http://localhost?target=remote", "invalid"])("rejects unsafe target %s", url => {
    expect(() => assertLocalLoadTarget(url, env)).toThrow();
  });
  it.each([{}, { NODE_ENV: "development" }, { ...env, NODE_ENV: "production" }, { ...env, LOCAL_LOAD_TEST: "0" }])("requires explicit development opt-in %j", environment => {
    expect(() => assertLocalLoadTarget("http://localhost:3000", environment)).toThrow();
  });
});
