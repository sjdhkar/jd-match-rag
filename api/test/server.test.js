import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (body) =>
  fetch(`${base}/api/match`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("health endpoint responds", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.deepEqual(await res.json(), { ok: true });
});

test("rejects a too-short job description", async () => {
  const res = await post({ jd: "too short" });
  assert.equal(res.status, 400);
});

test("scores against the default resume", async () => {
  const res = await post({ jd: "We need a senior .NET and Angular engineer with Azure DevOps experience." });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.ok(data.score >= 75);
  assert.ok(data.feedback.summary);
});

test("scores against a custom resume sent by the visitor", async () => {
  const resume = "# Skills\nPython, Django, PostgreSQL and Docker for backend services in production environments.";
  const res = await post({ jd: "Looking for Python, Django and Kubernetes engineers for our platform team.", resume });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.ok(data.matched.some((m) => m.skill === "Python"));
  assert.deepEqual(data.gaps, ["Kubernetes"]);
});
