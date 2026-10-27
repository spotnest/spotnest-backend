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


const failSubscription = async (
    orderId: string,
    status: SubscriptionStatus = "failed"
): Promise<void> => {
    await Subscription.findOneAndUpdate(
        { razorpayOrderId: orderId, status: "created" },
        { $set: { status } }
    );
};


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


const findActiveCandidatesByOwner = async (
    ownerId: string,
    now: Date = new Date()
): Promise<ActiveSubscription[]> => {
    
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
