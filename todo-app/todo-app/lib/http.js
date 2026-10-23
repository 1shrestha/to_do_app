// Small helpers shared by every API handler.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(status === 204 ? "" : JSON.stringify(payload));
}

export function sendError(res, err) {
  if (err instanceof ApiError) {
    return send(res, err.status, {
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error(err);
  return send(res, 500, {
    success: false,
    error: { code: "SERVER_ERROR", message: "Something went wrong on the server." },
  });
}

export function parseUrl(req) {
  return new URL(req.url, "http://localhost");
}

// Reads a JSON body. Vercel pre-parses it into req.body; plain Node does not.
export async function readJson(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "string") return parseJson(req.body);
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? parseJson(raw) : {};
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return send(res, 405, {
    success: false,
    error: { code: "METHOD_NOT_ALLOWED", message: `Use one of: ${allowed.join(", ")}.` },
  });
}
