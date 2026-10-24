import type {
    PaidPlanId,
    PlanId,
    PlanPeriod,
    SubscriptionPlan,
} from "./type.js";

/**
 * =========================
 * PLAN CATALOGUE
 * =========================
 *
 * Single source of truth for pricing and limits.
 *
 * SECURITY:
 * Prices here are the ONLY prices the server accepts. The client sends a
 * planId and nothing else — never an amount, never a limit. Changing a
 * number in this file changes what every owner is charged.
 *
 * Amounts are in paise (1 rupee = 100 paise).
 */

/**
 * The tier every owner falls back to. No expiry, no payment.
 */
export const FREE_PLAN: SubscriptionPlan = {
    id: "free",
    name: "Free",
    tier: "free",
    period: "none",
    pricePaise: 0,
    durationDays: null,
    listingLimit: 2,
    maxImages: 2,
};

/**
 * Purchasable plans, grouped by tier then period so the UI can render one
 * card per tier with a monthly/quarterly toggle.
 */
export const PAID_PLANS: readonly SubscriptionPlan[] = [
    {
        id: "basic_monthly",
        name: "Basic",
        tier: "basic",
        period: "monthly",
        pricePaise: 29900,
        durationDays: 30,
        listingLimit: 5,
        maxImages: 4,
    },
    {
        id: "basic_quarterly",
        name: "Basic",
        tier: "basic",
        period: "quarterly",
        pricePaise: 79900,
        durationDays: 90,
        listingLimit: 5,
        maxImages: 4,
    },
    {
        id: "pro_monthly",
        name: "Pro",
        tier: "pro",
        period: "monthly",
        pricePaise: 59900,
        durationDays: 30,
        listingLimit: 10,
        maxImages: 8,
    },
    {
        id: "pro_quarterly",
        name: "Pro",
        tier: "pro",
        period: "quarterly",
        pricePaise: 159900,
        durationDays: 90,
        listingLimit: 10,
        maxImages: 8,
    },
];

/**
 * Hard ceiling for admins, who have no subscription.
 *
 * Admins manage any listing, so they are not capped by a purchasable plan —
 * this preserves the previous fixed MAX_IMAGES of 8.
 */
export const ADMIN_IMAGE_CEILING = 8;

const PLAN_IDS = new Set<string>([
    FREE_PLAN.id,
    ...PAID_PLANS.map((plan) => plan.id),
]);

/**
 * Look up a plan by id.
 *
 * Returns null for the free tier and for anything unrecognised — callers that
 * accept money must only proceed for a paid plan.
 */
export const getPlan = (planId: string): SubscriptionPlan | null =>
    PAID_PLANS.find((plan) => plan.id === planId) ?? null;

export const isKnownPlanId = (planId: string): planId is PlanId =>
    PLAN_IDS.has(planId);

/** Every plan id that a checkout can be started for. */
export const isPaidPlanId = (planId: string): planId is PaidPlanId =>
    PAID_PLANS.some((plan) => plan.id === planId);

/**
 * Group the paid plans by tier so the frontend can render one card per tier
 * with a period switch, without hardcoding tier names or prices.
 */
export const listPlanTiers = (): {
    tier: Exclude<SubscriptionPlan["tier"], "free">;
    periods: Record<PlanPeriod, SubscriptionPlan>;
}[] => {
    const tiers: Exclude<SubscriptionPlan["tier"], "free">[] = ["basic", "pro"];

    return tiers.map((tier) => {
        const forTier = PAID_PLANS.filter((plan) => plan.tier === tier);
        const monthly = forTier.find((plan) => plan.period === "monthly");
        const quarterly = forTier.find((plan) => plan.period === "quarterly");

        if (!monthly || !quarterly) {
            throw new Error(
                `Plan catalogue is incomplete: tier "${tier}" needs a monthly and a quarterly plan`
            );
        }

        return { tier, periods: { monthly, quarterly } };
    });
};
