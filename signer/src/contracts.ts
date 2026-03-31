import { z } from "zod";

export const SignerPurposeSchema = z.enum(["live_swap", "generic"]);
export type SignerPurpose = z.infer<typeof SignerPurposeSchema>;

export const SignerPayloadKindSchema = z.enum(["transaction", "message"]);
export type SignerPayloadKind = z.infer<typeof SignerPayloadKindSchema>;

export const SignerEncodingSchema = z.literal("base64");
export type SignerEncoding = z.infer<typeof SignerEncodingSchema>;

export const SignerRequestItemSchema = z
  .object({
    id: z.string().min(1),
    kind: SignerPayloadKindSchema,
    encoding: SignerEncodingSchema,
    payload: z.string().min(1),
  })
  .strict();

export type SignerRequestItem = z.infer<typeof SignerRequestItemSchema>;

export const SignerRequestSchema = z
  .object({
    purpose: SignerPurposeSchema,
    walletAddress: z.string().min(32),
    keyId: z.string().min(1).optional(),
    transactions: z.array(SignerRequestItemSchema).min(1),
  })
  .strict();

export type SignerRequest = z.infer<typeof SignerRequestSchema>;

export const SignerResponseItemSchema = z
  .object({
    id: z.string().min(1),
    kind: SignerPayloadKindSchema,
    encoding: SignerEncodingSchema,
    signedPayload: z.string().min(1),
  })
  .strict();

export type SignerResponseItem = z.infer<typeof SignerResponseItemSchema>;

export const SignerResponseSchema = z
  .object({
    walletAddress: z.string().min(32),
    keyId: z.string().min(1).optional(),
    signedTransactions: z.array(SignerResponseItemSchema).min(1),
  })
  .strict();

export type SignerResponse = z.infer<typeof SignerResponseSchema>;

export type SignerServiceErrorCode =
  | "SIGNER_INVALID_AUTH"
  | "SIGNER_REQUEST_TOO_LARGE"
  | "SIGNER_REQUEST_INVALID"
  | "SIGNER_UNSUPPORTED_REQUEST"
  | "SIGNER_WALLET_MISMATCH"
  | "SIGNER_SIGNING_FAILED"
  | "SIGNER_INTERNAL";

export class SignerServiceError extends Error {
  constructor(
    public readonly code: SignerServiceErrorCode,
    message: string,
    public readonly status = 500,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "SignerServiceError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function validateSignerResponseMatchesRequest(
  request: SignerRequest,
  response: SignerResponse
): void {
  if (response.walletAddress !== request.walletAddress) {
    throw new SignerServiceError(
      "SIGNER_WALLET_MISMATCH",
      "Signed response walletAddress did not match the request walletAddress.",
      409
    );
  }

  if (response.signedTransactions.length !== request.transactions.length) {
    throw new SignerServiceError(
      "SIGNER_REQUEST_INVALID",
      "Signed response item count did not match the request item count.",
      500
    );
  }

  const requestById = new Map(request.transactions.map((item) => [item.id, item]));
  for (const signedItem of response.signedTransactions) {
    const original = requestById.get(signedItem.id);
    if (!original) {
      throw new SignerServiceError(
        "SIGNER_REQUEST_INVALID",
        `Signed response contained unexpected item '${signedItem.id}'.`,
        500
      );
    }

    if (signedItem.kind !== original.kind || signedItem.encoding !== original.encoding) {
      throw new SignerServiceError(
        "SIGNER_REQUEST_INVALID",
        `Signed response item '${signedItem.id}' changed the requested payload shape.`,
        500
      );
    }
  }
}
