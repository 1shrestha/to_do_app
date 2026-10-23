// Thin client for the REST API (see README for the endpoint list).
const BASE = "/api/v1/tasks";

async function request(path = "", options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status}).`);
  return body;
}

const query = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
};

export const api = {
  list: (params = {}) => request(query(params)),
  create: (task) => request("", { method: "POST", body: JSON.stringify(task) }),
  replace: (id, task) => request(`/${id}`, { method: "PUT", body: JSON.stringify(task) }),
  patch: (id, changes) => request(`/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  remove: (id) => request(`/${id}`, { method: "DELETE" }),
  clearCompleted: () => request("?completed=true", { method: "DELETE" }),
};
