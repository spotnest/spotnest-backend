import { AppError } from "../../shared/errors/AppError.js";
import {
    createRazorpayOrder,
    verifyCheckoutSignature,
    verifyWebhookSignature,
} from "../../shared/utils/razorpay.js";
import { razorpayKeyId, razorpayWebhookSecret } from "../../shared/config/env.js";
import propertyRepository from "../properties/repository.js";
import settingsRepository from "../settings/repository.js";
import subscriptionRepository from "./repository.js";
import {
    ADMIN_IMAGE_CEILING,
    FREE_PLAN,
    getPlan,
    listPlanTiers,
} from "./plans.js";
import type {
    ActiveSubscription,
    Entitlement,
    EntitlementCandidate,
    PlanId,
    SubscriptionPlan,
} from "./type.js";
import type { CheckoutInput, VerifyInput } from "./validation.js";

const DAY_MS = 24 * 60 * 60 * 1000;


export const pickBestSubscription = <T extends EntitlementCandidate>(
    candidates: readonly T[]
): T | null => {
    let best: T | null = null;

    for (const candidate of candidates) {
        if (!best) {
            best = candidate;
            continue;
        }

        const bestLimit = best.listingLimit;
        const candidateLimit = candidate.listingLimit;

        // An unlimited best cannot be beaten by a capped candidate, but two
        // unlimited plans still tie-break on photo allowance.
        if (bestLimit === null) {
            if (
                candidateLimit === null &&
                candidate.maxImages > best.maxImages
            ) {
                best = candidate;
            }
            continue;
        }

        if (candidateLimit === null) {
            best = candidate;
            continue;
        }

        if (candidateLimit > bestLimit) {
            best = candidate;
            continue;
        }

        // Same listing cap — fall back to the roomier photo allowance.
        if (
            candidateLimit === bestLimit &&
            candidate.maxImages > best.maxImages
        ) {
            best = candidate;
        }
    }

    return best;
};

/**
 * True when `used` is still under `limit`. A null limit is unlimited.
 */
export const canCreateWithinLimit = (
    used: number,
    limit: number | null
): boolean => (limit === null ? true : used < limit);

/**
 * Describe a limit for an error message.
 */
const describeLimit = (limit: number | null): string =>
    limit === null ? "unlimited listings" : `${limit} listings`;


export const isCurrentlyValid = (expiresAt: Date, now: Date): boolean =>
    expiresAt.getTime() > now.getTime();


export const resolveEntitlement = (
    candidates: readonly EntitlementCandidate[],
    used: number,
    now: Date = new Date(),
    freePlan: SubscriptionPlan = FREE_PLAN
): Entitlement => {
    const best = pickBestSubscription(candidates);

    if (!best) {
        return {
            planId: freePlan.id,
            planName: freePlan.name,
            tier: freePlan.tier,
            listingLimit: freePlan.listingLimit,
            maxImages: freePlan.maxImages,
            expiresAt: null,
            used,
            canCreate: canCreateWithinLimit(used, freePlan.listingLimit),
        };
    }

   
    const active = best as EntitlementCandidate &
        Partial<Pick<ActiveSubscription, "planId" | "tier">>;

    return {
        planId: active.planId ?? freePlan.id,
        planName: active.planId ? planNameFor(active.planId) : freePlan.name,
        tier: active.tier ?? "pro",
        listingLimit: best.listingLimit,
        maxImages: best.maxImages,
        expiresAt: best.expiresAt.toISOString(),
        used,
        canCreate: canCreateWithinLimit(used, best.listingLimit),
    };
};


const planNameFor = (planId: string): string =>
    getPlan(planId)?.name ?? "Subscription";

const listPlans = (): {
    free: SubscriptionPlan;
    tiers: ReturnType<typeof listPlanTiers>;
} => ({
    free: FREE_PLAN,
    tiers: listPlanTiers(),
});


const getEntitlement = async (ownerId: string): Promise<Entitlement> => {
    const settings = await settingsRepository.getGlobal();
    const used = await propertyRepository.countByOwner(ownerId);

    if (!settings.subscriptionsEnabled) {
        return {
            planId: FREE_PLAN.id,
            planName: FREE_PLAN.name,
            tier: FREE_PLAN.tier,
            listingLimit: null,
            maxImages: ADMIN_IMAGE_CEILING,
            expiresAt: null,
            used,
            canCreate: true,
        };
    }

    const now = new Date();
    const active = await subscriptionRepository.findActiveCandidatesByOwner(
        ownerId,
        now
    );

    const candidates = active.filter((candidate) =>
        isCurrentlyValid(candidate.expiresAt, now)
    );

    return resolveEntitlement(candidates, used, now);
};


const assertCanCreateListing = async (ownerId: string): Promise<void> => {
    const settings = await settingsRepository.getGlobal();

    if (!settings.subscriptionsEnabled) {
        return;
    }

    const now = new Date();
    const [used, active] = await Promise.all([
        propertyRepository.countByOwner(ownerId),
        subscriptionRepository.findActiveCandidatesByOwner(ownerId, now),
    ]);

    const best = pickBestSubscription(
        active.filter((candidate) =>
            isCurrentlyValid(candidate.expiresAt, now)
        )
    );

    const limit = best ? best.listingLimit : FREE_PLAN.listingLimit;

    if (!canCreateWithinLimit(used, limit)) {
        throw new AppError(
            403,
            `You have reached your plan limit of ${describeLimit(
                limit
            )}. Upgrade your plan to list more properties.`,
            "LISTING_LIMIT_REACHED"
        );
    }
};


const resolveImageLimit = async (
    ownerId: string,
    role: string
): Promise<number> => {
    if (role === "admin") {
        return ADMIN_IMAGE_CEILING;
    }

    const settings = await settingsRepository.getGlobal();

    if (!settings.subscriptionsEnabled) {
        return ADMIN_IMAGE_CEILING;
    }

    const now = new Date();
    const active = await subscriptionRepository.findActiveCandidatesByOwner(
        ownerId,
        now
    );

    const best = pickBestSubscription(
        active.filter((candidate) =>
            isCurrentlyValid(candidate.expiresAt, now)
        )
    );

    return best ? best.maxImages : FREE_PLAN.maxImages;
};


const assertImageLimit = async (input: {
    ownerId: string;
    role: string;
    existingImages: number;
    additionalImages: number;
}): Promise<void> => {
    const limit = await resolveImageLimit(input.ownerId, input.role);

    if (input.existingImages + input.additionalImages > limit) {
        throw new AppError(
            400,
            `Your plan allows up to ${limit} photos per listing. This listing already has ${input.existingImages}.`,
            "IMAGE_LIMIT_REACHED"
        );
    }
};

const createCheckout = async (
    ownerId: string,
    input: CheckoutInput
): Promise<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
}> => {
    const settings = await settingsRepository.getGlobal();

    if (!settings.subscriptionsEnabled) {
        throw new AppError(
            403,
            "Subscriptions are currently disabled. Please contact support."
        );
    }

    /**
     * SECURITY: the price comes from plans.ts, never from the request body.
     * The client sends a planId and nothing else.
     */
    const plan = getPlan(input.planId);

    if (!plan) {
        throw new AppError(400, "Unknown subscription plan");
    }

    const order = await createRazorpayOrder({
        amountPaise: plan.pricePaise,
        currency: "INR",
        receipt: `sub_${ownerId.slice(-8)}_${Date.now()}`,
        notes: { planId: plan.id, ownerId },
    });

    await subscriptionRepository.createSubscription({
        owner: ownerId,
        planId: plan.id as Exclude<PlanId, "free">,
        tier: plan.tier as "basic" | "pro",
        period: plan.period as "monthly" | "quarterly",
        durationDays: plan.durationDays as number,
        listingLimit: plan.listingLimit,
        maxImages: plan.maxImages,
        amountPaise: plan.pricePaise,
        currency: "INR",
        razorpayOrderId: order.id,
    });

    return {
        orderId: order.id,
        amount: plan.pricePaise,
        currency: "INR",
        keyId: razorpayKeyId,
    };
};


const activateOrder = async (orderId: string, paymentId: string) => {
    const subscription = await subscriptionRepository.findByOrderId(orderId);

    if (!subscription) {
        throw new AppError(404, "Subscription order not found");
    }

    const startsAt = new Date();
    const expiresAt = new Date(
        startsAt.getTime() + subscription.durationDays * DAY_MS
    );

    await subscriptionRepository.activateSubscription({
        orderId,
        paymentId,
        startsAt,
        expiresAt,
    });

    return subscription.owner.toString();
};

const verifyCheckout = async (
    ownerId: string,
    input: VerifyInput
): Promise<Entitlement> => {
   
    const valid = verifyCheckoutSignature({
        orderId: input.razorpay_order_id,
        paymentId: input.razorpay_payment_id,
        signature: input.razorpay_signature,
    });

    if (!valid) {
        throw new AppError(400, "Payment verification failed");
    }

    /**
     * Then confirm the order belongs to the caller, so a valid signature for
     * someone else's successful payment cannot activate this owner's plan.
     */
    const subscription = await subscriptionRepository.findByOrderId(
        input.razorpay_order_id
    );

    if (!subscription) {
        throw new AppError(404, "Subscription order not found");
    }

    if (subscription.owner.toString() !== ownerId) {
        throw new AppError(403, "This order does not belong to you");
    }

    await activateOrder(input.razorpay_order_id, input.razorpay_payment_id);

    return getEntitlement(ownerId);
};

/**
 * =========================
 * WEBHOOK
 * =========================
 */

interface RazorpayWebhookEvent {
    event?: string;
    payload?: {
        payment?: { entity?: { id?: string; order_id?: string } };
        order?: { entity?: { id?: string; payments?: unknown } };
    };
}

const readString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;


export const extractWebhookIdentifiers = (
    event: RazorpayWebhookEvent
): { orderId: string; paymentId: string } | null => {
    const payment = event.payload?.payment?.entity;
    const order = event.payload?.order?.entity;

    const fromPayment = (() => {
        const orderId = readString(payment?.order_id);
        const paymentId = readString(payment?.id);
        return orderId && paymentId ? { orderId, paymentId } : null;
    })();

    if (fromPayment) {
        return fromPayment;
    }

    const orderId = readString(order?.id);

    if (orderId) {
        // order.paid may not carry a payment id; activation tolerates an
        // empty one, and payment.captured will arrive with the real value.
        return { orderId, paymentId: "" };
    }

    return null;
};

const handleWebhookEvent = async (
    rawBody: Buffer | string,
    signature: string
): Promise<{ received: true; handled: boolean }> => {
  
    if (!razorpayWebhookSecret) {
        throw new AppError(
            503,
            "Webhook handling is not configured. Set RAZORPAY_WEBHOOK_SECRET and restart the server."
        );
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
        throw new AppError(400, "Invalid webhook signature");
    }

    let event: RazorpayWebhookEvent;

    try {
        event = JSON.parse(
            Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody
        ) as RazorpayWebhookEvent;
    } catch {
        throw new AppError(400, "Malformed webhook payload");
    }

   
    const identifiers = extractWebhookIdentifiers(event);

    if (!identifiers) {
        // Authenticated but not actionable (payment.failed, subscription.*).
        return { received: true, handled: false };
    }

   
    const subscription = await subscriptionRepository.findByOrderId(
        identifiers.orderId
    );

    if (!subscription) {
        return { received: true, handled: false };
    }

    await activateOrder(identifiers.orderId, identifiers.paymentId);

    return { received: true, handled: true };
};

const subscriptionService = {
    getEntitlement,
    assertCanCreateListing,
    resolveImageLimit,
    assertImageLimit,
    listPlans,
    createCheckout,
    verifyCheckout,
    handleWebhookEvent,
};

export default subscriptionService;
export { listPlans };
