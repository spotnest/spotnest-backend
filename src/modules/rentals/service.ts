import mongoose from "mongoose";
import { AppError } from "../../shared/errors/AppError.js";
import { RENTAL_PAYMENT_DEADLINE_MS } from "../../shared/config/constants.js";
import User from "../auth/model.js";
import Booking from "../bookings/model.js";
import { Rental } from "../dashboard/tenantDashboard/model.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import { RentalAgreement, RentalOccupant } from "./model.js";
import repository from "./repository.js";
import Property from "../properties/model.js";
import { UserRole } from "../auth/type.js";
import { sendAgreementEmail } from "../../shared/utils/email.js";
import type {
    SetRentSplitInput,
    CreateManualAgreementInput,
    UpdateAgreementInput,
} from "./validation.js";

export const formatAgreementTerms = (
    baseTerms: string | undefined,
    rentAmount: number,
    depositAmount: number,
    propertyTitle?: string,
    noticePeriodDays: number = 30
): string => {
    const formattedRent = `₹${rentAmount.toLocaleString("en-IN")}`;
    const formattedDeposit = `₹${depositAmount.toLocaleString("en-IN")}`;

    if (
        baseTerms &&
        (baseTerms.includes("MONTHLY RENT") ||
            baseTerms.includes("STANDARD RESIDENTIAL LEASE AGREEMENT"))
    ) {
        let updated = baseTerms;
        updated = updated.replace(
            /monthly rent of (?:₹[\d,]+|\[Monthly Rent\])/gi,
            `monthly rent of ${formattedRent}`
        );
        updated = updated.replace(
            /security deposit of (?:₹[\d,]+|\[Security Deposit\])/gi,
            `security deposit of ${formattedDeposit}`
        );
        updated = updated.replace(
            /minimum of \d+ days written notice/gi,
            `minimum of ${noticePeriodDays} days written notice`
        );
        return updated.trim();
    }

    if (baseTerms && baseTerms.trim()) {
        return `STANDARD RESIDENTIAL LEASE AGREEMENT

1. PURPOSE & PREMISES: The Owner agrees to lease and the Tenant agrees to occupy ${propertyTitle ? `"${propertyTitle}"` : "the premises"} exclusively for residential purposes in compliance with all society bylaws.

2. MONTHLY RENT: The Tenant agrees to pay the monthly rent of ${formattedRent} on or before the 5th day of every calendar month.

3. SECURITY DEPOSIT / ADVANCE: A refundable security deposit of ${formattedDeposit} must be paid prior to move-in. This deposit will be held during tenancy and refunded within 30 days of vacating, subject to deductions for damages or unpaid utilities.

4. NOTICE PERIOD & TERMINATION: Either party may terminate this agreement by providing a minimum of ${noticePeriodDays} days written notice.

5. SPECIAL TERMS & CONDITIONS:
${baseTerms.trim()}`.trim();
    }

    return `STANDARD RESIDENTIAL LEASE AGREEMENT

1. PURPOSE & PREMISES: The Owner agrees to lease and the Tenant agrees to occupy ${propertyTitle ? `"${propertyTitle}"` : "the premises"} exclusively for residential purposes in compliance with all society bylaws.

2. MONTHLY RENT: The Tenant agrees to pay the monthly rent of ${formattedRent} on or before the 5th day of every calendar month.

3. SECURITY DEPOSIT / ADVANCE: A refundable security deposit of ${formattedDeposit} must be paid prior to move-in. This deposit will be held during tenancy and refunded within 30 days of vacating, subject to deductions for damages or unpaid utilities.

4. MAINTENANCE & UTILITIES: Electricity, water, and other utility usage charges shall be borne directly by the Tenant.

5. NOTICE PERIOD & TERMINATION: Either party may terminate this agreement by providing a minimum of ${noticePeriodDays} days written notice.

6. INSPECTIONS & REPAIRS: The Owner reserves the right to inspect the property with prior 24-hour notice. The Tenant agrees to maintain the property in clean and habitable condition.`.trim();
};

const DEFAULT_TERMS = `
1. The tenant agrees to pay monthly rent on or before the due date specified in each monthly invoice.
2. The security deposit will be held for the duration of the lease and refunded upon vacation of the premises, subject to deductions for damages or unpaid rent.
3. The tenant shall keep the property clean, well-maintained, and adhere to community guidelines.
4. Subletting without prior owner approval is strictly prohibited.
5. Either party may terminate this agreement with 30 days written notice prior to lease expiration.
`.trim();

/**
 * Returns the owner's custom rental terms or the default terms.
 */
const getTermsForOwner = async (ownerId: string) => {
    const owner = await User.findById(ownerId).select(
        "rentalTerms role"
    );

    if (!owner || owner.role !== "owner") {
        throw new AppError(404, "Rental owner not found");
    }

    return owner.rentalTerms?.trim() || DEFAULT_TERMS;
};

/**
 * Get rental agreement terms configured by an owner.
 */
export const getOwnerRentalTerms = async (ownerId: string) => {
    const owner = await User.findById(ownerId).select("rentalTerms");

    if (!owner || owner.role !== "owner") {
        throw new AppError(404, "Owner account not found");
    }

    const savedTerms = owner.rentalTerms?.trim();

    return {
        terms: savedTerms || DEFAULT_TERMS,
        isCustom: Boolean(savedTerms),
    };
};

/**
 * Update the owner's default rental agreement terms.
 */
export const updateOwnerRentalTerms = async (
    ownerId: string,
    terms: string
) => {
    const owner = await User.findById(ownerId);

    if (!owner || owner.role !== "owner") {
        throw new AppError(404, "Owner account not found");
    }

    const normalizedTerms = terms.trim();

    if (!normalizedTerms) {
        throw new AppError(400, "Rental terms cannot be empty");
    }

    owner.rentalTerms = normalizedTerms;
    await owner.save();

    return {
        terms: owner.rentalTerms,
        isCustom: true,
    };
};

/**
 * Create or update the primary occupant and create an agreement
 * using a snapshot of the owner's current rental terms.
 */
export const createDefaultOccupantAndAgreement = async (
    rental: any,
    tenantId: string,
    rentAmount: number,
    securityDepositShare: number
) => {
    let occupant = await RentalOccupant.findOne({
        rental: rental._id,
        tenant: tenantId,
        status: { $in: ["PENDING", "ACTIVE"] },
    });

    if (!occupant) {
        occupant = await RentalOccupant.create({
            rental: rental._id,
            tenant: tenantId,
            rentAmount,
            securityDepositShare,
            status: "PENDING",
            joinedAt: rental.leaseStart || new Date(),
        });
    } else {
        occupant.rentAmount = rentAmount;
        occupant.securityDepositShare = securityDepositShare;
        await occupant.save();
    }

    // 2. Load the owner's saved rental terms and property title
    const rawTerms = await getTermsForOwner(
        rental.owner.toString()
    );

    const propTitle = (rental.property as any)?.title || "";
    const agreementTerms = formatAgreementTerms(
        rawTerms,
        rentAmount,
        securityDepositShare,
        propTitle
    );

    // 3. Find an existing agreement.
    let agreement = await RentalAgreement.findOne({
        rental: rental._id,
        tenant: tenantId,
        status: { $nin: ["REJECTED", "TERMINATED"] },
    });

    // 4. Create or synchronize existing agreement
    if (!agreement) {
        agreement = await RentalAgreement.create({
            rental: rental._id,
            occupant: occupant._id,
            tenant: tenantId,
            owner: rental.owner,
            property: rental.property,
            monthlyRent: rentAmount,
            securityDepositShare,
            leaseStart: rental.leaseStart,
            leaseEnd: rental.leaseEnd,
            terms: agreementTerms,
            status: "PENDING_TENANT",
        });
    } else {
        agreement.monthlyRent = rentAmount;
        agreement.securityDepositShare = securityDepositShare;
        agreement.terms = formatAgreementTerms(
            agreement.terms || agreementTerms,
            rentAmount,
            securityDepositShare,
            propTitle
        );
        await agreement.save();
    }

    return { occupant, agreement };
};

/**
 * Get the current tenant's rental, agreement, occupants and payments.
 */
const getTenantRental = async (
    tenantId: string,
    bookingId?: string
) => {
    let rental: any = null;
    let occupant: any = null;

    if (bookingId) {
        rental = await Rental.findOne({ booking: bookingId })
            .populate("property")
            .populate("owner", "name email phone")
            .populate("tenant", "name email phone");

        if (!rental) {
            const booking = await Booking.findOne({
                _id: bookingId,
                userId: tenantId,
                status: "APPROVED",
            });

            if (booking) {
                console.info(
                    `[RENTAL_AGREEMENT_FETCH] Generating missing agreement records for approved booking ${bookingId}`
                );
                const createdRental = await Rental.findOneAndUpdate(
                    { booking: booking._id },
                    {
                        $setOnInsert: {
                            booking: booking._id,
                            property: booking.propertyId,
                            owner: booking.ownerId,
                            tenant: booking.userId,
                            monthlyRent: booking.monthlyRent,
                            securityDeposit: booking.advanceAmount,
                            leaseStart: booking.startDate,
                            leaseEnd: booking.endDate,
                            paymentFrequency: "monthly",
                            status: "scheduled",
                        },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                await createDefaultOccupantAndAgreement(
                    createdRental,
                    tenantId,
                    booking.monthlyRent,
                    booking.advanceAmount
                );

                rental = await Rental.findById(createdRental._id)
                    .populate("property")
                    .populate("owner", "name email phone")
                    .populate("tenant", "name email phone");
            }
        }

        if (rental) {
            occupant = await RentalOccupant.findOne({
                rental: rental._id,
                tenant: tenantId,
                status: { $ne: "TERMINATED" },
            });
        }
    }

    if (!rental || !occupant) {
        occupant = await RentalOccupant.findOne({
            tenant: tenantId,
            status: { $in: ["PENDING", "ACTIVE"] },
        })
            .populate("rental")
            .sort({ created_at: -1 });

        if (!occupant || !occupant.rental) {
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            const recentOccupant = await RentalOccupant.findOne({
                tenant: tenantId,
            })
                .populate({
                    path: "rental",
                    match: { leaseEnd: { $gte: threeDaysAgo } },
                })
                .sort({ created_at: -1 });

            if (recentOccupant && recentOccupant.rental) {
                occupant = recentOccupant;
                rental = await repository.findRentalById(
                    (occupant.rental as any)._id.toString()
                );
            } else {
                return null;
            }
        } else {
            rental = await repository.findRentalById(
                occupant.rental._id.toString()
            );
        }
    }

    if (!rental) {
        return null;
    }

    let agreement = await RentalAgreement.findOne({
        rental: rental._id,
        tenant: tenantId,
        status: { $nin: ["TERMINATED", "CANCELLED"] },
    }).sort({ created_at: -1 });

    if (!agreement && occupant) {
        console.info(
            `[RENTAL_AGREEMENT_FETCH] Ensuring agreement for rental ${rental._id} and tenant ${tenantId}`
        );
        const generated = await createDefaultOccupantAndAgreement(
            rental,
            tenantId,
            occupant.rentAmount || rental.monthlyRent,
            occupant.securityDepositShare || rental.securityDeposit
        );
        agreement = (generated.agreement as any) ?? null;
    }

    if (agreement) {
        const propTitle = (rental.property as any)?.title || "";
        const syncedTerms = formatAgreementTerms(
            agreement.terms,
            agreement.monthlyRent,
            agreement.securityDepositShare,
            propTitle
        );
        if (syncedTerms !== agreement.terms) {
            agreement.terms = syncedTerms;
            void agreement.save();
        }
    }

    // Expire the agreement if the advance payment deadline has passed.
    if (
        agreement &&
        agreement.status === "APPROVED_PENDING_PAYMENT" &&
        agreement.paymentDeadline &&
        new Date() >= agreement.paymentDeadline
    ) {
        agreement.status = "EXPIRED";
        await agreement.save();

        if (rental.booking) {
            await Booking.updateOne(
                {
                    _id: rental.booking,
                    status: "APPROVED",
                },
                {
                    $set: { status: "EXPIRED" },
                }
            );
        }
    }

    const occupants = await repository.findOccupantsByRental(
        rental._id.toString()
    );

    const payments = await repository.findPaymentsByOccupant(
        occupant._id.toString()
    );

    const tenantObjectId = mongoose.Types.ObjectId.isValid(tenantId)
        ? new mongoose.Types.ObjectId(tenantId)
        : null;

    const propId = (rental.property as any)?._id || rental.property;
    const propObjectId = mongoose.Types.ObjectId.isValid(propId?.toString())
        ? new mongoose.Types.ObjectId(propId.toString())
        : propId;

    const activeInquiryBooking = await Booking.findOne({
        $and: [
            {
                $or: [
                    { "tenantInquiry.currentRentalId": rental._id },
                    {
                        $and: [
                            { propertyId: { $in: [propId, propObjectId] } },
                            {
                                $or: [
                                    { "tenantInquiry.currentTenantId": tenantObjectId },
                                    { "tenantInquiry.currentTenantId": tenantId },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                "tenantInquiry.status": "PENDING",
            },
            {
                status: "PENDING",
            },
        ],
    })
        .populate("propertyId", "title address images")
        .select("_id startDate endDate tenantInquiry propertyId");

    return {
        rental: {
            id: rental._id.toString(),
            bookingId: rental.booking?.toString() ?? "",
            status: rental.status,
            monthlyRent: rental.monthlyRent,
            securityDeposit: rental.securityDeposit,
            leaseStart: rental.leaseStart
                ? new Date(rental.leaseStart).toISOString()
                : "",
            leaseEnd: rental.leaseEnd
                ? new Date(rental.leaseEnd).toISOString()
                : "",
            paymentFrequency: rental.paymentFrequency,
            splitMode: rental.splitMode ?? "EQUAL",

            property: {
                id:
                    (rental.property as any)?._id?.toString() ?? "",
                title: (rental.property as any)?.title ?? "",
                propertyType:
                    (rental.property as any)?.propertyType ?? "",
                address: (rental.property as any)?.address ?? {},
                image: (rental.property as any)?.images?.[0]?.url,
                bedrooms: (rental.property as any)?.bedrooms ?? 0,
                bathrooms: (rental.property as any)?.bathrooms ?? 0,
                areaSqFt: (rental.property as any)?.areaSqFt,
                amenities:
                    (rental.property as any)?.amenities ?? [],
            },

            owner: {
                id: (rental.owner as any)?._id?.toString() ?? "",
                name: (rental.owner as any)?.name ?? "Owner",
                email: (rental.owner as any)?.email ?? "",
                phone: (rental.owner as any)?.phone,
            },
        },

        myOccupant: {
            id: occupant._id.toString(),
            rentAmount: occupant.rentAmount,
            securityDepositShare: occupant.securityDepositShare,
            status: occupant.status,
        },

        occupants: occupants.map((occ) => ({
            id: occ._id.toString(),

            tenant: {
                id:
                    (
                        (occ.tenant as any)?._id ?? occ.tenant
                    )?.toString() ?? "",
                name: (occ.tenant as any)?.name ?? "Tenant",
                email: (occ.tenant as any)?.email ?? "",
            },

            rentAmount: occ.rentAmount,
            securityDepositShare: occ.securityDepositShare,
            status: occ.status,
        })),

        agreement: agreement
            ? {
                id: agreement._id.toString(),
                status: agreement.status,
                monthlyRent: agreement.monthlyRent,
                securityDepositShare:
                    agreement.securityDepositShare,
                leaseStart: agreement.leaseStart
                    ? new Date(
                        agreement.leaseStart
                    ).toISOString()
                    : "",
                leaseEnd: agreement.leaseEnd
                    ? new Date(
                        agreement.leaseEnd
                    ).toISOString()
                    : "",
                terms: agreement.terms,
                tenantAcceptedAt: agreement.tenantAcceptedAt
                    ? new Date(
                        agreement.tenantAcceptedAt
                    ).toISOString()
                    : null,
                ownerAcceptedAt: agreement.ownerAcceptedAt
                    ? new Date(
                        agreement.ownerAcceptedAt
                    ).toISOString()
                    : null,
                paymentDeadline: agreement.paymentDeadline
                    ? new Date(
                        agreement.paymentDeadline
                    ).toISOString()
                    : null,
            }
            : null,

        inquiry: activeInquiryBooking
            ? {
                  bookingId: activeInquiryBooking._id.toString(),
                  propertyTitle:
                      (activeInquiryBooking.propertyId as any)?.title ||
                      (rental.property as any)?.title ||
                      "Your Rented Property",
                  startDate: activeInquiryBooking.startDate.toISOString(),
                  endDate: activeInquiryBooking.endDate.toISOString(),
                  deadline: activeInquiryBooking.tenantInquiry?.deadline
                      ? new Date(
                            activeInquiryBooking.tenantInquiry.deadline
                        ).toISOString()
                      : "",
                  question:
                      activeInquiryBooking.tenantInquiry?.question || "",
                  status:
                      activeInquiryBooking.tenantInquiry?.status || "PENDING",
                  deemedConsentNotice:
                      "Please answer within 3 days. If you do not answer within 3 days, we will accept the new request with your deemed consent.",
              }
            : null,

        payments: payments.map((payment) => ({
            id: payment._id.toString(),
            type: payment.type,
            amount: payment.amount,
            status: payment.status.toLowerCase(),
            dueDate: payment.dueDate
                ? new Date(payment.dueDate).toISOString()
                : null,
            paidAt: payment.paidAt
                ? new Date(payment.paidAt).toISOString()
                : null,
            billingMonth: payment.billingMonth,
            razorpayOrderId: payment.razorpayOrderId,
            created_at: payment.created_at
                ? new Date(payment.created_at).toISOString()
                : new Date().toISOString(),
        })),
    };
};

/**
 * Get an agreement belonging to the specified tenant.
 */
const getAgreementForTenant = async (
    tenantId: string,
    agreementId?: string
) => {
    const agreement = await repository.findAgreementForTenant(
        tenantId,
        agreementId
    );

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    return agreement;
};

/**
 * Tenant accepts the agreement.
 * The owner must approve it before advance payment can proceed.
 */
const acceptAgreement = async (
    agreementId: string,
    tenantId: string
) => {
    const agreement = await RentalAgreement.findOne({
        _id: agreementId,
        tenant: tenantId,
    });

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    if (agreement.status !== "PENDING_TENANT") {
        throw new AppError(
            409,
            `Agreement cannot be accepted in state ${agreement.status}`
        );
    }

    agreement.status = "PENDING_OWNER";
    agreement.tenantAcceptedAt = new Date();

    await agreement.save();

    const tenantUser = await User.findById(tenantId);
    const tenantName = tenantUser?.name ?? "Tenant";

    await notificationService.createNotification({
        recipient: agreement.owner.toString(),
        title: "Rental agreement accepted by tenant",
        message: `${tenantName} has reviewed and accepted the rental agreement for your property.`,
        type: "rental_approved",
        referenceId: agreement.rental.toString(),
        referenceType: "property",
    });

    emitDashboardUpdate(
        {
            userIds: [
                agreement.owner.toString(),
                agreement.tenant.toString(),
            ],
        },
        "rental",
        "agreement_accepted",
        agreement.rental
    );

    return agreement.toObject();
};

/**
 * Owner approves a tenant-accepted agreement.
 *
 * IMPORTANT:
 * This function does not activate the rental or occupant.
 * The verified advance payment workflow must handle activation.
 */
const confirmAgreement = async (
    agreementId: string,
    ownerId: string
) => {
    const agreement = await RentalAgreement.findOne({
        _id: agreementId,
        owner: ownerId,
    });

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    if (agreement.status !== "PENDING_OWNER") {
        throw new AppError(
            409,
            agreement.status === "APPROVED_PENDING_PAYMENT"
                ? "Agreement is already approved and awaiting payment"
                : `Agreement cannot be confirmed in state ${agreement.status}`
        );
    }

    if (!agreement.tenantAcceptedAt) {
        throw new AppError(
            409,
            "Tenant must accept the agreement before owner approval"
        );
    }

    const now = new Date();

    // 72-hour deadline starts at owner approval.
    const paymentDeadline = new Date(
        now.getTime() + RENTAL_PAYMENT_DEADLINE_MS
    );

    // Atomic update prevents concurrent approvals from resetting
    // the payment deadline.
    const updated = await RentalAgreement.findOneAndUpdate(
        {
            _id: agreementId,
            owner: ownerId,
            status: "PENDING_OWNER",
            tenantAcceptedAt: {
                $exists: true,
                $ne: null,
            },
        },
        {
            $set: {
                ownerAcceptedAt: now,
                paymentDeadline,
                status: "APPROVED_PENDING_PAYMENT",
            },
        },
        { returnDocument: "after" }
    );

    if (!updated) {
        const current = await RentalAgreement.findOne({
            _id: agreementId,
            owner: ownerId,
        });

        if (!current) {
            throw new AppError(404, "Rental agreement not found");
        }

        throw new AppError(
            409,
            current.status === "APPROVED_PENDING_PAYMENT"
                ? "Agreement is already approved and awaiting payment"
                : `Agreement cannot be confirmed in state ${current.status}`
        );
    }

    await notificationService.notify({
        recipient: updated.tenant.toString(),
        title: "Rental agreement approved",
        message:
            "The owner approved your rental agreement. Complete your advance payment within 72 hours to activate your tenancy.",
        type: "rental_approved",
        referenceId: updated.rental.toString(),
        referenceType: "rental",
        data: {
            rentalId: updated.rental.toString(),
            agreementId: updated._id.toString(),
            propertyId: updated.property.toString(),
            paymentDeadline: updated.paymentDeadline!.toISOString(),
        },
        dedupeKey: `agreement-confirmed:${updated._id.toString()}`,
    });

    try {
        const tenantUser = await User.findById(updated.tenant).select("email name");
        const propertyObj = await Property.findById(updated.property).select("title");
        const ownerUser = await User.findById(ownerId).select("name");
        if (tenantUser?.email) {
            await sendAgreementEmail(tenantUser.email, {
                propertyTitle: propertyObj?.title || "Rental Property",
                ownerName: ownerUser?.name || "Property Owner",
                monthlyRent: updated.monthlyRent,
                securityDeposit: updated.securityDepositShare,
            });
        }
    } catch (err: any) {
        console.warn("[AGREEMENT_CONFIRM_EMAIL_FAILED]", err?.message);
    }

    emitDashboardUpdate(
        {
            userIds: [
                updated.owner.toString(),
                updated.tenant.toString(),
            ],
            admins: true,
        },
        "rental",
        "agreement_confirmed",
        updated.rental
    );

    return updated.toObject();
};

/**
 * Configure equal or custom rent shares for occupants.
 */
const setRentSplit = async (
    rentalId: string,
    ownerId: string,
    payload: SetRentSplitInput
) => {
    const rental = await Rental.findOne({
        _id: rentalId,
        owner: ownerId,
    });

    if (!rental) {
        throw new AppError(404, "Rental not found or access denied");
    }

    const { splitMode, occupants: occupantInputs } = payload;

    if (!occupantInputs || occupantInputs.length === 0) {
        throw new AppError(400, "At least one occupant is required");
    }

    const resolvedOccupants: Array<{
        userId: string;
        rentAmount: number;
        securityDepositShare: number;
    }> = [];

    let calculatedTotalRent = 0;

    const resolveTenantId = async (
        item: (typeof occupantInputs)[number]
    ): Promise<string> => {
        let userId = item.tenantId;

        if (!userId && item.tenantEmail) {
            const user = await User.findOne({
                email: item.tenantEmail.trim().toLowerCase(),
            });

            if (!user) {
                throw new AppError(
                    400,
                    `User with email ${item.tenantEmail} not found`
                );
            }

            userId = user._id.toString();
        }

        if (!userId) {
            throw new AppError(
                400,
                "Each occupant must specify tenantId or tenantEmail"
            );
        }

        return userId;
    };

    if (splitMode === "EQUAL") {
        const shareCount = occupantInputs.length;

        const equalRent =
            Math.floor(
                (rental.monthlyRent / shareCount) * 100
            ) / 100;

        const equalDeposit =
            Math.floor(
                (rental.securityDeposit / shareCount) * 100
            ) / 100;

        const rentRemainder =
            Math.round(
                (rental.monthlyRent -
                    equalRent * shareCount) *
                100
            ) / 100;

        const depositRemainder =
            Math.round(
                (rental.securityDeposit -
                    equalDeposit * shareCount) *
                100
            ) / 100;

        for (let i = 0; i < occupantInputs.length; i++) {
            const item = occupantInputs[i]!;
            const userId = await resolveTenantId(item);

            const rentShare =
                i === 0 ? equalRent + rentRemainder : equalRent;

            const depositShare =
                i === 0
                    ? equalDeposit + depositRemainder
                    : equalDeposit;

            resolvedOccupants.push({
                userId,
                rentAmount: rentShare,
                securityDepositShare: depositShare,
            });

            calculatedTotalRent += rentShare;
        }
    } else {
        for (const item of occupantInputs) {
            const userId = await resolveTenantId(item);

            if (
                item.rentAmount === undefined ||
                item.rentAmount < 0
            ) {
                throw new AppError(
                    400,
                    "Rent share must be specified for custom split"
                );
            }

            const depositShare =
                item.securityDepositShare ??
                (rental.monthlyRent > 0
                    ? Math.round(
                        (item.rentAmount /
                            rental.monthlyRent) *
                        rental.securityDeposit *
                        100
                    ) / 100
                    : 0);

            resolvedOccupants.push({
                userId,
                rentAmount: item.rentAmount,
                securityDepositShare: depositShare,
            });

            calculatedTotalRent += item.rentAmount;
        }
    }

    const roundedCalculatedSum =
        Math.round(calculatedTotalRent * 100) / 100;

    const roundedTotalRent =
        Math.round(rental.monthlyRent * 100) / 100;

    if (
        Math.abs(roundedCalculatedSum - roundedTotalRent) > 0.01
    ) {
        throw new AppError(
            400,
            `Rent split validation failed: Sum of occupant rent shares (₹${roundedCalculatedSum.toLocaleString(
                "en-IN"
            )}) must equal total monthly rent (₹${roundedTotalRent.toLocaleString(
                "en-IN"
            )})`
        );
    }

    const tenantIds = new Set(
        resolvedOccupants.map((occupant) => occupant.userId)
    );

    if (tenantIds.size !== resolvedOccupants.length) {
        throw new AppError(
            400,
            "Duplicate occupants found in rent split payload"
        );
    }

    // Use a snapshot of the owner's current terms for new agreements.
    const agreementTerms = await getTermsForOwner(
        rental.owner.toString()
    );

    rental.splitMode = splitMode;
    await rental.save();

    const updatedOccupants = [];

    for (const occupantInput of resolvedOccupants) {
        let occupant = await RentalOccupant.findOne({
            rental: rental._id,
            tenant: occupantInput.userId,
            status: { $ne: "TERMINATED" },
        });

        if (occupant) {
            occupant.rentAmount = occupantInput.rentAmount;
            occupant.securityDepositShare =
                occupantInput.securityDepositShare;

            await occupant.save();
        } else {
            occupant = await RentalOccupant.create({
                rental: rental._id,
                tenant: occupantInput.userId,
                rentAmount: occupantInput.rentAmount,
                securityDepositShare:
                    occupantInput.securityDepositShare,
                status: "PENDING",
                joinedAt: rental.leaseStart,
            });
        }

        updatedOccupants.push(occupant);

        let agreement = await RentalAgreement.findOne({
            rental: rental._id,
            tenant: occupantInput.userId,
            status: { $nin: ["REJECTED", "TERMINATED"] },
        });

        if (agreement) {
            agreement.monthlyRent = occupantInput.rentAmount;
            agreement.securityDepositShare =
                occupantInput.securityDepositShare;

            await agreement.save();
        } else {
            await RentalAgreement.create({
                rental: rental._id,
                occupant: occupant._id,
                tenant: occupantInput.userId,
                owner: rental.owner,
                property: rental.property,
                monthlyRent: occupantInput.rentAmount,
                securityDepositShare:
                    occupantInput.securityDepositShare,
                leaseStart: rental.leaseStart,
                leaseEnd: rental.leaseEnd,
                terms: agreementTerms,
                status: "PENDING_TENANT",
            });

            await notificationService.createNotification({
                recipient: occupantInput.userId,
                title: "Added to shared rental agreement",
                message:
                    "You were added as an occupant for a property rental. " +
                    "Please log in to review and accept your agreement.",
                type: "rental_approved",
                referenceId: rental._id.toString(),
                referenceType: "property",
            });
        }
    }

    emitDashboardUpdate(
        {
            userIds: [
                rental.owner.toString(),
                ...resolvedOccupants.map(
                    (occupant) => occupant.userId
                ),
            ],
        },
        "rental",
        "split_updated",
        rental._id
    );

    return {
        rentalId: rental._id.toString(),
        splitMode: rental.splitMode,
        monthlyRent: rental.monthlyRent,
        occupants: updatedOccupants,
    };
};

/**
 * Get all rentals belonging to an owner, including occupants,
 * agreement statuses and payment summaries.
 */
const getOwnerRentals = async (ownerId: string) => {
    const rentals = await repository.findRentalsByOwner(ownerId);
    const result = [];

    for (const rental of rentals) {
        const occupants = await repository.findOccupantsByRental(
            rental._id.toString()
        );

        const agreements = await repository.findAgreementsByRental(
            rental._id.toString()
        );

        const payments = await repository.findPaymentsByRental(
            rental._id.toString()
        );

        const occupantsWithDetails = await Promise.all(
            occupants.map(async (occupant) => {
                const occupantTenantId =
                    (
                        (occupant.tenant as any)?._id ??
                        occupant.tenant
                    )?.toString() ?? "";

                const occupantAgreement = agreements.find(
                    (agreement) => {
                        const agreementOccupantId =
                            (
                                (agreement.occupant as any)?._id ??
                                agreement.occupant
                            )?.toString();

                        const agreementTenantId =
                            (
                                (agreement.tenant as any)?._id ??
                                agreement.tenant
                            )?.toString();

                        return (
                            (agreementOccupantId &&
                                agreementOccupantId ===
                                occupant._id.toString()) ||
                            (agreementTenantId &&
                                agreementTenantId ===
                                occupantTenantId)
                        );
                    }
                );

                let effectiveAgreementStatus =
                    occupantAgreement?.status ?? "NONE";

                if (
                    occupantAgreement &&
                    occupantAgreement.status ===
                    "APPROVED_PENDING_PAYMENT" &&
                    occupantAgreement.paymentDeadline &&
                    new Date() >=
                    occupantAgreement.paymentDeadline
                ) {
                    effectiveAgreementStatus = "EXPIRED";

                    // Update only if the agreement is still awaiting payment.
                    await RentalAgreement.updateOne(
                        {
                            _id: occupantAgreement._id,
                            status: "APPROVED_PENDING_PAYMENT",
                            paymentDeadline: {
                                $lte: new Date(),
                            },
                        },
                        {
                            $set: { status: "EXPIRED" },
                        }
                    );

                    if (rental.booking) {
                        await Booking.updateOne(
                            {
                                _id: rental.booking,
                                status: "APPROVED",
                            },
                            {
                                $set: { status: "EXPIRED" },
                            }
                        );
                    }
                }

                const occupantPayments = payments.filter(
                    (payment) => {
                        const paymentTenantId =
                            (
                                (payment.tenant as any)?._id ??
                                payment.tenant
                            )?.toString();

                        return (
                            paymentTenantId === occupantTenantId
                        );
                    }
                );

                const latestPayment = occupantPayments[0];

                return {
                    id: occupant._id.toString(),

                    tenant: {
                        id: occupantTenantId,
                        name:
                            (occupant.tenant as any)?.name ??
                            "Tenant",
                        email:
                            (occupant.tenant as any)?.email ?? "",
                        phone: (occupant.tenant as any)?.phone,
                    },

                    rentAmount: occupant.rentAmount,
                    securityDepositShare:
                        occupant.securityDepositShare,
                    status: occupant.status,
                    agreementStatus: effectiveAgreementStatus,
                    agreementId:
                        occupantAgreement?._id?.toString(),

                    tenantAcceptedAt:
                        occupantAgreement?.tenantAcceptedAt
                            ? new Date(
                                occupantAgreement.tenantAcceptedAt
                            ).toISOString()
                            : null,

                    ownerAcceptedAt:
                        occupantAgreement?.ownerAcceptedAt
                            ? new Date(
                                occupantAgreement.ownerAcceptedAt
                            ).toISOString()
                            : null,

                    paymentDeadline:
                        occupantAgreement?.paymentDeadline
                            ? new Date(
                                occupantAgreement.paymentDeadline
                            ).toISOString()
                            : null,

                    monthlyPaymentStatus: latestPayment
                        ? latestPayment.status.toUpperCase()
                        : "NO_PAYMENTS",

                    latestPaymentAmount: latestPayment?.amount,
                    latestPaymentMonth:
                        latestPayment?.billingMonth,
                };
            })
        );

        result.push({
            id: rental._id.toString(),
            bookingId: rental.booking?.toString() ?? "",

            property: {
                id:
                    (rental.property as any)?._id?.toString() ??
                    "",
                title: (rental.property as any)?.title ?? "",
                address: (rental.property as any)?.address,
                price: (rental.property as any)?.price,
            },

            monthlyRent: rental.monthlyRent,
            securityDeposit: rental.securityDeposit,

            leaseStart: rental.leaseStart
                ? new Date(rental.leaseStart).toISOString()
                : null,

            leaseEnd: rental.leaseEnd
                ? new Date(rental.leaseEnd).toISOString()
                : null,

            status: rental.status,
            splitMode: rental.splitMode ?? "EQUAL",
            occupants: occupantsWithDetails,
        });
    }

    return result;
};

/**
 * Terminate a rental and update its occupants and agreements.
 */
const terminateRental = async (
    rentalId: string,
    ownerId: string
) => {
    const rental = await Rental.findOne({
        _id: rentalId,
        owner: ownerId,
    });

    if (!rental) {
        throw new AppError(404, "Rental not found or access denied");
    }

    rental.status = "ended";
    await rental.save();

    // Booking is already imported at the top of this file.
    if (rental.booking) {
        await Booking.updateOne(
            { _id: rental.booking },
            { $set: { status: "COMPLETED" } }
        );
    }

    const now = new Date();

    await RentalOccupant.updateMany(
        {
            rental: rental._id,
            status: { $ne: "TERMINATED" },
        },
        {
            $set: {
                status: "TERMINATED",
                leftAt: now,
            },
        }
    );

    await RentalAgreement.updateMany(
        {
            rental: rental._id,
            status: { $ne: "TERMINATED" },
        },
        {
            $set: { status: "TERMINATED" },
        }
    );

    const occupants = await RentalOccupant.find({
        rental: rental._id,
    });

    const tenantIds = [
        ...new Set(
            occupants.map((occupant) =>
                occupant.tenant.toString()
            )
        ),
    ];

    for (const tenantId of tenantIds) {
        // Demote tenant to USER if they have no other active or scheduled tenancies
        const otherActiveOccupancies = await RentalOccupant.countDocuments({
            tenant: tenantId,
            rental: { $ne: rental._id },
            status: { $in: ["ACTIVE", "PENDING"] },
        });
        const otherActiveRentals = await Rental.countDocuments({
            tenant: tenantId,
            _id: { $ne: rental._id },
            status: { $in: ["active", "scheduled"] },
        });

        if (otherActiveOccupancies === 0 && otherActiveRentals === 0) {
            await User.updateOne(
                { _id: tenantId, role: UserRole.TENANT },
                { $set: { role: UserRole.USER } }
            );
            console.info(
                `[TERMINATE_RENTAL] Demoted tenant ${tenantId} to USER role (no other active tenancies remain)`
            );
        }

        await notificationService.notify({
            recipient: tenantId,
            title: "Rental terminated",
            message:
                "Your rental agreement has been terminated by the property owner.",
            type: "rental_rejected",
            referenceId: rental._id.toString(),
            referenceType: "property",
        });
    }

    emitDashboardUpdate(
        {
            userIds: [
                rental.owner.toString(),
                ...tenantIds,
            ],
            admins: true,
        },
        "rental",
        "terminated",
        rental._id
    );

    return {
        success: true,
        message: "Rental terminated successfully",
    };
};

const createManualRentalAgreement = async (
    ownerId: string,
    input: CreateManualAgreementInput
) => {
    const property = await Property.findById(input.propertyId);
    if (!property) {
        throw new AppError(404, "Property not found");
    }
    if (property.owner.toString() !== ownerId) {
        throw new AppError(403, "You do not own this property");
    }

    const tenantEmail = input.tenantEmail.trim().toLowerCase();
    const tenant = await User.findOne({ email: tenantEmail });
    if (!tenant) {
        throw new AppError(
            404,
            `No registered user found with email ${tenantEmail}. The tenant must have a SpotNest account.`
        );
    }
    if (tenant._id.toString() === ownerId) {
        throw new AppError(400, "You cannot create a rental agreement with yourself");
    }

    const leaseStart = new Date(input.leaseStart);
    const leaseEnd = new Date(input.leaseEnd);
    if (Number.isNaN(leaseStart.getTime()) || Number.isNaN(leaseEnd.getTime())) {
        throw new AppError(400, "Invalid lease start or end date");
    }
    if (leaseEnd <= leaseStart) {
        throw new AppError(400, "Lease end date must be after lease start date");
    }

    const existingConflict = await Rental.findOne({
        property: property._id,
        status: { $in: ["scheduled", "active"] },
        leaseStart: { $lt: leaseEnd },
        leaseEnd: { $gt: leaseStart },
    });
    if (existingConflict) {
        throw new AppError(
            409,
            "This property already has an active or scheduled rental for the selected dates"
        );
    }

    let agreementTerms = input.terms?.trim();
    if (!agreementTerms) {
        const owner = await User.findById(ownerId).select("rentalTerms");
        agreementTerms = owner?.rentalTerms?.trim() || DEFAULT_TERMS;
    }

    const rental = await Rental.create({
        property: property._id,
        owner: new mongoose.Types.ObjectId(ownerId),
        tenant: tenant._id,
        monthlyRent: input.monthlyRent,
        securityDeposit: input.securityDeposit,
        leaseStart,
        leaseEnd,
        paymentFrequency: input.paymentFrequency ?? "monthly",
        status: "scheduled",
    });

    const occupant = await RentalOccupant.create({
        rental: rental._id,
        tenant: tenant._id,
        rentAmount: input.monthlyRent,
        securityDepositShare: input.securityDeposit,
        status: "PENDING",
        joinedAt: leaseStart,
    });

    let deliveryStatus: "PENDING" | "DELIVERED" | "FAILED" =
        input.autoSend === false ? "PENDING" : "DELIVERED";
    let deliveryError: string | undefined;

    if (input.autoSend !== false) {
        try {
            const owner = await User.findById(ownerId).select("name");
            await sendAgreementEmail(tenant.email, {
                propertyTitle: property.title,
                ownerName: owner?.name || "Property Owner",
                monthlyRent: input.monthlyRent,
                securityDeposit: input.securityDeposit,
            });
        } catch (err: any) {
            console.warn("[MANUAL_AGREEMENT_EMAIL_FAILED]", err?.message);
            deliveryStatus = "FAILED";
            deliveryError = err?.message || "Email delivery failed";
        }
    }

    const agreement = new RentalAgreement({
        rental: rental._id,
        occupant: occupant._id,
        tenant: tenant._id,
        owner: new mongoose.Types.ObjectId(ownerId),
        property: property._id,
        monthlyRent: input.monthlyRent,
        securityDepositShare: input.securityDeposit,
        maintenanceFee: input.maintenanceFee ?? 0,
        paymentFrequency: input.paymentFrequency ?? "monthly",
        noticePeriodDays: input.noticePeriodDays ?? 30,
        leaseStart,
        leaseEnd,
        terms: agreementTerms,
        status: "PENDING_TENANT",
        version: 1,
        deliveryStatus,
        deliveryError,
    });
    await agreement.save();

    await notificationService.notify({
        recipient: tenant._id.toString(),
        title: "New rental agreement prepared",
        message: `A new rental agreement for ${property.title} was created by the property owner. Please review and accept the agreement.`,
        type: "rental_approved",
        referenceId: rental._id.toString(),
        referenceType: "rental",
        data: {
            rentalId: rental._id.toString(),
            agreementId: agreement._id.toString(),
            propertyId: property._id.toString(),
        },
        dedupeKey: `manual-agreement-created:${agreement._id.toString()}`,
    });

    emitDashboardUpdate(
        { userIds: [ownerId, tenant._id.toString()], admins: true },
        "rental",
        "created",
        rental._id
    );

    return {
        agreement: agreement.toObject(),
        rental: rental.toObject(),
        occupant: occupant.toObject(),
    };
};

const listOwnerAgreements = async (ownerId: string) => {
    const agreements = await RentalAgreement.find({ owner: ownerId })
        .populate("property", "title address propertyType price images")
        .populate("tenant", "name email phone")
        .populate("rental", "status splitMode")
        .sort({ created_at: -1 });

    return agreements.map((agr) => agr.toObject());
};

const getOwnerAgreementById = async (agreementId: string, ownerId: string) => {
    const agreement = await RentalAgreement.findOne({
        _id: agreementId,
        owner: ownerId,
    })
        .populate("property", "title address propertyType price images")
        .populate("tenant", "name email phone")
        .populate("rental", "status splitMode");

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    return agreement.toObject();
};

const updateAgreement = async (
    agreementId: string,
    ownerId: string,
    input: UpdateAgreementInput
) => {
    const agreement = await RentalAgreement.findOne({
        _id: agreementId,
        owner: ownerId,
    });

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    if (agreement.status === "ACTIVE" || agreement.advancePaidAt) {
        throw new AppError(
            400,
            "Active agreements with paid advances cannot be edited in place. Use an amendment workflow instead."
        );
    }

    if (agreement.status === "TERMINATED" || agreement.status === "CANCELLED") {
        throw new AppError(
            400,
            `Cannot edit agreement in state ${agreement.status}`
        );
    }

    const wasAccepted =
        agreement.status === "PENDING_OWNER" ||
        agreement.status === "APPROVED_PENDING_PAYMENT";

    if (wasAccepted) {
        agreement.history ??= [];
        agreement.history.push({
            version: agreement.version ?? 1,
            terms: agreement.terms,
            monthlyRent: agreement.monthlyRent,
            securityDepositShare: agreement.securityDepositShare,
            modifiedAt: new Date(),
            modifiedBy: new mongoose.Types.ObjectId(ownerId),
            note: input.revisionNote || "Revised agreement terms by owner",
        });

        agreement.version = (agreement.version ?? 1) + 1;
        agreement.status = "PENDING_TENANT";
        agreement.set("tenantAcceptedAt", undefined);
        agreement.set("ownerAcceptedAt", undefined);
        agreement.set("paymentDeadline", undefined);
    }

    if (input.terms) agreement.terms = input.terms.trim();
    if (input.monthlyRent) agreement.monthlyRent = input.monthlyRent;
    if (input.securityDepositShare !== undefined)
        agreement.securityDepositShare = input.securityDepositShare;
    if (input.maintenanceFee !== undefined)
        agreement.maintenanceFee = input.maintenanceFee;
    if (input.noticePeriodDays !== undefined)
        agreement.noticePeriodDays = input.noticePeriodDays;
    if (input.leaseStart) agreement.leaseStart = new Date(input.leaseStart);
    if (input.leaseEnd) agreement.leaseEnd = new Date(input.leaseEnd);

    await agreement.save();

    if (input.monthlyRent || input.securityDepositShare !== undefined) {
        await RentalOccupant.updateOne(
            { _id: agreement.occupant },
            {
                $set: {
                    ...(input.monthlyRent ? { rentAmount: input.monthlyRent } : {}),
                    ...(input.securityDepositShare !== undefined
                        ? { securityDepositShare: input.securityDepositShare }
                        : {}),
                },
            }
        );
        await Rental.updateOne(
            { _id: agreement.rental },
            {
                $set: {
                    ...(input.monthlyRent ? { monthlyRent: input.monthlyRent } : {}),
                    ...(input.securityDepositShare !== undefined
                        ? { securityDeposit: input.securityDepositShare }
                        : {}),
                },
            }
        );
    }

    if (wasAccepted) {
        await notificationService.notify({
            recipient: agreement.tenant.toString(),
            title: "Rental agreement revised by owner",
            message:
                "The owner updated the terms of your rental agreement. Please review and re-accept the revised terms.",
            type: "rental_status",
            referenceId: agreement.rental.toString(),
            referenceType: "rental",
            data: {
                rentalId: agreement.rental.toString(),
                agreementId: agreement._id.toString(),
                propertyId: agreement.property.toString(),
            },
            dedupeKey: `agreement-revised:${agreement._id.toString()}:v${agreement.version}`,
        });
    }

    emitDashboardUpdate(
        { userIds: [ownerId, agreement.tenant.toString()], admins: true },
        "rental",
        "status_changed",
        agreement.rental
    );

    return agreement.toObject();
};

const deleteOrCancelAgreement = async (
    agreementId: string,
    ownerId: string
) => {
    const agreement = await RentalAgreement.findOne({
        _id: agreementId,
        owner: ownerId,
    });

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    if (agreement.status === "ACTIVE" || agreement.advancePaidAt) {
        throw new AppError(
            400,
            "Cannot delete an active or paid rental agreement. Use the lease termination workflow instead."
        );
    }

    const isUnsignedDraft =
        (agreement.status === "PENDING_TENANT" || agreement.status === "DRAFT") &&
        !agreement.tenantAcceptedAt;

    if (isUnsignedDraft) {
        await RentalAgreement.deleteOne({ _id: agreementId });
        await RentalOccupant.deleteOne({ _id: agreement.occupant });

        const remainingOccupants = await RentalOccupant.countDocuments({
            rental: agreement.rental,
        });
        if (remainingOccupants === 0) {
            await Rental.deleteOne({ _id: agreement.rental });
        }

        emitDashboardUpdate(
            { userIds: [ownerId, agreement.tenant.toString()], admins: true },
            "rental",
            "status_changed",
            agreement.rental
        );

        return {
            deleted: true,
            cancelled: false,
            message: "Draft agreement permanently deleted",
        };
    }

    agreement.status = "CANCELLED";
    agreement.cancelledAt = new Date();
    agreement.cancelledBy = new mongoose.Types.ObjectId(ownerId);
    await agreement.save();

    await RentalOccupant.updateOne(
        { _id: agreement.occupant },
        { $set: { status: "TERMINATED", leftAt: new Date() } }
    );

    await notificationService.notify({
        recipient: agreement.tenant.toString(),
        title: "Rental agreement cancelled",
        message: "The property owner cancelled the pending rental agreement.",
        type: "rental_status",
        referenceId: agreement.rental.toString(),
        referenceType: "rental",
        data: {
            rentalId: agreement.rental.toString(),
            agreementId: agreement._id.toString(),
            propertyId: agreement.property.toString(),
        },
        dedupeKey: `agreement-cancelled:${agreement._id.toString()}`,
    });

    emitDashboardUpdate(
        { userIds: [ownerId, agreement.tenant.toString()], admins: true },
        "rental",
        "status_changed",
        agreement.rental
    );

    return {
        deleted: false,
        cancelled: true,
        message: "Rental agreement cancelled successfully",
    };
};

const resendAgreementNotification = async (
    agreementId: string,
    ownerId: string
) => {
    const agreement = await RentalAgreement.findOne({
        _id: agreementId,
        owner: ownerId,
    })
        .populate("property", "title")
        .populate("tenant", "email name");

    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    const tenantUser = agreement.tenant as any;
    const propertyObj = agreement.property as any;
    const ownerObj = await User.findById(ownerId).select("name");

    let deliveryStatus: "DELIVERED" | "FAILED" = "DELIVERED";
    let deliveryError: string | undefined;

    try {
        await sendAgreementEmail(tenantUser.email, {
            propertyTitle: propertyObj.title,
            ownerName: ownerObj?.name || "Property Owner",
            monthlyRent: agreement.monthlyRent,
            securityDeposit: agreement.securityDepositShare,
        });
    } catch (err: any) {
        console.warn("[RESEND_AGREEMENT_EMAIL_FAILED]", err?.message);
        deliveryStatus = "FAILED";
        deliveryError = err?.message || "Email delivery failed";
    }

    agreement.deliveryStatus = deliveryStatus;
    if (deliveryError) agreement.deliveryError = deliveryError;
    else agreement.set("deliveryError", undefined);
    await agreement.save();

    await notificationService.notify({
        recipient: tenantUser._id.toString(),
        title: "Rental agreement reminder",
        message: `Reminder: Please review and accept the rental agreement for ${propertyObj.title}.`,
        type: "rental_status",
        referenceId: agreement.rental.toString(),
        referenceType: "rental",
        data: {
            rentalId: agreement.rental.toString(),
            agreementId: agreement._id.toString(),
            propertyId: propertyObj._id.toString(),
        },
        dedupeKey: `agreement-resend:${agreement._id.toString()}:${Date.now()}`,
    });

    return {
        success: deliveryStatus === "DELIVERED",
        deliveryStatus,
        deliveryError,
        message:
            deliveryStatus === "DELIVERED"
                ? "Notification and email sent successfully"
                : "Notification sent, but email delivery failed",
    };
};

const lookupTenantByEmail = async (email: string) => {
    const user = await User.findOne({
        email: email.trim().toLowerCase(),
    }).select("name email phone role");

    if (!user) {
        return null;
    }

    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEligible: user.role === UserRole.USER || user.role === UserRole.TENANT,
    };
};

const getAdminRentals = async (options: {
    page?: number;
    limit?: number;
    status?: string;
}) => {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (options.status) {
        filter.status = options.status;
    }

    const [rentals, total] = await Promise.all([
        Rental.find(filter)
            .populate("property", "title address images price rentalStatus")
            .populate("tenant", "name email phone image")
            .populate("owner", "name email phone image")
            .populate("booking", "status checkIn checkOut paymentDeadline advancePaymentRequired")
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Rental.countDocuments(filter),
    ]);

    const enhanced = await Promise.all(
        rentals.map(async (rental: any) => {
            const agreement = await RentalAgreement.findOne({ rental: rental._id })
                .sort({ version: -1, created_at: -1 })
                .lean();

            const now = new Date();
            const leaseEnd = rental.leaseEnd ? new Date(rental.leaseEnd) : null;
            const gracePeriodEnd = leaseEnd ? new Date(leaseEnd.getTime() + 3 * 24 * 60 * 60 * 1000) : null;
            const isGracePeriodActive = Boolean(
                leaseEnd && now > leaseEnd && gracePeriodEnd && now <= gracePeriodEnd
            );

            const rentalIdStr = rental._id ? rental._id.toString() : "";
            return {
                ...rental,
                id: rentalIdStr,
                _id: rentalIdStr,
                agreement: agreement
                    ? {
                          id: agreement._id.toString(),
                          status: agreement.status,
                          tenantAcceptedAt: agreement.tenantAcceptedAt,
                          ownerAcceptedAt: agreement.ownerAcceptedAt,
                          paymentDeadline: agreement.paymentDeadline,
                          terms: agreement.terms,
                          version: agreement.version,
                      }
                    : null,
                isGracePeriodActive,
                gracePeriodEnd: gracePeriodEnd ? gracePeriodEnd.toISOString() : null,
            };
        })
    );

    return {
        rentals: enhanced,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
};

const adminTerminateRental = async (rentalId: string, reason?: string) => {
    const rental = await Rental.findById(rentalId);
    if (!rental) {
        throw new AppError(404, "Rental not found");
    }

    rental.status = "ended";
    await rental.save();

    if (rental.booking) {
        await Booking.updateOne(
            { _id: rental.booking },
            { $set: { status: "COMPLETED" } }
        );
    }

    const now = new Date();
    await RentalOccupant.updateMany(
        { rental: rental._id, status: { $ne: "TERMINATED" } },
        { $set: { status: "TERMINATED", leftAt: now } }
    );

    await RentalAgreement.updateMany(
        { rental: rental._id, status: { $ne: "TERMINATED" } },
        { $set: { status: "TERMINATED", rejectionReason: reason ?? "Terminated by administrator" } }
    );

    if (rental.property) {
        await Property.updateOne(
            { _id: rental.property },
            { $set: { rentalStatus: "available" } }
        );
    }

    const occupants = await RentalOccupant.find({ rental: rental._id });
    const tenantIds = [...new Set(occupants.map((o) => o.tenant.toString()))];

    for (const tenantId of tenantIds) {
        const otherActiveOccupancies = await RentalOccupant.countDocuments({
            tenant: tenantId,
            rental: { $ne: rental._id },
            status: { $in: ["ACTIVE", "PENDING"] },
        });
        const otherActiveRentals = await Rental.countDocuments({
            tenant: tenantId,
            _id: { $ne: rental._id },
            status: { $in: ["active", "scheduled"] },
        });

        if (otherActiveOccupancies === 0 && otherActiveRentals === 0) {
            await User.updateOne(
                { _id: tenantId, role: UserRole.TENANT },
                { $set: { role: UserRole.USER } }
            );
        }

        await notificationService.notify({
            recipient: tenantId,
            title: "Rental terminated by Administrator",
            message: reason ? `Your rental was terminated: ${reason}` : "Your rental was terminated by administrator.",
            type: "rental_rejected",
            referenceId: rental._id.toString(),
            referenceType: "property",
        });
    }

    if (rental.owner) {
        await notificationService.notify({
            recipient: rental.owner.toString(),
            title: "Rental terminated by Administrator",
            message: reason ? `Rental on your property was terminated: ${reason}` : "Rental was terminated by administrator.",
            type: "rental_status",
            referenceId: rental._id.toString(),
            referenceType: "property",
        });
    }

    emitDashboardUpdate({ userIds: [rental.owner.toString(), ...tenantIds], admins: true }, "rental", "status_changed", rental._id.toString());

    return { message: "Rental terminated successfully by administrator" };
};

export default {
    createDefaultOccupantAndAgreement,
    getTenantRental,
    getAgreementForTenant,
    acceptAgreement,
    confirmAgreement,
    setRentSplit,
    getOwnerRentals,
    terminateRental,
    getOwnerRentalTerms,
    updateOwnerRentalTerms,
    createManualRentalAgreement,
    listOwnerAgreements,
    getOwnerAgreementById,
    updateAgreement,
    deleteOrCancelAgreement,
    resendAgreementNotification,
    lookupTenantByEmail,
    formatAgreementTerms,
    getAdminRentals,
    adminTerminateRental,
};

