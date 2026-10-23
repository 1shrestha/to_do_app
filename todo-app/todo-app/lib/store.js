import { randomUUID } from "node:crypto";
// In-memory task store.
// The array lives on globalThis so it survives between requests while the
// server (or a warm serverless instance) stays alive. It is NOT permanent
// storage: replace this file with a database (e.g. MongoDB) for real persistence.

const KEY = "__TODO_TASKS__";

function seed() {
  const now = new Date().toISOString();
  const make = (title, description, priority) => ({
    id: randomUUID(),
    title,
    description,
    completed: false,
    priority,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
  });
  return [
    make("Plan the To-Do APIs", "List every endpoint, method and response", "high"),
    make("Build the React front end", "Add, edit, complete and delete tasks", "medium"),
  ];
}

export function getTasks() {
  if (!globalThis[KEY]) globalThis[KEY] = seed();
  return globalThis[KEY];
}

export function setTasks(next) {
  globalThis[KEY] = next;
}

export function resetTasks(next = []) {
  globalThis[KEY] = next;
}
