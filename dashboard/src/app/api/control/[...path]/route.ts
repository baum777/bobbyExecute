import { NextRequest, NextResponse } from "next/server";
import { forwardControlRequest } from "../../../../lib/control-client";
import { buildDashboardOperatorAssertion, parseDashboardSessionCookie, isDashboardSessionActive } from "@/lib/operator-auth";
import { canRolePerformAction, type DashboardControlAction } from "@/lib/operator-policy";
import { DASHBOARD_SESSION_COOKIE } from "@/lib/operator-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function resolveTargetPath(segments: string[]): string {
  const joined = segments.join("/").replace(/^\/+/, "");
  if (!joined || joined === "status") {
    return "/control/status";
  }
  if (joined === "emergency-stop") {
    return "/emergency-stop";
  }
  if (joined === "reset") {
    return "/control/reset";
  }
  if (joined.startsWith("control/")) {
    return `/${joined}`;
  }
  return `/control/${joined}`;
}

function resolveMutationAction(targetPath: string): { action: DashboardControlAction; target: string } | null {
  if (targetPath === "/emergency-stop" || targetPath === "/control/emergency-stop" || targetPath === "/control/halt") {
    return { action: "emergency_stop", target: targetPath };
  }
  if (targetPath === "/control/reset") {
    return { action: "reset_kill_switch", target: targetPath };
  }
  if (targetPath === "/control/pause") {
    return { action: "pause", target: targetPath };
  }
  if (targetPath === "/control/resume") {
    return { action: "resume", target: targetPath };
  }
  if (targetPath === "/control/restart-worker") {
    return { action: "restart_worker", target: targetPath };
  }
  if (targetPath === "/control/mode") {
    return { action: "mode_change", target: targetPath };
  }
  if (targetPath === "/control/runtime-config") {
    return { action: "runtime_config_change", target: targetPath };
  }
  if (targetPath === "/control/reload") {
    return { action: "reload", target: targetPath };
  }
  if (/^\/control\/restart-alerts\/[^/]+\/acknowledge$/.test(targetPath)) {
    return { action: "acknowledge_restart_alert", target: targetPath };
  }
  if (/^\/control\/restart-alerts\/[^/]+\/resolve$/.test(targetPath)) {
    return { action: "resolve_restart_alert", target: targetPath };
  }
  if (targetPath === "/control/live-promotion/request") {
    return { action: "live_promotion_request", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/approve$/.test(targetPath)) {
    return { action: "live_promotion_approve", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/deny$/.test(targetPath)) {
    return { action: "live_promotion_deny", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/apply$/.test(targetPath)) {
    return { action: "live_promotion_apply", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/rollback$/.test(targetPath)) {
    return { action: "live_promotion_rollback", target: targetPath };
  }
  return null;
}

function extractProxyHeaders(request: NextRequest): HeadersInit {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const requestId = request.headers.get("x-request-id");
  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  const idempotencyKey = request.headers.get("x-idempotency-key");
  if (idempotencyKey) {
    headers.set("x-idempotency-key", idempotencyKey);
  }

  return headers;
}

function resolveRequestSearch(request: Request | NextRequest): string {
  if ("nextUrl" in request && request.nextUrl) {
    return request.nextUrl.search ?? "";
  }

  return new URL(request.url).search;
}

function getRequestCookieValue(request: Request | NextRequest, name: string): string | undefined {
  if ("cookies" in request && request.cookies) {
    return request.cookies.get(name)?.value;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const cookieName = trimmed.slice(0, separatorIndex).trim();
    if (cookieName === name) {
      return trimmed.slice(separatorIndex + 1).trim();
    }
  }

  return undefined;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const targetPath = resolveTargetPath(path);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  const search = resolveRequestSearch(request);
  const proxyPath = search ? `${targetPath}${search}` : targetPath;
  const mutationAction = resolveMutationAction(targetPath);
  const session = parseDashboardSessionCookie(getRequestCookieValue(request, DASHBOARD_SESSION_COOKIE), process.env);
  const activeSession = session && isDashboardSessionActive(session) ? session : null;
  if (!activeSession) {
    return NextResponse.json(
      {
        success: false,
        message: "Dashboard operator session is required for control proxy access.",
      },
      { status: 401 }
    );
  }

  const operatorHeaders: HeadersInit | undefined = mutationAction
    ? {
        "x-dashboard-operator-assertion": buildDashboardOperatorAssertion(
          activeSession,
          {
            action: mutationAction.action,
            target: mutationAction.target,
            requestId: request.headers.get("x-request-id") ?? undefined,
            authResult: canRolePerformAction(activeSession.role, mutationAction.action) ? "authorized" : "denied",
            reason: activeSession
              ? canRolePerformAction(activeSession.role, mutationAction.action)
                ? undefined
                : `role '${activeSession.role}' cannot perform '${mutationAction.action}'`
              : "missing operator session",
          },
          process.env
        ),
      }
    : undefined;

  const upstream = await forwardControlRequest(
    proxyPath,
    {
      method: request.method,
      headers: extractProxyHeaders(request),
      body,
    },
    process.env,
    operatorHeaders
  );

  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
    },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
