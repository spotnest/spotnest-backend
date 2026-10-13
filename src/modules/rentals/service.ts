import { AppError } from "../../shared/errors/AppError.js";
import { RENTAL_PAYMENT_DEADLINE_MS } from "../../shared/config/constants.js";
import User from "../auth/model.js";
import Booking from "../bookings/model.js";
import { Rental } from "../dashboard/tenantDashboard/model.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import { RentalAgreement, RentalOccupant } from "./model.js";
import repository from "./repository.js";
import type { SetRentSplitInput } from "./validation.js";

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

    const agreementTerms = await getTermsForOwner(
        rental.owner.toString()
    );

    let agreement = await RentalAgreement.findOne({
        rental: rental._id,
        tenant: tenantId,
        status: { $nin: ["REJECTED", "TERMINATED"] },
    });

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
            return null;
        }

        rental = await repository.findRentalById(
            occupant.rental._id.toString()
        );
    }

    if (!rental) {
        return null;
    }

    const agreement = await RentalAgreement.findOne({
        rental: rental._id,
        tenant: tenantId,
        status: { $ne: "TERMINATED" },
    }).sort({ created_at: -1 });

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
            "The owner approved your rental agreement. " +
            "Complete your advance payment within the allowed time " +
            "or submit a new rental request.",
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
        await notificationService.createNotification({
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
};