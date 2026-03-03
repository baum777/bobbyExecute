/**
 * Review gates with commit tokens.
 * EXTRACTED from OrchestrAI_Labs packages/governance/src/review/inmemory-review-queue.ts
 * MAPPED from postgres-review-store.ts - commit token verification pattern.
 */
import crypto from "node:crypto";
import type { Permission } from "../core/contracts/agent.js";

export interface ReviewRequest {
  id: string;
  agentId: string;
  permission: Permission;
  payload: unknown;
  reviewerRoles: string[];
  createdAt: string;
  projectId?: string;
  clientId?: string;
  userId?: string;
}

export interface ReviewQueue {
  create(req: ReviewRequest): Promise<void>;
}

export interface ReviewStore extends ReviewQueue {
  getApprovedForCommit(input: {
    reviewId: string;
    token: string;
  }): Promise<{
    ok: boolean;
    reason?: string;
    permission?: Permission;
    agentId?: string;
    payload?: unknown;
  }>;
  markTokenUsed(reviewId: string): Promise<void>;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * In-memory review store with commit token support.
 */
export class InMemoryReviewStore implements ReviewStore {
  private reviews: Map<
    string,
    ReviewRequest & {
      status?: "pending" | "approved" | "rejected";
      commitTokenHash?: string;
      commitTokenUsed?: boolean;
    }
  > = new Map();

  async create(req: ReviewRequest): Promise<void> {
    this.reviews.set(req.id, {
      ...req,
      status: "pending",
      commitTokenUsed: false,
    });
  }

  approve(reviewId: string, commitToken: string): void {
    const r = this.reviews.get(reviewId);
    if (!r) throw new Error(`Review not found: ${reviewId}`);
    r.status = "approved";
    r.commitTokenHash = sha256(commitToken);
  }

  async getApprovedForCommit(input: {
    reviewId: string;
    token: string;
  }): Promise<{
    ok: boolean;
    reason?: string;
    permission?: Permission;
    agentId?: string;
    payload?: unknown;
  }> {
    const r = this.reviews.get(input.reviewId);
    if (!r) return { ok: false, reason: "Review not found" };
    if (r.status !== "approved")
      return { ok: false, reason: "Review not approved" };
    if (!r.commitTokenHash)
      return { ok: false, reason: "No commit token issued" };
    if (r.commitTokenUsed)
      return { ok: false, reason: "Commit token already used" };
    if (r.commitTokenHash !== sha256(input.token))
      return { ok: false, reason: "Invalid commit token" };

    return {
      ok: true,
      agentId: r.agentId,
      permission: r.permission as Permission,
      payload: r.payload,
    };
  }

  async markTokenUsed(reviewId: string): Promise<void> {
    const r = this.reviews.get(reviewId);
    if (!r || r.status !== "approved" || r.commitTokenUsed) {
      throw new Error(
        "Failed to mark commit token used (already used or not approved)"
      );
    }
    r.commitTokenUsed = true;
  }
}
