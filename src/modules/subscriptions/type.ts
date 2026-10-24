/**
 * =========================
 * SUBSCRIPTION TYPES
 * =========================
 */

export type PlanTier = "free" | "basic" | "pro";

export type PaidPlanTier = Exclude<PlanTier, "free">;

/**
 * Billing period for a purchasable plan.
 *
 * The free tier is not purchased and has no period.
 */
export type PlanPeriod = "monthly" | "quarterly";

export type PlanId =
    | "free"
    | "basic_monthly"
    | "basic_quarterly"
    | "pro_monthly"
    | "pro_quarterly";

export type PaidPlanId = Exclude<PlanId, "free">;

export interface SubscriptionPlan {
    id: PlanId;
    name: string;
    tier: PlanTier;
    period: PlanPeriod | "none";
    /** Price in paise. Smallest INR unit; never a float. */
    pricePaise: number;
    /** Null means the plan never expires (the free tier). */
    durationDays: number | null;
    /** Null means unlimited. */
    listingLimit: number | null;
    /** Maximum photos allowed per listing. */
    maxImages: number;
}

export type SubscriptionStatus = "created" | "active" | "failed";

export interface ISubscription {
    owner: import("mongoose").Types.ObjectId;
    planId: PaidPlanId;
    /** Denormalised from the plan so an entitlement read never needs a lookup. */
    tier: PaidPlanTier;
    period: PlanPeriod;
    durationDays: number;
    /** Snapshot at purchase time — plan edits must not rewrite history. */
    listingLimit: number | null;
    maxImages: number;
    amountPaise: number;
    currency: string;
    status: SubscriptionStatus;
    razorpayOrderId: string;
    razorpayPaymentId?: string;
    startsAt?: Date;
    expiresAt?: Date;
    created_at?: Date;
    updated_at?: Date;
}

/**
 * Shape returned by GET /subscriptions/me
 * and POST /subscriptions/verify.
 */
export interface Entitlement {
    planId: PlanId;
    planName: string;
    tier: PlanTier;
    listingLimit: number | null;
    maxImages: number;
    /** Null when the owner is on the free tier or nothing is active. */
    expiresAt: string | null;
    /** Owner's live listing count. */
    used: number;
    canCreate: boolean;
}

/**
 * Minimal projection of an active subscription needed to resolve an
 * entitlement. Kept structural so the resolver stays unit-testable
 * without a database.
 */
export interface EntitlementCandidate {
    listingLimit: number | null;
    maxImages: number;
    expiresAt: Date;
}

/**
 * What the repository actually returns: an entitlement candidate plus just
 * enough identity to describe the plan back to the client.
 */
export interface ActiveSubscription extends EntitlementCandidate {
    planId: PaidPlanId;
    tier: PaidPlanTier;
}
