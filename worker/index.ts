/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { initializeRuntime } from "../platform/runtime";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  RESUMES?: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startedAt = Date.now();
    const suppliedRequestId = request.headers.get("x-request-id") || "";
    const requestId = /^[a-z0-9._-]{1,100}$/i.test(suppliedRequestId) ? suppliedRequestId : crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;
    try {
      await initializeRuntime(env as unknown as Record<string, unknown>);
      if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        response = await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
      } else {
        response = await handler.fetch(request, env, ctx);
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "applitrail.request.failed",
        requestId,
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.name : "UnknownError",
      }));
      response = url.pathname.startsWith("/api/")
        ? Response.json({ error: "AppliTrail could not complete this request. Please try again." }, { status: 500 })
        : new Response("AppliTrail is temporarily unavailable.", { status: 500 });
    }

    const headers = new Headers(response.headers);
    headers.set("X-Request-ID", requestId);
    if (url.pathname.startsWith("/api/")) headers.set("Cache-Control", "no-store");
    const secured = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    console.info(JSON.stringify({
      event: "applitrail.request.completed",
      requestId,
      method: request.method,
      path: url.pathname,
      status: secured.status,
      durationMs: Date.now() - startedAt,
    }));
    return secured;
  },
};

export default worker;
