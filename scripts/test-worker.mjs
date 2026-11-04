import { strict as assert } from "node:assert";
import worker from "../worker/index.mjs";
const origin = "https://studio.example";
const env = {
  STUDIO_PASSWORD: "worker-test-password",
  AIHUBMIX_API_KEY: "worker-test-key",
  ASSETS: { fetch: async () => new Response("static asset") },
};
const authorization =
  "Basic " + Buffer.from("admin:worker-test-password").toString("base64");
assert.equal((await worker.fetch(new Request(origin + "/healthz"), {})).status, 200);
assert.equal((await worker.fetch(new Request(origin), {})).status, 503);
for (const path of ["/", "/app.js", "/api/config"]) {
  assert.equal((await worker.fetch(new Request(origin + path), env)).status, 401);
}
const authRequest = (path) => new Request(origin + path, { headers: { authorization } });
assert.equal(await (await worker.fetch(authRequest("/style.css"), env)).text(), "static asset");
const config = await (await worker.fetch(authRequest("/api/config"), env)).json();
assert.equal(config.configured, true);
assert.ok(!JSON.stringify(config).includes(env.AIHUBMIX_API_KEY));
const crossOrigin = new Request(origin + "/api/task", {
  method: "POST",
  headers: { authorization, "Content-Type": "application/json", Origin: "https://untrusted.example" },
  body: JSON.stringify({ id: "task_x" }),
});
assert.equal((await worker.fetch(crossOrigin, env)).status, 403);
console.log("Worker checks passed: secrets, authentication before assets, API routing and origin validation.");
