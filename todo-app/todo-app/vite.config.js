import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { route } from "./lib/router.js";

// In development the API runs inside the Vite server, so one command
// (npm run dev) starts both the React app and the REST API.
function apiDevServer() {
  return {
    name: "todo-api-dev-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url.startsWith("/api/")) return next();
        Promise.resolve(route(req, res)).catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevServer()],
});
