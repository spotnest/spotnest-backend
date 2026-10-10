import mongoose from "mongoose";
import { AppError } from "../../shared/errors/AppError.js";
import User from "../auth/model.js";
import { Rental, Payment } from "../dashboard/tenantDashboard/model.js";
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

export const createDefaultOccupantAndAgreement = async (
    rental: any,
    tenantId: string,
    rentAmount: number,
    securityDepositShare: number
) => {
    // 1. Create or update primary occupant
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

    // 2. Create or update agreement
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
            terms: DEFAULT_TERMS,
            status: "PENDING_TENANT",
        });
    }

    return { occupant, agreement };
};

const getTenantRental = async (tenantId: string) => {
    const occupant = await RentalOccupant.findOne({
        tenant: tenantId,
        status: { $in: ["PENDING", "ACTIVE"] },
    })
        .populate("rental")
        .sort({ created_at: -1 });

    if (!occupant || !occupant.rental) {
        return null;
    }

    const rental = await repository.findRentalById(occupant.rental._id.toString());
    if (!rental) return null;

    const agreement = await RentalAgreement.findOne({
        rental: rental._id,
        tenant: tenantId,
        status: { $ne: "TERMINATED" },
    }).sort({ created_at: -1 });

    const occupants = await repository.findOccupantsByRental(rental._id.toString());

    // Payments for this occupant
    const payments = await repository.findPaymentsByOccupant(occupant._id.toString());

    return {
        rental: {
            id: rental._id.toString(),
            bookingId: rental.booking?.toString() ?? "",
            status: rental.status,
            monthlyRent: rental.monthlyRent,
            securityDeposit: rental.securityDeposit,
            leaseStart: rental.leaseStart.toISOString(),
            leaseEnd: rental.leaseEnd.toISOString(),
            paymentFrequency: rental.paymentFrequency,
            splitMode: rental.splitMode ?? "EQUAL",
            property: {
                id: (rental.property as any)._id.toString(),
                title: (rental.property as any).title,
                propertyType: (rental.property as any).propertyType,
                address: (rental.property as any).address,
                image: (rental.property as any).images?.[0]?.url,
                bedrooms: (rental.property as any).bedrooms,
                bathrooms: (rental.property as any).bathrooms,
                areaSqFt: (rental.property as any).areaSqFt,
                amenities: (rental.property as any).amenities ?? [],
            },
            owner: {
                id: (rental.owner as any)._id.toString(),
                name: (rental.owner as any).name,
                email: (rental.owner as any).email,
                phone: (rental.owner as any).phone,
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
                id: (occ.tenant as any)._id.toString(),
                name: (occ.tenant as any).name,
                email: (occ.tenant as any).email,
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
                  securityDepositShare: agreement.securityDepositShare,
                  leaseStart: agreement.leaseStart.toISOString(),
                  leaseEnd: agreement.leaseEnd.toISOString(),
                  terms: agreement.terms,
                  tenantAcceptedAt: agreement.tenantAcceptedAt?.toISOString(),
                  ownerAcceptedAt: agreement.ownerAcceptedAt?.toISOString(),
              }
            : null,
        payments: payments.map((p) => ({
            id: p._id.toString(),
            type: p.type,
            amount: p.amount,
            status: p.status.toLowerCase(),
            dueDate: p.dueDate ? p.dueDate.toISOString() : undefined,
            paidAt: p.paidAt ? p.paidAt.toISOString() : undefined,
            billingMonth: p.billingMonth,
            razorpayOrderId: p.razorpayOrderId,
            created_at: p.created_at.toISOString(),
        })),
    };
};

const getAgreementForTenant = async (tenantId: string, agreementId?: string) => {
    const agreement = await repository.findAgreementForTenant(tenantId, agreementId);
    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }
    return agreement;
};

const acceptAgreement = async (agreementId: string, tenantId: string) => {
    const agreement = await RentalAgreement.findOne({ _id: agreementId, tenant: tenantId });
    if (!agreement) {
        throw new AppError(404, "Rental agreement not found");
    }

    if (agreement.status !== "PENDING_TENANT") {
        throw new AppError(409, `Agreement cannot be accepted in state ${agreement.status}`);
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
    emitDashboardUpdate({ userIds: [agreement.owner, agreement.tenant] }, "rental", "agreement_accepted", agreement.rental);

    return agreement.toObject();
};


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
            `Agreement cannot be confirmed in state ${agreement.status}`
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
        now.getTime() + 72 * 60 * 60 * 1000
    );

    agreement.ownerAcceptedAt = now;
    agreement.paymentDeadline = paymentDeadline;
    agreement.status = "APPROVED_PENDING_PAYMENT";

    await agreement.save();

    // Do not activate the occupant or rental at owner approval.
    // Verified advance payment must drive activation in the payment service.

    await notificationService.createNotification({
        recipient: agreement.tenant.toString(),
        title: "Rental agreement approved",
        message:
            "The owner approved your rental agreement. Complete your advance payment within 72 hours to proceed.",
        type: "rental_approved",
        referenceId: agreement.rental.toString(),
        referenceType: "property",
    });
    emitDashboardUpdate(
        { userIds: [agreement.owner, agreement.tenant], admins: true },
        "rental",
        "agreement_confirmed",
        agreement.rental
    );

    return agreement.toObject();
};

const setRentSplit = async (rentalId: string, ownerId: string, payload: SetRentSplitInput) => {
    const rental = await Rental.findOne({ _id: rentalId, owner: ownerId });
    if (!rental) {
        throw new AppError(404, "Rental not found or access denied");
    }

    const { splitMode, occupants: occupantInputs } = payload;

    // Validate occupants input
    if (!occupantInputs || occupantInputs.length === 0) {
        throw new AppError(400, "At least one occupant is required");
    }

    const resolvedOccupants: Array<{
        userId: string;
        rentAmount: number;
        securityDepositShare: number;
    }> = [];

    let calculatedTotalRent = 0;

    if (splitMode === "EQUAL") {
        const shareCount = occupantInputs.length;
        const equalRent = Math.floor((rental.monthlyRent / shareCount) * 100) / 100;
        const equalDeposit = Math.floor((rental.securityDeposit / shareCount) * 100) / 100;

        // Give remainder cents to first occupant to match exact total
        const rentRemainder = Math.round((rental.monthlyRent - equalRent * shareCount) * 100) / 100;
        const depositRemainder = Math.round((rental.securityDeposit - equalDeposit * shareCount) * 100) / 100;

        for (let i = 0; i < occupantInputs.length; i++) {
            const item = occupantInputs[i]!;
            let userId = item.tenantId;
            if (!userId && item.tenantEmail) {
                const user = await User.findOne({ email: item.tenantEmail.trim().toLowerCase() });
                if (!user) {
                    throw new AppError(400, `User with email ${item.tenantEmail} not found`);
                }
                userId = user._id.toString();
            }

            if (!userId) {
                throw new AppError(400, "Each occupant must specify tenantId or tenantEmail");
            }

            const rentShare = i === 0 ? equalRent + rentRemainder : equalRent;
            const depositShare = i === 0 ? equalDeposit + depositRemainder : equalDeposit;

            resolvedOccupants.push({
                userId,
                rentAmount: rentShare,
                securityDepositShare: depositShare,
            });
            calculatedTotalRent += rentShare;
        }
    } else {
        // CUSTOM split mode
        for (let i = 0; i < occupantInputs.length; i++) {
            const item = occupantInputs[i]!;
            let userId = item.tenantId;
            if (!userId && item.tenantEmail) {
                const user = await User.findOne({ email: item.tenantEmail.trim().toLowerCase() });
                if (!user) {
                    throw new AppError(400, `User with email ${item.tenantEmail} not found`);
                }
                userId = user._id.toString();
            }

            if (!userId) {
                throw new AppError(400, "Each occupant must specify tenantId or tenantEmail");
            }

            if (item.rentAmount === undefined || item.rentAmount < 0) {
                throw new AppError(400, `Rent share must be specified for custom split`);
            }

            const depositShare = item.securityDepositShare ?? Math.round((item.rentAmount / rental.monthlyRent) * rental.securityDeposit);

            resolvedOccupants.push({
                userId,
                rentAmount: item.rentAmount,
                securityDepositShare: depositShare,
            });
            calculatedTotalRent += item.rentAmount;
        }
    }

    // STRICT VALIDATION: sum(rentAmount) === total monthly rent
    const roundedCalculatedSum = Math.round(calculatedTotalRent * 100) / 100;
    const roundedTotalRent = Math.round(rental.monthlyRent * 100) / 100;

    if (Math.abs(roundedCalculatedSum - roundedTotalRent) > 0.01) {
        throw new AppError(
            400,
            `Rent split validation failed: Sum of occupant rent shares (₹${roundedCalculatedSum.toLocaleString(
                "en-IN"
            )}) must equal total monthly rent (₹${roundedTotalRent.toLocaleString("en-IN")})`
        );
    }

    // Check for duplicate tenant IDs in payload
    const tenantIdsSet = new Set(resolvedOccupants.map((o) => o.userId));
    if (tenantIdsSet.size !== resolvedOccupants.length) {
        throw new AppError(400, "Duplicate occupants found in rent split payload");
    }

    // Update rental split mode
    rental.splitMode = splitMode;
    await rental.save();

    // Upsert occupants & agreements
    const updatedOccupants = [];
    for (const occItem of resolvedOccupants) {
        let occupant = await RentalOccupant.findOne({
            rental: rental._id,
            tenant: occItem.userId,
            status: { $ne: "TERMINATED" },
        });

        if (occupant) {
            occupant.rentAmount = occItem.rentAmount;
            occupant.securityDepositShare = occItem.securityDepositShare;
            await occupant.save();
        } else {
            occupant = await RentalOccupant.create({
                rental: rental._id,
                tenant: occItem.userId,
                rentAmount: occItem.rentAmount,
                securityDepositShare: occItem.securityDepositShare,
                status: "PENDING",
                joinedAt: rental.leaseStart,
            });
        }
        updatedOccupants.push(occupant);

        // Ensure agreement exists for occupant
        let agreement = await RentalAgreement.findOne({
            rental: rental._id,
            tenant: occItem.userId,
            status: { $ne: "TERMINATED" },
        });

        if (agreement) {
            agreement.monthlyRent = occItem.rentAmount;
            agreement.securityDepositShare = occItem.securityDepositShare;
            await agreement.save();
        } else {
            await RentalAgreement.create({
                rental: rental._id,
                occupant: occupant._id,
                tenant: occItem.userId,
                owner: rental.owner,
                property: rental.property,
                monthlyRent: occItem.rentAmount,
                securityDepositShare: occItem.securityDepositShare,
                leaseStart: rental.leaseStart,
                leaseEnd: rental.leaseEnd,
                terms: DEFAULT_TERMS,
                status: "PENDING_TENANT",
            });

            await notificationService.createNotification({
                recipient: occItem.userId,
                title: "Added to shared rental agreement",
                message: `You were added as an occupant for property rental. Please log in to review and accept your agreement.`,
                type: "rental_approved",
                referenceId: rental._id.toString(),
                referenceType: "property",
            });
        }
    }

    emitDashboardUpdate(
        { userIds: [rental.owner, ...resolvedOccupants.map((occupant) => occupant.userId)] },
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

const getOwnerRentals = async (ownerId: string) => {
    const rentals = await repository.findRentalsByOwner(ownerId);

    const result = [];
    for (const rental of rentals) {
        const occupants = await repository.findOccupantsByRental(rental._id.toString());
        const agreements = await repository.findAgreementsByRental(rental._id.toString());
        const payments = await repository.findPaymentsByRental(rental._id.toString());

        const occupantsWithDetails = occupants.map((occ) => {
            const occupantAgreement = agreements.find(
                (a) => a.tenant._id.toString() === (occ.tenant as any)._id.toString()
            );
            const occupantPayments = payments.filter(
                (p) => p.tenant.toString() === (occ.tenant as any)._id.toString()
            );

            const latestPayment = occupantPayments[0];

            return {
                id: occ._id.toString(),
                tenant: {
                    id: (occ.tenant as any)._id.toString(),
                    name: (occ.tenant as any).name,
                    email: (occ.tenant as any).email,
                    phone: (occ.tenant as any).phone,
                },
                rentAmount: occ.rentAmount,
                securityDepositShare: occ.securityDepositShare,
                status: occ.status,
                agreementStatus: occupantAgreement?.status ?? "NONE",
                agreementId: occupantAgreement?._id.toString(),
                tenantAcceptedAt: occupantAgreement?.tenantAcceptedAt?.toISOString(),
                ownerAcceptedAt: occupantAgreement?.ownerAcceptedAt?.toISOString(),
                monthlyPaymentStatus: latestPayment ? latestPayment.status.toUpperCase() : "NO_PAYMENTS",
                latestPaymentAmount: latestPayment?.amount,
                latestPaymentMonth: latestPayment?.billingMonth,
            };
        });

        result.push({
            id: rental._id.toString(),
            bookingId: rental.booking?.toString() ?? "",
            property: {
                id: (rental.property as any)._id.toString(),
                title: (rental.property as any).title,
                address: (rental.property as any).address,
                price: (rental.property as any).price,
            },
            monthlyRent: rental.monthlyRent,
            securityDeposit: rental.securityDeposit,
            leaseStart: rental.leaseStart.toISOString(),
            leaseEnd: rental.leaseEnd.toISOString(),
            status: rental.status,
            splitMode: rental.splitMode ?? "EQUAL",
            occupants: occupantsWithDetails,
        });
    }

    return result;
};

const terminateRental = async (rentalId: string, ownerId: string) => {
    const rental = await Rental.findOne({ _id: rentalId, owner: ownerId });
    if (!rental) {
        throw new AppError(404, "Rental not found or access denied");
    }

    rental.status = "ended";
    await rental.save();

    if (rental.booking) {
        const Booking = (await import("../bookings/model.js")).default;
        await Booking.updateOne({ _id: rental.booking }, { $set: { status: "COMPLETED" } });
    }

    const now = new Date();
    await RentalOccupant.updateMany(
        { rental: rental._id, status: { $ne: "TERMINATED" } },
        { $set: { status: "TERMINATED", leftAt: now } }
    );

    await RentalAgreement.updateMany(
        { rental: rental._id, status: { $ne: "TERMINATED" } },
        { $set: { status: "TERMINATED" } }
    );

    const occupants = await RentalOccupant.find({ rental: rental._id });
    const tenantIds = [...new Set(occupants.map((occ) => occ.tenant.toString()))];
    for (const occ of occupants) {
        await notificationService.createNotification({
            recipient: occ.tenant.toString(),
            title: "Rental terminated",
            message: "Your rental agreement has been terminated by the property owner.",
            type: "rental_rejected",
            referenceId: rental._id.toString(),
            referenceType: "property",
        });
    }
    emitDashboardUpdate({ userIds: [rental.owner, ...tenantIds], admins: true }, "rental", "terminated", rental._id);

    return { success: true, message: "Rental terminated successfully" };
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
};
