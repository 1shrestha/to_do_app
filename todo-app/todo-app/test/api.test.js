import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { route } from "../lib/router.js";
import { resetTasks } from "../lib/store.js";

let server, base;
before(async () => {
  server = http.createServer((req, res) => route(req, res));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/v1/tasks`;
});
after(() => server.close());

async function call(method, path = "", body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

test("create: server generates id and defaults, returns 201", async () => {
  resetTasks([]);
  const r = await call("POST", "", { title: "  Finish Assignment 7  ", priority: "high", dueDate: "2026-10-30", id: "client-id" });
  assert.equal(r.status, 201);
  const t = r.json.data;
  assert.match(t.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(t.id, "client-id");
  assert.equal(t.title, "Finish Assignment 7");
  assert.equal(t.completed, false);
  assert.equal(t.priority, "high");
  assert.equal(t.description, "");
  assert.ok(t.createdAt && t.updatedAt);
});

test("create: validation errors", async () => {
  assert.equal((await call("POST", "", {})).status, 400);
  assert.equal((await call("POST", "", { title: "   " })).status, 400);
  assert.equal((await call("POST", "", { title: "x".repeat(101) })).status, 400);
  assert.equal((await call("POST", "", { title: "a", priority: "urgent" })).status, 422);
  assert.equal((await call("POST", "", { title: "a", dueDate: "2026-02-31" })).status, 422);
  const bad = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(bad.status, 400);
});

test("list: filter, search, sort, pagination", async () => {
  resetTasks([]);
  await call("POST", "", { title: "Buy milk", priority: "low", dueDate: "2026-11-02" });
  await call("POST", "", { title: "Write report", description: "quarterly numbers", priority: "high", dueDate: "2026-10-30" });
  const c = await call("POST", "", { title: "Call mom", priority: "medium" });
  await call("PATCH", `/${c.json.data.id}`, { completed: true });

  let r = await call("GET");
  assert.equal(r.json.total, 3);
  r = await call("GET", "?completed=true");
  assert.deepEqual(r.json.data.map((t) => t.title), ["Call mom"]);
  r = await call("GET", "?completed=false&sort=dueDate");
  assert.deepEqual(r.json.data.map((t) => t.title), ["Write report", "Buy milk"]);
  r = await call("GET", "?sort=-dueDate");
  assert.deepEqual(r.json.data.map((t) => t.title), ["Buy milk", "Write report", "Call mom"]);
  r = await call("GET", "?search=QUARTERLY");
  assert.equal(r.json.count, 1);
  r = await call("GET", "?priority=high");
  assert.equal(r.json.data[0].title, "Write report");
  r = await call("GET", "?sort=priority");
  assert.equal(r.json.data[0].priority, "low");
  r = await call("GET", "?limit=2&page=2");
  assert.equal(r.json.count, 1);
  assert.equal(r.json.totalPages, 2);
  assert.equal((await call("GET", "?completed=maybe")).status, 400);
  assert.equal((await call("GET", "?sort=bogus")).status, 400);
  assert.equal((await call("GET", "?page=0")).status, 400);
});

test("get one, 404 and 400 ids", async () => {
  resetTasks([]);
  const { json } = await call("POST", "", { title: "One" });
  const id = json.data.id;
  assert.equal((await call("GET", `/${id}`)).json.data.title, "One");
  assert.equal((await call("GET", "/00000000-0000-4000-8000-000000000000")).status, 404);
  assert.equal((await call("GET", "/not-an-id")).status, 400);
});

test("PUT replaces, PATCH changes only sent fields", async () => {
  resetTasks([]);
  const { json } = await call("POST", "", { title: "Old", description: "keep?", priority: "high", dueDate: "2026-12-01" });
  const id = json.data.id;
  const createdAt = json.data.createdAt;

  let r = await call("PATCH", `/${id}`, { completed: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.completed, true);
  assert.equal(r.json.data.description, "keep?");

  r = await call("PUT", `/${id}`, { title: "New" });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.title, "New");
  assert.equal(r.json.data.description, "");        // replaced with default
  assert.equal(r.json.data.dueDate, null);
  assert.equal(r.json.data.completed, false);
  assert.equal(r.json.data.id, id);
  assert.equal(r.json.data.createdAt, createdAt);

  assert.equal((await call("PATCH", `/${id}`, {})).status, 400);
  assert.equal((await call("PATCH", `/${id}`, { completed: "yes" })).status, 422);
  assert.equal((await call("PUT", `/${id}`, { description: "no title" })).status, 400);
  r = await call("PATCH", `/${id}`, { dueDate: null });
  assert.equal(r.json.data.dueDate, null);
});

test("delete one and bulk delete completed", async () => {
  resetTasks([]);
  const a = (await call("POST", "", { title: "a" })).json.data;
  const b = (await call("POST", "", { title: "b" })).json.data;
  const c = (await call("POST", "", { title: "c" })).json.data;
  await call("PATCH", `/${b.id}`, { completed: true });
  await call("PATCH", `/${c.id}`, { completed: true });

  assert.equal((await call("DELETE")).status, 400);   // never wipe everything by accident
  assert.equal((await call("GET")).json.total, 3);

  let r = await call("DELETE", "?completed=true");
  assert.equal(r.json.deletedCount, 2);
  assert.equal((await call("GET")).json.total, 1);

  r = await call("DELETE", `/${a.id}`);
  assert.equal(r.status, 200);
  assert.equal((await call("DELETE", `/${a.id}`)).status, 404);
});

test("unsupported method and unknown route", async () => {
  const r = await fetch(base, { method: "PUT" });
  assert.equal(r.status, 405);
  assert.ok(r.headers.get("allow").includes("POST"));
  const x = await fetch(base.replace("/tasks", "/nope"));
  assert.equal(x.status, 404);
});
