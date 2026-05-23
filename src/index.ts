import { errorResponse, json } from "./http.js";
import { handleCreateLink, handleInspect } from "./routes/api.js";
import { handleDevelopmentRoute, isDevelopmentOnlyPath } from "./routes/dev.js";
import { handleImage, handleShare } from "./routes/share.js";
import type { WorkerEnv } from "./types.js";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "mygh" });
      }

      if (request.method === "GET" && url.pathname === "/api/inspect") {
        return await handleInspect(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/links") {
        return await handleCreateLink(request, env);
      }

      if (request.method === "GET" && isDevelopmentOnlyPath(url.pathname)) {
        return await handleDevelopmentRoute(request, env);
      }

      const imageMatch = url.pathname.match(/^\/img\/([a-zA-Z0-9_-]+)\.png$/);
      if ((request.method === "GET" || request.method === "HEAD") && imageMatch) {
        return await handleImage(request, imageMatch[1], env);
      }

      const shareMatch = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
      if ((request.method === "GET" || request.method === "HEAD") && shareMatch) {
        return await handleShare(request, env, shareMatch[1]);
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("mygh is running.", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
