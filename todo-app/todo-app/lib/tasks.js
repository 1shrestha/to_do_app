import { randomUUID } from "node:crypto";
import { ApiError, send, sendError, readJson, parseUrl, methodNotAllowed } from "./http.js";
import { getTasks, setTasks } from "./store.js";

const PRIORITIES = ["low", "medium", "high"];
const PRIORITY_RANK = { low: 1, medium: 2, high: 3 };
const SORT_FIELDS = ["title", "dueDate", "priority", "createdAt", "updatedAt"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 100;

// ---------- validation ----------

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Returns only the editable fields that were present (and valid) in the body.
function parseFields(body, { requireTitle }) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const out = {};

  if (requireTitle || "title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) throw new ApiError(400, "VALIDATION_ERROR", "title is required.");
    if (title.length > 100) {
      throw new ApiError(400, "VALIDATION_ERROR", "title must be 100 characters or fewer.");
    }
    out.title = title;
  }
  if ("description" in body) {
    const d = body.description;
    if (d !== null && typeof d !== "string") {
      throw new ApiError(422, "INVALID_VALUE", "description must be a string.");
    }
    if ((d ?? "").length > 500) {
      throw new ApiError(422, "INVALID_VALUE", "description must be 500 characters or fewer.");
    }
    out.description = (d ?? "").trim();
  }
  if ("completed" in body) {
    if (typeof body.completed !== "boolean") {
      throw new ApiError(422, "INVALID_VALUE", "completed must be true or false.");
    }
    out.completed = body.completed;
  }
  if ("priority" in body) {
    if (!PRIORITIES.includes(body.priority)) {
      throw new ApiError(422, "INVALID_VALUE", "priority must be low, medium or high.");
    }
    out.priority = body.priority;
  }
  if ("dueDate" in body) {
    const v = body.dueDate;
    if (v === null || v === "") out.dueDate = null;
    else if (typeof v === "string" && validDate(v)) out.dueDate = v;
    else throw new ApiError(422, "INVALID_VALUE", "dueDate must be a valid date like 2026-11-05.");
  }
  return out;
}

function requireId(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const id = segments[segments.length - 1];
  if (!UUID.test(id || "")) throw new ApiError(400, "INVALID_ID", "The task id is not valid.");
  return id;
}

function findIndex(id) {
  const index = getTasks().findIndex((t) => t.id === id);
  if (index === -1) throw new ApiError(404, "NOT_FOUND", "No task found with that id.");
  return index;
}

// ---------- list helpers ----------

function intParam(params, name, fallback, max) {
  if (!params.has(name)) return fallback;
  const n = Number(params.get(name));
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, "INVALID_QUERY", `${name} must be a positive whole number.`);
  }
  return Math.min(n, max);
}

function compareBy(field) {
  return (a, b) => {
    let x = a[field];
    let y = b[field];
    if (field === "priority") [x, y] = [PRIORITY_RANK[x], PRIORITY_RANK[y]];
    if (field === "dueDate") {
      // tasks without a due date always sort last
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
    }
    if (typeof x === "string") return x.localeCompare(y);
    return x - y;
  };
}

// ---------- operations ----------

function listTasks(res, url) {
  const p = url.searchParams;
  let items = [...getTasks()];

  if (p.has("completed")) {
    const v = p.get("completed");
    if (v !== "true" && v !== "false") {
      throw new ApiError(400, "INVALID_QUERY", "completed must be true or false.");
    }
    items = items.filter((t) => t.completed === (v === "true"));
  }
  if (p.has("priority")) {
    if (!PRIORITIES.includes(p.get("priority"))) {
      throw new ApiError(400, "INVALID_QUERY", "priority must be low, medium or high.");
    }
    items = items.filter((t) => t.priority === p.get("priority"));
  }
  if (p.get("search")) {
    const q = p.get("search").trim().toLowerCase();
    items = items.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }

  const sort = p.get("sort") || "-createdAt";
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  if (!SORT_FIELDS.includes(field)) {
    throw new ApiError(400, "INVALID_QUERY", `sort must be one of: ${SORT_FIELDS.join(", ")}.`);
  }
  const cmp = compareBy(field);
  items.sort((a, b) => {
    // keep "no due date" last in both directions
    if (field === "dueDate" && (a.dueDate === null || b.dueDate === null)) return cmp(a, b);
    return desc ? -cmp(a, b) : cmp(a, b);
  });

  const limit = intParam(p, "limit", MAX_LIMIT, MAX_LIMIT);
  const page = intParam(p, "page", 1, Number.MAX_SAFE_INTEGER);
  const total = items.length;
  const data = items.slice((page - 1) * limit, page * limit);

  send(res, 200, {
    success: true,
    count: data.length,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    data,
  });
}

async function createTask(req, res) {
  const fields = parseFields(await readJson(req), { requireTitle: true });
  const now = new Date().toISOString();
  const task = {
    id: randomUUID(), // the server owns id generation
    title: fields.title,
    description: fields.description ?? "",
    completed: fields.completed ?? false,
    priority: fields.priority ?? "medium",
    dueDate: fields.dueDate ?? null,
    createdAt: now,
    updatedAt: now,
  };
  getTasks().push(task);
  send(res, 201, { success: true, data: task });
}

function deleteCompleted(res, url) {
  if (url.searchParams.get("completed") !== "true") {
    throw new ApiError(
      400,
      "FILTER_REQUIRED",
      "DELETE /tasks needs ?completed=true. Use DELETE /tasks/:id to remove one task."
    );
  }
  const before = getTasks();
  const remaining = before.filter((t) => !t.completed);
  setTasks(remaining);
  send(res, 200, { success: true, deletedCount: before.length - remaining.length });
}

// ---------- route handlers ----------

// /api/v1/tasks
export async function collectionHandler(req, res) {
  try {
    const url = parseUrl(req);
    if (req.method === "GET") return listTasks(res, url);
    if (req.method === "POST") return await createTask(req, res);
    if (req.method === "DELETE") return deleteCompleted(res, url);
    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  } catch (err) {
    return sendError(res, err);
  }
}

// /api/v1/tasks/:id
export async function itemHandler(req, res) {
  try {
    const url = parseUrl(req);
    const allowed = ["GET", "PUT", "PATCH", "DELETE"];
    if (!allowed.includes(req.method)) return methodNotAllowed(res, allowed);

    const id = requireId(url);
    const index = findIndex(id);
    const tasks = getTasks();
    const current = tasks[index];

    if (req.method === "GET") return send(res, 200, { success: true, data: current });

    if (req.method === "DELETE") {
      tasks.splice(index, 1);
      return send(res, 200, { success: true, message: "Task deleted", id });
    }

    const body = await readJson(req);
    let updated;
    if (req.method === "PUT") {
      // PUT replaces every editable field; omitted ones fall back to defaults
      const f = parseFields(body, { requireTitle: true });
      updated = {
        ...current,
        title: f.title,
        description: f.description ?? "",
        completed: f.completed ?? false,
        priority: f.priority ?? "medium",
        dueDate: f.dueDate ?? null,
      };
    } else {
      const f = parseFields(body, { requireTitle: false });
      if (Object.keys(f).length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "Send at least one field to update.");
      }
      updated = { ...current, ...f };
    }
    updated.updatedAt = new Date().toISOString();
    tasks[index] = updated;
    return send(res, 200, { success: true, data: updated });
  } catch (err) {
    return sendError(res, err);
  }
}
