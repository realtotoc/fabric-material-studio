import { spawn } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";
const server = spawn(process.execPath, ["server/index.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: "4181",
    STUDIO_PASSWORD: "deployment-smoke-password",
    AIHUBMIX_API_KEY: "deployment-smoke-key",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(([code]) => {
      throw new Error("Server exited " + code);
    }),
  ]);
  const base = "http://127.0.0.1:4181";
  const auth = {
    Authorization:
      "Basic " +
      Buffer.from("admin:deployment-smoke-password").toString("base64"),
  };
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/")).status, 401);
  assert.equal((await fetch(base + "/api/config")).status, 401);
  const home = await fetch(base + "/", { headers: auth });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /家具/);
  const config = await fetch(base + "/api/config", { headers: auth }).then(
    (r) => r.json(),
  );
  assert.equal(config.configured, true);
  assert.ok(!JSON.stringify(config).includes("deployment-smoke-key"));
  assert.equal(
    (await fetch(base + "/samples/ivory-sofa.png", { headers: auth })).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/.dev.vars", { headers: auth })).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + "/api/analyze", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
          Origin: "https://untrusted.example",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/task", {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
          "X-Forwarded-Proto": "https",
          Origin: "https://127.0.0.1:4181",
        },
        body: JSON.stringify({ id: "bad/path" }),
      })
    ).status,
    400,
  );
  console.log(
    "Deployment smoke checks passed: startup, health, authentication, static files, backend config, secret-file blocking and request origin.",
  );
} finally {
  server.kill();
  await once(server, "exit").catch(() => {});
}
