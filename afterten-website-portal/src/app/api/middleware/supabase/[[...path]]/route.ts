import { authenticateMiddlewareRequest, MiddlewareAuthError } from "@/lib/middleware-api-auth";
import {
  forwardMiddlewareSupabaseRequest,
  MiddlewareProxyError,
} from "@/lib/middleware-supabase-proxy";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function handle(request: Request, context: RouteContext) {
  try {
    const auth = await authenticateMiddlewareRequest(request);
    const { path = [] } = await context.params;
    const url = new URL(request.url);
    const bodyText =
      request.method === "GET" || request.method === "HEAD" ? null : await request.text();

    return await forwardMiddlewareSupabaseRequest({
      method: request.method,
      pathParts: path,
      searchParams: url.searchParams,
      bodyText,
      auth,
    });
  } catch (error) {
    if (error instanceof MiddlewareAuthError || error instanceof MiddlewareProxyError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }

    console.error("Middleware supabase proxy failed", error);
    return Response.json({ ok: false, error: "Middleware proxy failed" }, { status: 500 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handle(request, context);
}
