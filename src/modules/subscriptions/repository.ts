import Subscription from "./model.js";
import type {
    ActiveSubscription,
    ISubscription,
    PaidPlanId,
    PaidPlanTier,
    PlanPeriod,
    SubscriptionStatus,
} from "./type.js";

export interface CreateSubscriptionData {
    owner: string;
    planId: PaidPlanId;
    tier: PaidPlanTier;
    period: PlanPeriod;
    durationDays: number;
    listingLimit: number | null;
    maxImages: number;
    amountPaise: number;
    currency: string;
    razorpayOrderId: string;
}

const createSubscription = async (
    data: CreateSubscriptionData
): Promise<ISubscription> => {
    return Subscription.create({ ...data, status: "created" });
};

const findByOrderId = async (
    orderId: string
): Promise<ISubscription | null> => {
    return Subscription.findOne({ razorpayOrderId: orderId });
};

/**
 * Activate a subscription — but only if it is still in "created".
 *
 * The status filter inside the filter document is what makes activation
 * idempotent: /verify and /webhook can both arrive for the same payment and
 * whichever runs second matches nothing and changes nothing. A replay can
 * therefore never re-issue or extend a plan.
 *
 * Returns the activated document, or null when it was already handled.
 */
const activateSubscription = async (input: {
    orderId: string;
    paymentId: string;
    startsAt: Date;
    expiresAt: Date;
}): Promise<ISubscription | null> => {
    return Subscription.findOneAndUpdate(
        { razorpayOrderId: input.orderId, status: "created" },
        {
            $set: {
                status: "active",
                razorpayPaymentId: input.paymentId,
                startsAt: input.startsAt,
                expiresAt: input.expiresAt,
            },
        },
        { returnDocument: "after" }
    );
};

/**
 * Flip an order to "failed" when the buyer never completed checkout.
 *
 * Also guarded on "created" so it can never overwrite an active plan.
 */
const failSubscription = async (
    orderId: string,
    status: SubscriptionStatus = "failed"
): Promise<void> => {
    await Subscription.findOneAndUpdate(
        { razorpayOrderId: orderId, status: "created" },
        { $set: { status } }
    );
};

/**
 * Every subscription that is active AND not yet expired at `now`.
 *
 * Expiry is evaluated here, at read time — there is no cron job flipping
 * documents from active to expired.
 */
const findActiveByOwner = async (
    ownerId: string,
    now: Date = new Date()
): Promise<ISubscription[]> => {
    return Subscription.find({
        owner: ownerId,
        status: "active",
        expiresAt: { $gt: now },
    });
};

/**
 * Projection used by the entitlement resolver.
 *
 * Only the fields an entitlement decision depends on, so a dashboard read does
 * not pull whole documents over the wire.
 */
const findActiveCandidatesByOwner = async (
    ownerId: string,
    now: Date = new Date()
): Promise<ActiveSubscription[]> => {
    // Every document matching this filter has been through activateSubscription,
    // which always writes expiresAt — so the projection is safe to assert here.
    return Subscription.find({
        owner: ownerId,
        status: "active",
        expiresAt: { $gt: now },
    })
        .select({
            planId: 1,
            tier: 1,
            listingLimit: 1,
            maxImages: 1,
            expiresAt: 1,
        })
        .lean<ActiveSubscription[]>();
};

export default {
    createSubscription,
    findByOrderId,
    activateSubscription,
    failSubscription,
    findActiveByOwner,
    findActiveCandidatesByOwner,
};
