// Maps /api/v1/tasks[/:id] to the right handler.
// Used by the Vite dev server and the tests. On Vercel, the files in /api do this job.
import { collectionHandler, itemHandler } from "./tasks.js";
import { send, parseUrl } from "./http.js";

export function route(req, res) {
  const segments = parseUrl(req).pathname.split("/").filter(Boolean);
  const isTasks = segments[0] === "api" && segments[1] === "v1" && segments[2] === "tasks";
  if (isTasks && segments.length === 3) return collectionHandler(req, res);
  if (isTasks && segments.length === 4) return itemHandler(req, res);
  return send(res, 404, {
    success: false,
    error: { code: "NOT_FOUND", message: "No such API route." },
  });
}
