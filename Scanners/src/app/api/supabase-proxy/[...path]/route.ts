import { NextRequest, NextResponse } from "next/server";

const PROJECT_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "";
const ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "";
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function stripHopByHopHeaders(headers: Headers) {
  const cloned = new Headers(headers);
  [
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "origin",
    "referer",
  ].forEach((key) => cloned.delete(key));
  return cloned;
}

async function proxy(request: NextRequest, params: Promise<{ path: string[] }>) {
  if (!PROJECT_URL) {
    return NextResponse.json({ error: "Supabase URL is not configured" }, { status: 500 });
  }

  const host = request.headers.get("host") ?? "";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocalhost) {
    return NextResponse.json({ error: "Proxy is only available on localhost" }, { status: 403 });
  }

  const url = new URL(request.url);
  const target = new URL(PROJECT_URL);
  const resolvedParams = await params;
  const path = resolvedParams?.path?.join("/") ?? "";
  target.pathname = `/${path}`;
  target.search = url.search;

  const headers = stripHopByHopHeaders(request.headers);
  const authKey = SERVICE_ROLE_KEY || ANON_KEY;
  if (authKey) {
    headers.set("apikey", authKey);
    headers.set("authorization", `Bearer ${authKey}`);
  }
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const response = await fetch(target.toString(), {
    method: request.method,
    headers,
    body,
  });

  if (response.status >= 400) {
    console.warn("[supabase-proxy]", request.method, target.toString(), response.status);
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.set("x-supabase-proxy", "1");

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context.params);
}
