import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { SignerRequestSchema, SignerResponseSchema, SignerServiceError, validateSignerResponseMatchesRequest } from "./contracts.js";
import type { SignerBackend } from "./backend.js";

const MAX_REQUEST_BYTES = 256 * 1024;

export interface SignerServerConfig {
  authToken: string;
}

function jsonResponse(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function unauthorized(res: ServerResponse): void {
  jsonResponse(res, 401, {
    error: {
      code: "SIGNER_INVALID_AUTH",
      message: "Unauthorized",
    },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new SignerServiceError(
        "SIGNER_REQUEST_TOO_LARGE",
        "Request body exceeded the maximum allowed size.",
        413
      );
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    throw new SignerServiceError("SIGNER_REQUEST_INVALID", "Request body was empty.", 400);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new SignerServiceError("SIGNER_REQUEST_INVALID", "Request body must be valid JSON.", 400, error);
  }
}

function extractBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") {
    return null;
  }

  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (rest.length > 0) {
    return null;
  }
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

function mapErrorStatus(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof SignerServiceError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: "SIGNER_INTERNAL",
    message: "Signer service failed unexpectedly.",
  };
}

export function createSignerServer(config: SignerServerConfig, backend: SignerBackend): Server {
  return createServer(async (req, res) => {
    const requestId = randomUUID();
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;

    try {
      if (pathname === "/health") {
        if (req.method !== "GET") {
          jsonResponse(res, 405, { error: { code: "SIGNER_REQUEST_INVALID", message: "Method not allowed" } });
          return;
        }

        jsonResponse(res, 200, { ok: true, service: "signer", requestId });
        return;
      }

      if (pathname !== "/sign" || req.method !== "POST") {
        jsonResponse(res, 404, { error: { code: "SIGNER_REQUEST_INVALID", message: "Not found" } });
        return;
      }

      const bearerToken = extractBearerToken(req.headers.authorization);
      if (!bearerToken || bearerToken !== config.authToken) {
        unauthorized(res);
        return;
      }

      const rawBody = await readJsonBody(req);
      const parsed = SignerRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        throw new SignerServiceError(
          "SIGNER_REQUEST_INVALID",
          `Request validation failed: ${parsed.error.message}`,
          400,
          parsed.error
        );
      }

      const signed = await backend.sign(parsed.data);
      const parsedResponse = SignerResponseSchema.safeParse(signed);
      if (!parsedResponse.success) {
        throw new SignerServiceError(
          "SIGNER_INTERNAL",
          `Backend returned invalid signer response: ${parsedResponse.error.message}`,
          500,
          parsedResponse.error
        );
      }
      validateSignerResponseMatchesRequest(parsed.data, parsedResponse.data);

      jsonResponse(res, 200, parsedResponse.data);
    } catch (error) {
      const mapped = mapErrorStatus(error);
      if (mapped.status >= 500) {
        console.error("[signer]", requestId, mapped.code, mapped.message);
      }
      jsonResponse(res, mapped.status, {
        error: {
          code: mapped.code,
          message: mapped.message,
          requestId,
        },
      });
    }
  });
}
