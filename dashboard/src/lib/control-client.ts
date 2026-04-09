export interface ControlClientOptions {
  baseUrl: string;
  token: string;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveControlServiceBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = trimOrUndefined(env.CONTROL_SERVICE_URL);
  if (explicit) {
    return explicit;
  }

  const host = trimOrUndefined(env.CONTROL_SERVICE_HOSTNAME);
  const port = trimOrUndefined(env.CONTROL_SERVICE_PORT) ?? trimOrUndefined(env.PORT);
  if (host && port) {
    return `http://${host}:${port}`;
  }

  if (env.NODE_ENV === "development") {
    return "http://127.0.0.1:3334";
  }

  throw new Error("CONTROL_SERVICE_URL or CONTROL_SERVICE_HOSTNAME/CONTROL_SERVICE_PORT must be configured.");
}

export function resolveControlServiceToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = trimOrUndefined(env.CONTROL_TOKEN);
  if (!token) {
    throw new Error("CONTROL_TOKEN must be configured for dashboard control proxying.");
  }
  return token;
}

function isReadOnlyRequest(method: string | undefined): boolean {
  return method == null || method === "GET" || method === "HEAD";
}

function normalizeRequestBody(body: BodyInit | null | undefined): BodyInit | undefined {
  if (typeof body === "string" && body.length === 0) {
    return undefined;
  }

  return body ?? undefined;
}

export function resolveControlServiceRequestToken(
  env: NodeJS.ProcessEnv = process.env,
  method: string | undefined = undefined
): string {
  if (isReadOnlyRequest(method)) {
    const operatorReadToken = trimOrUndefined(env.OPERATOR_READ_TOKEN);
    if (operatorReadToken) {
      return operatorReadToken;
    }
  }

  return resolveControlServiceToken(env);
}

export function buildControlServiceUrl(path: string, env: NodeJS.ProcessEnv = process.env): URL {
  const baseUrl = resolveControlServiceBaseUrl(env);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

export function buildControlRequestHeaders(
  initHeaders: HeadersInit | undefined,
  env: NodeJS.ProcessEnv = process.env,
  operatorHeaders: HeadersInit | undefined = undefined,
  method: string | undefined = undefined,
  body: BodyInit | null | undefined = undefined
): Headers {
  const headers = new Headers(initHeaders);
  headers.set("authorization", `Bearer ${resolveControlServiceRequestToken(env, method)}`);
  if (normalizeRequestBody(body) !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const forwardedOperatorHeaders = new Headers(operatorHeaders);
  for (const [name, value] of forwardedOperatorHeaders.entries()) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  return headers;
}

export interface ForwardControlRequestOptions extends RequestInit {
  path: string;
  env?: NodeJS.ProcessEnv;
}

export async function forwardControlRequest(
  path: string,
  init: RequestInit = {},
  env: NodeJS.ProcessEnv = process.env,
  operatorHeaders: HeadersInit | undefined = undefined
): Promise<Response> {
  const url = buildControlServiceUrl(path, env);
  const body = normalizeRequestBody(init.body);
  const headers = buildControlRequestHeaders(init.headers, env, operatorHeaders, init.method, body);
  return fetch(url, {
    ...init,
    body,
    headers,
    cache: "no-store",
  });
}
