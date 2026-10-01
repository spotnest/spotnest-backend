import { AppError } from "../../shared/errors/AppError.js";

import propertyRepository from "../properties/repository.js";
import notificationService from "../notifications/service.js";
import visitRepository from "./repository.js";

import type { IVisit } from "./type.js";
import type { CreateVisitInput } from "./validation.js";

const createVisit = async (
    requesterId: string,
    data: CreateVisitInput
): Promise<IVisit> => {
    /**
     * =========================
     * 1. FIND PROPERTY
     * =========================
     */

    const property = await propertyRepository.findById(
        data.propertyId
    );

    if (!property) {
        throw new AppError(404, "Property not found");
    }

    /**
     * =========================
     * 2. PROPERTY MUST BE ACTIVE
     * =========================
     */

    if (property.status !== "active") {
        throw new AppError(
            400,
            "This property is not currently available for visits"
        );
    }

    /**
     * =========================
     * 3. OWNER CANNOT VISIT
     *    THEIR OWN PROPERTY
     * =========================
     */

    const ownerId = property.owner.toString();

    if (ownerId === requesterId) {
        throw new AppError(
            400,
            "You cannot request a visit for your own property"
        );
    }

    /**
     * =========================
     * 4. VALIDATE REQUESTED DATE
     * =========================
     */

    const requestedDate = new Date(
        `${data.requestedDate}T00:00:00`
    );

    if (Number.isNaN(requestedDate.getTime())) {
        throw new AppError(
            400,
            "Invalid requested date"
        );
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    if (requestedDate < today) {
        throw new AppError(
            400,
            "Visit date cannot be in the past"
        );
    }

    /**
     * =========================
     * 5. CHECK DUPLICATE PENDING
     * =========================
     */

    const existingVisit =
        await visitRepository.findPendingByRequesterAndProperty(
            requesterId,
            data.propertyId
        );

    if (existingVisit) {
        throw new AppError(
            409,
            "You already have a pending visit request for this property"
        );
    }

    /**
     * =========================
     * 6. CREATE VISIT
     * =========================
     */

    const visit = await visitRepository.create({
        property: data.propertyId,
        requester: requesterId,
        owner: ownerId,
        requestedDate,
        requestedTime: data.requestedTime,
        ...(data.message
            ? { message: data.message }
            : {}),
    });

    /**
     * =========================
     * 7. NOTIFY PROPERTY OWNER
     * =========================
     */

    await notificationService.createNotification({
        recipient: ownerId,
        title: "New visit request",
        message: `Someone requested a visit for your property "${property.title}".`,
        type: "system",
        referenceId: visit._id.toString(),
        referenceType: "visit",
    });

    return visit;
};

export default {
    createVisit,
};