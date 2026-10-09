import { AppError } from "../../shared/errors/AppError.js";
import propertyRepository from "../properties/repository.js";
import notificationService from "../notifications/service.js";
import visitRepository from "./repository.js";

import type { IVisit, VisitStatus } from "./type.js";

import type {
    ApproveVisitInput,
    CreateVisitInput,
    RejectVisitInput,
    RescheduleVisitInput,
} from "./validation.js";

// -----------------------------------------------------
// DATE / TIME VALIDATION
// -----------------------------------------------------

const parseDate = (date: string): Date => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

    if (!match) {
        throw new AppError(
            400,
            "Date must be in YYYY-MM-DD format"
        );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const parsedDate = new Date(
        year,
        month - 1,
        day,
        0,
        0,
        0,
        0
    );

    if (
        parsedDate.getFullYear() !== year ||
        parsedDate.getMonth() !== month - 1 ||
        parsedDate.getDate() !== day
    ) {
        throw new AppError(400, "Invalid date");
    }

    return parsedDate;
};

const parseTime = (
    time: string
): { hours: number; minutes: number } => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

    if (!match) {
        throw new AppError(
            400,
            "Time must be in HH:mm format"
        );
    }

    return {
        hours: Number(match[1]),
        minutes: Number(match[2]),
    };
};

const ensureDateTimeNotPast = (
    date: Date,
    time: string
): void => {
    const { hours, minutes } = parseTime(time);
    const now = new Date();
    const selectedDateTime = new Date(date);

    selectedDateTime.setHours(hours, minutes, 0, 0);

    if (selectedDateTime < now) {
        throw new AppError(
            400,
            "Visit date and time cannot be in the past"
        );
    }
};

// -----------------------------------------------------
// VISIT HELPERS
// -----------------------------------------------------

const getVisitOrThrow = async (
    visitId: string
): Promise<IVisit> => {
    const visit = await visitRepository.findById(visitId);

    if (!visit) {
        throw new AppError(404, "Visit request not found");
    }

    return visit;
};

const ensureOwnerAccess = (
    visit: IVisit,
    ownerId: string
): void => {
    if (visit.owner.toString() !== ownerId) {
        throw new AppError(
            403,
            "You are not authorized to manage this visit request"
        );
    }
};

const ensureStatus = (
    visit: IVisit,
    allowedStatuses: VisitStatus[],
    action: string
): void => {
    if (!allowedStatuses.includes(visit.status)) {
        throw new AppError(
            400,
            `Cannot ${action} a visit with status "${visit.status}"`
        );
    }
};

const updateConflict = (): AppError =>
    new AppError(
        409,
        "This visit request was already updated or is no longer in the expected status"
    );

// -----------------------------------------------------
// NOTIFICATIONS
// -----------------------------------------------------

const notifyRequester = async (
    visit: IVisit,
    title: string,
    message: string
): Promise<void> => {
    await notificationService.createNotification({
        recipient: visit.requester.toString(),
        title,
        message,
        type: "system",
        referenceId: visit._id.toString(),
        referenceType: "visit",
    });
};

const notifyOwner = async (
    visit: IVisit,
    title: string,
    message: string
): Promise<void> => {
    await notificationService.createNotification({
        recipient: visit.owner.toString(),
        title,
        message,
        type: "system",
        referenceId: visit._id.toString(),
        referenceType: "visit",
    });
};

// -----------------------------------------------------
// CREATE VISIT
// -----------------------------------------------------

const createVisit = async (
    requesterId: string,
    data: CreateVisitInput
): Promise<IVisit> => {
    const property = await propertyRepository.findById(
        data.propertyId
    );

    if (!property) {
        throw new AppError(404, "Property not found");
    }

    if (property.status !== "active") {
        throw new AppError(
            400,
            "This property is not currently available for visits"
        );
    }

    const ownerId = property.owner.toString();

    if (ownerId === requesterId) {
        throw new AppError(
            400,
            "You cannot request a visit for your own property"
        );
    }

    const requestedDate = parseDate(data.requestedDate);

    ensureDateTimeNotPast(
        requestedDate,
        data.requestedTime
    );

    const existingVisit =
        await visitRepository.findPendingByRequesterAndProperty(
            requesterId,
            data.propertyId
        );

    if (existingVisit) {
        throw new AppError(
            409,
            "You already have a pending visit request for this property",
            "VISIT_ALREADY_PENDING"
        );
    }

    let visit: IVisit;

    try {
        visit = await visitRepository.create({
            property: data.propertyId,
            requester: requesterId,
            owner: ownerId,
            requestedDate,
            requestedTime: data.requestedTime,
            ...(data.message
                ? { message: data.message }
                : {}),
        });
    } catch (error) {
        // The database unique index protects against
        // simultaneous duplicate pending requests.
        if ((error as { code?: number }).code === 11000) {
            throw new AppError(
                409,
                "You already have a pending visit request for this property",
                "VISIT_ALREADY_PENDING"
            );
        }

        throw error;
    }

    await notifyOwner(
        visit,
        "New visit request",
        `Someone requested a visit for your property "${property.title}".`
    );

    return visit;
};

// -----------------------------------------------------
// GET VISITS
// -----------------------------------------------------

const getMyVisits = async (
    requesterId: string
): Promise<IVisit[]> => {
    return visitRepository.findByRequester(requesterId);
};

const getOwnerVisits = async (
    ownerId: string
): Promise<IVisit[]> => {
    return visitRepository.findByOwner(ownerId);
};

const getAdminVisits = async (
    page: number,
    limit: number,
    status?: VisitStatus
) => {
    const skip = (page - 1) * limit;

    const { visits, total } =
        await visitRepository.findForAdmin({
            ...(status !== undefined ? { status } : {}),
            limit,
            skip,
        });

    return {
        visits,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
};

// -----------------------------------------------------
// GET SINGLE VISIT
// -----------------------------------------------------

const getVisitById = async (
    visitId: string,
    userId: string
): Promise<IVisit> => {
    const visit = await getVisitOrThrow(visitId);

    const isRequester =
        visit.requester.toString() === userId;

    const isOwner = visit.owner.toString() === userId;

    if (!isRequester && !isOwner) {
        throw new AppError(
            403,
            "You are not authorized to view this visit request"
        );
    }

    return visit;
};

// -----------------------------------------------------
// APPROVE VISIT
// -----------------------------------------------------

const approveVisit = async (
    ownerId: string,
    visitId: string,
    data: ApproveVisitInput
): Promise<IVisit> => {
    const visit = await getVisitOrThrow(visitId);

    ensureOwnerAccess(visit, ownerId);

    const allowedStatuses: VisitStatus[] = [
        "pending",
        "rescheduled",
    ];

    ensureStatus(visit, allowedStatuses, "approve");

    const scheduledDate = parseDate(data.scheduledDate);

    ensureDateTimeNotPast(
        scheduledDate,
        data.scheduledTime
    );

    const updatedVisit = await visitRepository.updateIfStatus(
        visitId,
        allowedStatuses,
        {
            status: "approved",
            scheduledDate,
            scheduledTime: data.scheduledTime,
        }
    );

    if (!updatedVisit) {
        throw updateConflict();
    }

    await notifyRequester(
        updatedVisit,
        "Visit request approved",
        `Your visit request has been approved for ${data.scheduledDate} at ${data.scheduledTime}.`
    );

    return updatedVisit;
};

// -----------------------------------------------------
// REJECT VISIT
// -----------------------------------------------------

const rejectVisit = async (
    ownerId: string,
    visitId: string,
    data: RejectVisitInput
): Promise<IVisit> => {
    const visit = await getVisitOrThrow(visitId);

    ensureOwnerAccess(visit, ownerId);

    const allowedStatuses: VisitStatus[] = [
        "pending",
        "rescheduled",
    ];

    ensureStatus(visit, allowedStatuses, "reject");

    const updatedVisit = await visitRepository.updateIfStatus(
        visitId,
        allowedStatuses,
        {
            status: "rejected",
            rejectionReason: data.rejectionReason,
        }
    );

    if (!updatedVisit) {
        throw updateConflict();
    }

    await notifyRequester(
        updatedVisit,
        "Visit request rejected",
        `Your visit request was rejected. Reason: ${data.rejectionReason}`
    );

    return updatedVisit;
};

// -----------------------------------------------------
// RESCHEDULE VISIT
// -----------------------------------------------------

const rescheduleVisit = async (
    ownerId: string,
    visitId: string,
    data: RescheduleVisitInput
): Promise<IVisit> => {
    const visit = await getVisitOrThrow(visitId);

    ensureOwnerAccess(visit, ownerId);

    const allowedStatuses: VisitStatus[] = [
        "pending",
        "approved",
        "rescheduled",
    ];

    ensureStatus(visit, allowedStatuses, "reschedule");

    const scheduledDate = parseDate(data.scheduledDate);

    ensureDateTimeNotPast(
        scheduledDate,
        data.scheduledTime
    );

    const updatedVisit = await visitRepository.updateIfStatus(
        visitId,
        allowedStatuses,
        {
            status: "rescheduled",
            scheduledDate,
            scheduledTime: data.scheduledTime,
            rescheduleReason: data.rescheduleReason,
        }
    );

    if (!updatedVisit) {
        throw updateConflict();
    }

    await notifyRequester(
        updatedVisit,
        "Visit rescheduled",
        `The owner suggested a new visit time: ${data.scheduledDate} at ${data.scheduledTime}. Reason: ${data.rescheduleReason}`
    );

    return updatedVisit;
};

// -----------------------------------------------------
// CANCEL VISIT
// -----------------------------------------------------

const cancelVisit = async (
    userId: string,
    visitId: string
): Promise<IVisit> => {
    const visit = await getVisitOrThrow(visitId);

    const isRequester =
        visit.requester.toString() === userId;

    const isOwner = visit.owner.toString() === userId;

    if (!isRequester && !isOwner) {
        throw new AppError(
            403,
            "You are not authorized to cancel this visit request"
        );
    }

    const allowedStatuses: VisitStatus[] = [
        "pending",
        "approved",
        "rescheduled",
    ];

    ensureStatus(visit, allowedStatuses, "cancel");

    const updatedVisit = await visitRepository.updateIfStatus(
        visitId,
        allowedStatuses,
        { status: "cancelled" }
    );

    if (!updatedVisit) {
        throw updateConflict();
    }

    if (isRequester) {
        await notifyOwner(
            updatedVisit,
            "Visit request cancelled",
            "The requester cancelled the visit request."
        );
    } else {
        await notifyRequester(
            updatedVisit,
            "Visit cancelled",
            "The property owner cancelled the visit."
        );
    }

    return updatedVisit;
};

// -----------------------------------------------------
// COMPLETE VISIT
// -----------------------------------------------------

const completeVisit = async (
    ownerId: string,
    visitId: string
): Promise<IVisit> => {
    const visit = await getVisitOrThrow(visitId);

    ensureOwnerAccess(visit, ownerId);

    const allowedStatuses: VisitStatus[] = ["approved"];

    ensureStatus(visit, allowedStatuses, "complete");

    const updatedVisit = await visitRepository.updateIfStatus(
        visitId,
        allowedStatuses,
        { status: "completed" }
    );

    if (!updatedVisit) {
        throw updateConflict();
    }

    await notifyRequester(
        updatedVisit,
        "Visit completed",
        "The property owner marked your visit as completed."
    );

    return updatedVisit;
};

// -----------------------------------------------------
// EXPORT
// -----------------------------------------------------

export default {
    createVisit,
    getMyVisits,
    getOwnerVisits,
    getAdminVisits,
    getVisitById,
    approveVisit,
    rejectVisit,
    rescheduleVisit,
    cancelVisit,
    completeVisit,
};
