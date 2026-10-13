
import mongoose from "mongoose";
import Property from "../properties/model.js";
import { AppError } from "../../shared/errors/AppError.js";
import Booking from "./model.js";
import bookingRepository from "./repository.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import type { CreateBookingInput } from "./validation.js";
import type { ReviewBookingInput } from "./validation.js";
import { Rental } from "../dashboard/tenantDashboard/model.js";
import { RentalAgreement } from "../rentals/model.js";
import { createDefaultOccupantAndAgreement } from "../rentals/service.js";
import User from "../auth/model.js";
import {
    sendAgreementEmail,
    sendTenantExtensionInquiryEmail,
} from "../../shared/utils/email.js";
import type { TenantInquiryStatus, TenantInquiryChoice } from "./type.js";

const createBooking = async (
    userId: string,
    payload: CreateBookingInput
) => {
    const property = await Property.findById(payload.propertyId);

    if (!property) {
        throw new AppError(404, "Property not found");
    }

    if (property.status !== "active") {
        throw new AppError(
            400,
            "This property is not available for rental requests"
        );
    }

    if (property.owner.toString() === userId) {
        throw new AppError(
            400,
            "You cannot request to rent your own property"
        );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const requestedStart = new Date(
        Date.UTC(
            payload.startDate.getUTCFullYear(),
            payload.startDate.getUTCMonth(),
            payload.startDate.getUTCDate()
        )
    );

    if (
        requestedStart < today ||
        payload.endDate <= payload.startDate
    ) {
        throw new AppError(
            400,
            "Choose a future start date and an end date after it"
        );
    }

    const monthlyRent = Number(property.price);
    const advanceAmount = Number(
        property.advanceAmount ?? property.price
    );

    if (
        !Number.isFinite(monthlyRent) ||
        monthlyRent <= 0 ||
        !Number.isFinite(advanceAmount) ||
        advanceAmount <= 0
    ) {
        throw new AppError(400, "Property rental terms are invalid");
    }

    const activeRental = await Rental.findOne({
        property: property._id,
        status: "active",
    }).populate("tenant", "name email phone");

    const confirmedBooking = await Booking.findOne({
        propertyId: property._id,
        status: { $in: ["CONFIRMED", "ACTIVE"] },
        endDate: { $gt: today },
    })
        .sort({ endDate: -1 })
        .lean();

    const occupiedTenancy = activeRental || confirmedBooking;
    let tenantInquiryPayload: any = undefined;

    if (occupiedTenancy) {
        const currentTenantIdStr =
            (activeRental &&
                ((activeRental.tenant as any)?._id?.toString() ||
                    activeRental.tenant?.toString())) ||
            (confirmedBooking && confirmedBooking.userId.toString());

        if (currentTenantIdStr === userId) {
            throw new AppError(
                409,
                "You already have an active rental for this property"
            );
        }

        const currentLeaseEnd =
            activeRental?.leaseEnd ?? confirmedBooking?.endDate;

        if (currentLeaseEnd) {
            const currentEndUtc = new Date(currentLeaseEnd);

            if (payload.startDate <= currentEndUtc) {
                const formattedLeaseEnd =
                    currentEndUtc.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                    });

                throw new AppError(
                    400,
                    `This property is currently occupied until ${formattedLeaseEnd}. Your requested rental start date must be strictly after the current lease ends.`
                );
            }
        }

        // Start the 3-day tenant extension inquiry.
        const deadline = new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000
        );

        const formattedStart = payload.startDate.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );

        const formattedEnd = payload.endDate.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );

        const currentEndFormatted = currentLeaseEnd
            ? new Date(currentLeaseEnd).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
              })
            : "your lease end date";

        const question = `Another applicant has requested to rent this property from ${formattedStart} to ${formattedEnd} (after your scheduled lease ends on ${currentEndFormatted}). Are you okay to end the rent at the scheduled time, or are you considering extending your rental?`;

        const currentTenantId =
            (activeRental?.tenant as any)?._id ??
            activeRental?.tenant ??
            confirmedBooking?.userId;

        tenantInquiryPayload = {
            currentTenantId,
            currentRentalId: activeRental?._id,
            status: "PENDING" as TenantInquiryStatus,
            deadline,
            question,
        };
    }

    const myExistingRequest = await Booking.findOne({
        propertyId: property._id,
        userId: new mongoose.Types.ObjectId(userId),
        status: { $in: ["PENDING", "APPROVED"] },
    }).lean();

    if (myExistingRequest) {
        if (myExistingRequest.status === "APPROVED") {
            const existingRental = await Rental.findOne({
                booking: myExistingRequest._id,
            }).lean();

            const existingAgreement = existingRental
                ? await RentalAgreement.findOne({
                      rental: existingRental._id,
                      tenant: myExistingRequest.userId,
                  }).lean()
                : null;

            const now = new Date();

            const isAgreementExpired =
                existingAgreement &&
                (existingAgreement.status === "EXPIRED" ||
                    (existingAgreement.paymentDeadline &&
                        now >= existingAgreement.paymentDeadline));

            if (isAgreementExpired) {
                // Expire the previous booking and agreement so the
                // tenant can submit a new request.
                await Booking.updateOne(
                    { _id: myExistingRequest._id },
                    { $set: { status: "EXPIRED" } }
                );

                if (
                    existingAgreement &&
                    existingAgreement.status !== "EXPIRED"
                ) {
                    await RentalAgreement.updateOne(
                        { _id: existingAgreement._id },
                        { $set: { status: "EXPIRED" } }
                    );
                }
            } else {
                throw new AppError(
                    409,
                    "Your rental request is already approved. Please proceed to pay advance."
                );
            }
        } else {
            throw new AppError(
                409,
                "You already have a pending rental request for this property."
            );
        }
    }

    const booking = await bookingRepository.createBooking({
        userId: new mongoose.Types.ObjectId(userId),
        propertyId: property._id,
        ownerId: property.owner,
        monthlyRent,
        advanceAmount,
        currency: "INR",
        status: "PENDING",
        paymentStatus: "NOT_DUE",
        startDate: payload.startDate,
        endDate: payload.endDate,
        ...(payload.notes ? { notes: payload.notes } : {}),
        ...(tenantInquiryPayload
            ? { tenantInquiry: tenantInquiryPayload }
            : {}),
    });

    // Occupied-property inquiry flow.
    if (tenantInquiryPayload) {
        const currentTenant =
            (activeRental?.tenant as any) ||
            (await User.findById(
                tenantInquiryPayload.currentTenantId
            ).select("name email phone"));

        const formattedDeadline =
            tenantInquiryPayload.deadline.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });

        const formattedStart = payload.startDate.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );

        const formattedEnd = payload.endDate.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }
        );

        if (currentTenant?.email) {
            try {
                await sendTenantExtensionInquiryEmail(
                    currentTenant.email,
                    {
                        propertyTitle: property.title,
                        tenantName: currentTenant.name || "Tenant",
                        requestedStartDate: formattedStart,
                        requestedEndDate: formattedEnd,
                        deadlineDate: formattedDeadline,
                    }
                );
            } catch (err: any) {
                console.warn(
                    "[TENANT_INQUIRY_EMAIL_FAILED]",
                    err?.message
                );
            }
        }

        // Notify the current tenant.
        await notificationService.notify({
            recipient:
                tenantInquiryPayload.currentTenantId.toString(),
            title: "Action required: Move-out schedule inquiry",
            message: `Another applicant has requested to rent ${property.title} from ${formattedStart} to ${formattedEnd}. Please confirm whether you will vacate or extend within 3 days.`,
            type: "rental_status",
            referenceId: booking._id.toString(),
            referenceType: "booking",
            data: {
                bookingId: booking._id.toString(),
                propertyId: property._id.toString(),
                paymentDeadline:
                    tenantInquiryPayload.deadline.toISOString(),
            },
            dedupeKey: `tenant-inquiry:${booking._id.toString()}`,
        });

        // Notify the new applicant.
        await notificationService.notify({
            recipient: userId,
            title: "Property currently occupied",
            message:
                "The property is currently occupied. We have contacted the current tenant regarding their move-out schedule and will update you within 3 days.",
            type: "rental_status",
            referenceId: booking._id.toString(),
            referenceType: "booking",
            data: {
                bookingId: booking._id.toString(),
                propertyId: property._id.toString(),
            },
            dedupeKey: `occupied-booking-notice:${booking._id.toString()}`,
        });

        // Notify the owner about the occupied property.
        await notificationService.notify({
            recipient: property.owner.toString(),
            title: "New rental request on occupied property",
            message: `A new rental request was submitted for ${property.title}. Since the property is currently occupied, we have sent a 3-day inquiry to the current tenant before you can review.`,
            type: "rental_request",
            referenceId: booking._id.toString(),
            referenceType: "booking",
            data: {
                bookingId: booking._id.toString(),
                propertyId: property._id.toString(),
            },
            dedupeKey: `rental-request:${booking._id.toString()}`,
        });
    } else {
        // Standard rental-request notification from origin/dev.
        await notificationService.createNotification({
            recipient: property.owner.toString(),
            title: "New rental request",
            message: `A tenant requested to rent ${property.title}.`,
            type: "rental_request",
            referenceId: booking._id.toString(),
            referenceType: "booking",
        });
    }

    emitDashboardUpdate(
        { userIds: [property.owner, userId], admins: true },
        "booking",
        "created",
        booking._id
    );

    return booking.toObject();
};

const getBookingForUser = async (
    bookingId: string,
    userId: string
) => {
    const booking = await bookingRepository.findForUser(
        bookingId,
        userId
    );

    if (!booking) {
        throw new AppError(404, "Booking not found");
    }

    return booking.toObject();
};

const listMyBookings = async (userId: string) => {
    const bookings = await bookingRepository.findByUser(userId);
    return bookings.map((booking) => booking.toObject());
};

const listOwnerRequests = async (ownerId: string) => {
    const bookings = await bookingRepository.findPendingForOwner(ownerId);
    return bookings.map((booking) => booking.toObject());
};

const reviewBooking = async (
    bookingId: string,
    ownerId: string,
    input: ReviewBookingInput
) => {
    const booking = await bookingRepository.findForOwner(
        bookingId,
        ownerId
    );

    if (!booking) {
        throw new AppError(404, "Rental request not found");
    }

    if (booking.status !== "PENDING") {
        throw new AppError(
            409,
            "This rental request has already been reviewed"
        );
    }

    // A request involving an occupied property cannot be approved
    // while the current tenant's inquiry is still within its deadline.
    if (input.decision === "APPROVED" && booking.tenantInquiry) {
        const now = new Date();
        const isPending = booking.tenantInquiry.status === "PENDING";
        const isPastDeadline =
            now >= new Date(booking.tenantInquiry.deadline);

        if (isPending && !isPastDeadline) {
            throw new AppError(
                409,
                "Cannot approve this rental request yet. Waiting for the current tenant to respond to the move-out inquiry or until the 3-day deadline expires."
            );
        }

        if (isPending && isPastDeadline) {
            booking.tenantInquiry.status = "EXPIRED_DEEMED_CONSENT";
            booking.tenantInquiry.deemedConsentApplied = true;
            booking.tenantInquiry.responseMessage =
                "3-day deadline passed without tenant response. Deemed consent applied.";
        }
    }

    if (input.decision === "APPROVED") {
        // Create or reuse a single rental for this booking.
        const rental = await Rental.findOneAndUpdate(
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
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        // Create or update the pending occupant and agreement.
        await createDefaultOccupantAndAgreement(
            rental,
            booking.userId.toString(),
            booking.monthlyRent,
            booking.advanceAmount
        );

        booking.status = "APPROVED";
        booking.paymentStatus = "ADVANCE_PAYMENT_PENDING";
        booking.approvedAt = new Date();

        // Email the tenant about the agreement.
        try {
            const tenantUser = await User.findById(
                booking.userId
            ).select("email name");

            const propertyDoc = await Property.findById(
                booking.propertyId
            ).select("title");

            const ownerDoc = await User.findById(
                booking.ownerId
            ).select("name");

            if (tenantUser?.email) {
                await sendAgreementEmail(tenantUser.email, {
                    propertyTitle:
                        propertyDoc?.title || "Rental Property",
                    ownerName: ownerDoc?.name || "Property Owner",
                    monthlyRent: booking.monthlyRent,
                    securityDeposit: booking.advanceAmount,
                });
            }
        } catch (err: any) {
            console.warn(
                "[BOOKING_APPROVAL_AGREEMENT_EMAIL_FAILED]",
                err?.message
            );
        }
    } else {
        booking.status = "REJECTED";
        booking.paymentStatus = "NOT_DUE";
        booking.rejectedAt = new Date();
    }

    if (input.decisionNote) {
        booking.decisionNote = input.decisionNote;
    }

    await booking.save();

    await notificationService.createNotification({
        recipient: booking.userId.toString(),
        title:
            input.decision === "APPROVED"
                ? "Rental request approved"
                : "Rental request rejected",
        message:
            input.decision === "APPROVED"
                ? "Your rental request was approved. Review and accept the rental agreement before the owner gives final agreement approval and advance payment becomes available."
                : "Your rental request was rejected by the property owner.",
        type:
            input.decision === "APPROVED"
                ? "rental_approved"
                : "rental_rejected",
        referenceId: booking._id.toString(),
        referenceType: "booking",
    });

    emitDashboardUpdate(
        { userIds: [booking.userId, booking.ownerId], admins: true },
        "booking",
        input.decision === "APPROVED" ? "approved" : "rejected",
        booking._id
    );

    return booking.toObject();
};

const respondToTenantInquiry = async (
    bookingId: string,
    tenantId: string,
    input: {
        choice: TenantInquiryChoice;
        message?: string | undefined;
    }
) => {
    const booking = await Booking.findOne({
        _id: bookingId,
        "tenantInquiry.currentTenantId": tenantId,
    });

    if (!booking || !booking.tenantInquiry) {
        throw new AppError(404, "Inquiry not found for this tenant");
    }

    if (booking.tenantInquiry.status !== "PENDING") {
        throw new AppError(
            409,
            "You have already responded to this inquiry"
        );
    }

    let status: TenantInquiryStatus = "CUSTOM_MESSAGE";
    let defaultMessage = "";

    if (input.choice === "MOVE_OUT") {
        status = "ACCEPTED_MOVE_OUT";
        defaultMessage =
            "Yes, I am okay. I will end the rent at that time.";
    } else if (input.choice === "EXTEND") {
        status = "WANTS_EXTENSION";
        defaultMessage =
            "No, I am considering extending my rental.";
    } else {
        status = "CUSTOM_MESSAGE";
        defaultMessage =
            input.message?.trim() || "Custom response from tenant.";
    }

    booking.tenantInquiry.status = status;
    booking.tenantInquiry.responseChoice = input.choice;
    booking.tenantInquiry.responseMessage =
        input.message?.trim() || defaultMessage;
    booking.tenantInquiry.respondedAt = new Date();

    await booking.save();

    await notificationService.notify({
        recipient: booking.ownerId.toString(),
        title: "Current tenant responded to move-out inquiry",
        message: `Tenant response: "${booking.tenantInquiry.responseMessage}". You can now review the rental request.`,
        type: "rental_request",
        referenceId: booking._id.toString(),
        referenceType: "booking",
        data: {
            bookingId: booking._id.toString(),
            propertyId: booking.propertyId.toString(),
        },
        dedupeKey: `tenant-inquiry-resp:${booking._id.toString()}`,
    });

    emitDashboardUpdate(
        {
            userIds: [
                booking.ownerId.toString(),
                booking.userId.toString(),
                tenantId,
            ],
            admins: true,
        },
        "booking",
        "status_changed",
        booking._id
    );

    return booking.toObject();
};

export default {
    createBooking,
    getBookingForUser,
    listMyBookings,
    listOwnerRequests,
    reviewBooking,
    respondToTenantInquiry,
};
