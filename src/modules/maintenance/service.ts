import mongoose from "mongoose";
import { AppError } from "../../shared/errors/AppError.js";
import { uploadImage } from "../../shared/utils/cloudinary.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import repository from "./repository.js";
import type { CreateMaintenanceInput, ListMaintenanceQuery, UpdateStatusInput } from "./validation.js";
import type { IMaintenanceImage, IMaintenanceRequest, MaintenanceRequestResponse, MaintenanceStatus } from "./type.js";
import { UserRole } from "../auth/type.js";

const dateToStr = (date?: Date) => (date ? date.toISOString() : undefined);

const toResponse = (req: IMaintenanceRequest): MaintenanceRequestResponse => {
    const prop = req.property as any;
    const ten = req.tenant as any;
    const own = req.owner as any;

    return {
        id: req._id.toString(),
        property: {
            id: prop?._id?.toString() ?? req.property?.toString() ?? "",
            title: prop?.title ?? "Property",
            ...(prop?.address ? { address: prop.address } : {}),
        },
        tenant: {
            id: ten?._id?.toString() ?? req.tenant?.toString() ?? "",
            name: ten?.name ?? "Tenant",
            email: ten?.email ?? "",
            ...(ten?.phone ? { phone: ten.phone } : {}),
        },
        owner: {
            id: own?._id?.toString() ?? req.owner?.toString() ?? "",
            name: own?.name ?? "Owner",
            email: own?.email ?? "",
            ...(own?.phone ? { phone: own.phone } : {}),
        },
        rentalId: req.rental?.toString() ?? "",
        title: req.title,
        description: req.description,
        category: req.category,
        priority: req.priority,
        images: req.images || [],
        status: req.status,
        ...(req.preferredVisitDate ? { preferredVisitDate: dateToStr(req.preferredVisitDate) } : {}),
        ...(req.scheduledDate ? { scheduledDate: dateToStr(req.scheduledDate) } : {}),
        ...(req.rejectionReason ? { rejectionReason: req.rejectionReason } : {}),
        ...(req.resolutionNote ? { resolutionNote: req.resolutionNote } : {}),
        ...(req.tenantNotes ? { tenantNotes: req.tenantNotes } : {}),
        statusHistory: (req.statusHistory || []).map((h) => {
            const actor = h.changedBy as any;
            return {
                ...(h.previousStatus ? { previousStatus: h.previousStatus } : {}),
                newStatus: h.newStatus,
                changedBy: {
                    id: actor?._id?.toString() ?? h.changedBy?.toString() ?? "",
                    ...(actor?.name ? { name: actor.name } : {}),
                    ...(actor?.role ? { role: actor.role } : {}),
                },
                ...(h.note ? { note: h.note } : {}),
                timestamp: h.timestamp ? h.timestamp.toISOString() : new Date().toISOString(),
            };
        }),
        createdAt: req.created_at ? req.created_at.toISOString() : new Date().toISOString(),
        updatedAt: req.updated_at ? req.updated_at.toISOString() : new Date().toISOString(),
    };
};

const getEligibleProperties = async (tenantId: string) => {
    const activeRentals = await repository.findActiveRentalsForTenant(tenantId);
    return activeRentals.map((rental: any) => ({
        rentalId: rental._id.toString(),
        property: {
            id: rental.property._id.toString(),
            title: rental.property.title,
            propertyType: rental.property.propertyType,
            address: rental.property.address,
            images: rental.property.images,
        },
        owner: {
            id: rental.owner._id.toString(),
            name: rental.owner.name,
        },
    }));
};

const createRequest = async (
    tenantId: string,
    input: CreateMaintenanceInput,
    files?: Express.Multer.File[]
): Promise<MaintenanceRequestResponse> => {
    const activeRental = await repository.findActiveRentalForTenantAndProperty(
        tenantId,
        input.propertyId
    );

    if (!activeRental) {
        throw new AppError(
            400,
            "No active rental relationship found for the specified property."
        );
    }

    const uploadedImages: IMaintenanceImage[] = [];
    if (files && files.length > 0) {
        for (const file of files) {
            const uploadResult = await uploadImage(file.buffer, "spotnest/maintenance");
            uploadedImages.push({
                publicId: uploadResult.publicId,
                url: uploadResult.url,
            });
        }
    }

    let prefDate: Date | undefined = undefined;
    if (input.preferredVisitDate) {
        prefDate = new Date(input.preferredVisitDate);
        if (isNaN(prefDate.getTime())) {
            throw new AppError(400, "Invalid preferred visit date format");
        }
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const createData: Partial<IMaintenanceRequest> = {
        rental: activeRental._id,
        property: (activeRental.property as any)._id,
        tenant: tenantObjectId,
        owner: (activeRental.owner as any)._id,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        images: uploadedImages,
        status: "PENDING",
        statusHistory: [
            {
                newStatus: "PENDING",
                changedBy: tenantObjectId,
                timestamp: new Date(),
                note: "Request submitted by tenant",
            },
        ],
    };

    if (prefDate) {
        createData.preferredVisitDate = prefDate;
    }
    if (input.tenantNotes) {
        createData.tenantNotes = input.tenantNotes;
    }

    const newRequest = await repository.createRequest(createData);

    const populated = await repository.findById(newRequest._id.toString());
    if (!populated) throw new AppError(500, "Failed to load created maintenance request");

    const ownerId = (activeRental.owner as any)._id.toString();

    const emergencyPrefix = input.priority === "Emergency" ? "[EMERGENCY] " : "";
    await notificationService.notify({
        recipient: ownerId,
        title: `${emergencyPrefix}New Maintenance Request: ${input.title}`,
        message: `${emergencyPrefix}Maintenance issue (${input.category}) reported for ${(activeRental.property as any).title}.`,
        type: "maintenance_created",
        referenceId: newRequest._id.toString(),
        referenceType: "maintenance",
        data: {
            maintenanceId: newRequest._id.toString(),
            propertyId: (activeRental.property as any)._id.toString(),
        },
        dedupeKey: `maint-created-${newRequest._id.toString()}`,
    });

    emitDashboardUpdate(
        { userIds: [ownerId, tenantId] },
        "maintenance",
        "created",
        newRequest._id.toString()
    );

    return toResponse(populated);
};

const getTenantRequests = async (tenantId: string, query: ListMaintenanceQuery) => {
    const { requests, total } = await repository.findTenantRequests(tenantId, query);
    return {
        requests: requests.map(toResponse),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
        },
    };
};

const getOwnerRequests = async (ownerId: string, query: ListMaintenanceQuery) => {
    const { requests, total } = await repository.findOwnerRequests(ownerId, query);
    return {
        requests: requests.map(toResponse),
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
        },
    };
};

const getOwnerSummary = async (ownerId: string) => {
    return repository.getOwnerSummary(ownerId);
};

const getRequestDetails = async (userId: string, role: string, requestId: string) => {
    const request = await repository.findById(requestId);
    if (!request) throw new AppError(404, "Maintenance request not found");

    const tenantId = (request.tenant as any)?._id?.toString() ?? request.tenant?.toString();
    const ownerId = (request.owner as any)?._id?.toString() ?? request.owner?.toString();

    if (role === UserRole.TENANT && tenantId !== userId) {
        throw new AppError(403, "Access denied to this maintenance request");
    }
    if (role === UserRole.OWNER && ownerId !== userId) {
        throw new AppError(403, "Access denied to this maintenance request");
    }

    return toResponse(request);
};

const updateStatus = async (
    userId: string,
    role: string,
    requestId: string,
    input: UpdateStatusInput
): Promise<MaintenanceRequestResponse> => {
    const request = await repository.findById(requestId);
    if (!request) throw new AppError(404, "Maintenance request not found");

    const tenantId = (request.tenant as any)?._id?.toString() ?? request.tenant?.toString();
    const ownerId = (request.owner as any)?._id?.toString() ?? request.owner?.toString();
    const currentStatus = request.status;
    const targetStatus = input.status;

    if (targetStatus === "CANCELLED") {
        if (role !== UserRole.TENANT && role !== UserRole.ADMIN) {
            throw new AppError(403, "Only the tenant can cancel a maintenance request.");
        }
        if (tenantId !== userId && role !== UserRole.ADMIN) {
            throw new AppError(403, "You can only cancel your own maintenance request.");
        }
        if (!["PENDING", "ACCEPTED", "SCHEDULED"].includes(currentStatus)) {
            throw new AppError(
                400,
                `Cannot cancel request when it is in ${currentStatus} status.`
            );
        }
    } else {
        if (role !== UserRole.OWNER && role !== UserRole.ADMIN) {
            throw new AppError(403, "Only the property owner can update request status.");
        }
        if (ownerId !== userId && role !== UserRole.ADMIN) {
            throw new AppError(403, "You can only manage requests for properties you own.");
        }

        switch (targetStatus) {
            case "ACCEPTED":
                if (currentStatus !== "PENDING") {
                    throw new AppError(
                        400,
                        `Invalid transition to ACCEPTED from ${currentStatus}.`
                    );
                }
                break;
            case "REJECTED":
                if (!["PENDING", "ACCEPTED", "SCHEDULED"].includes(currentStatus)) {
                    throw new AppError(
                        400,
                        `Cannot reject request when it is in ${currentStatus} status.`
                    );
                }
                if (!input.rejectionReason?.trim()) {
                    throw new AppError(400, "A rejection reason is required when rejecting a request.");
                }
                break;
            case "SCHEDULED":
                if (!["ACCEPTED", "SCHEDULED"].includes(currentStatus)) {
                    throw new AppError(
                        400,
                        `Invalid transition to SCHEDULED from ${currentStatus}.`
                    );
                }
                if (!input.scheduledDate) {
                    throw new AppError(400, "A scheduled date and time is required.");
                }
                break;
            case "IN_PROGRESS":
                if (!["ACCEPTED", "SCHEDULED"].includes(currentStatus)) {
                    throw new AppError(
                        400,
                        `Invalid transition to IN_PROGRESS from ${currentStatus}.`
                    );
                }
                break;
            case "COMPLETED":
                if (currentStatus !== "IN_PROGRESS") {
                    throw new AppError(
                        400,
                        `Cannot complete request unless it is IN_PROGRESS.`
                    );
                }
                break;
            default:
                throw new AppError(400, `Invalid target status: ${targetStatus}`);
        }
    }

    const updateFields: Partial<IMaintenanceRequest> = {
        status: targetStatus,
    };

    if (targetStatus === "REJECTED" && input.rejectionReason) {
        updateFields.rejectionReason = input.rejectionReason.trim();
    }
    if (targetStatus === "SCHEDULED" && input.scheduledDate) {
        const dateObj = new Date(input.scheduledDate);
        if (isNaN(dateObj.getTime())) {
            throw new AppError(400, "Invalid scheduled date format.");
        }
        updateFields.scheduledDate = dateObj;
    }
    if (targetStatus === "COMPLETED" && input.resolutionNote) {
        updateFields.resolutionNote = input.resolutionNote.trim();
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const historyNote = input.note || input.rejectionReason || input.resolutionNote || `Status changed to ${targetStatus}`;

    const updated = await repository.updateStatusAndFields(
        requestId,
        updateFields,
        {
            previousStatus: currentStatus,
            newStatus: targetStatus,
            changedBy: userObjectId,
            note: historyNote,
            timestamp: new Date(),
        }
    );

    if (!updated) throw new AppError(500, "Failed to update maintenance request status.");

    const propertyTitle = (updated.property as any)?.title ?? "Property";

    let notifTitle = "";
    let notifMessage = "";
    let notifRecipient = tenantId;
    let notifType: any = "maintenance_status";

    switch (targetStatus) {
        case "ACCEPTED":
            notifType = "maintenance_accepted";
            notifTitle = `Maintenance Request Accepted: ${updated.title}`;
            notifMessage = `Your owner accepted the maintenance request for ${propertyTitle}.`;
            break;
        case "REJECTED":
            notifType = "maintenance_rejected";
            notifTitle = `Maintenance Request Rejected: ${updated.title}`;
            notifMessage = `Your request was rejected. Reason: ${input.rejectionReason}`;
            break;
        case "SCHEDULED":
            notifType = currentStatus === "SCHEDULED" ? "maintenance_rescheduled" : "maintenance_scheduled";
            notifTitle = `Repair ${currentStatus === "SCHEDULED" ? "Rescheduled" : "Scheduled"}: ${updated.title}`;
            notifMessage = `Repair scheduled for ${new Date(input.scheduledDate!).toLocaleString()} at ${propertyTitle}.`;
            break;
        case "IN_PROGRESS":
            notifType = "maintenance_started";
            notifTitle = `Repair Started: ${updated.title}`;
            notifMessage = `Repair work has started for your issue at ${propertyTitle}.`;
            break;
        case "COMPLETED":
            notifType = "maintenance_completed";
            notifTitle = `Maintenance Completed: ${updated.title}`;
            notifMessage = `Repair marked completed for ${propertyTitle}.${input.resolutionNote ? ` Resolution: ${input.resolutionNote}` : ""}`;
            break;
        case "CANCELLED":
            notifType = "maintenance_cancelled";
            notifRecipient = ownerId;
            notifTitle = `Maintenance Request Cancelled: ${updated.title}`;
            notifMessage = `The tenant cancelled their maintenance request for ${propertyTitle}.`;
            break;
    }

    if (notifTitle && notifRecipient) {
        await notificationService.notify({
            recipient: notifRecipient,
            title: notifTitle,
            message: notifMessage,
            type: notifType,
            referenceId: requestId,
            referenceType: "maintenance",
            data: {
                maintenanceId: requestId,
                propertyId: (updated.property as any)?._id?.toString(),
            },
            dedupeKey: `maint-status-${requestId}-${targetStatus}-${Date.now()}`,
        });
    }

    emitDashboardUpdate(
        { userIds: [ownerId, tenantId] },
        "maintenance",
        "status_changed",
        requestId
    );

    return toResponse(updated);
};

export default {
    getEligibleProperties,
    createRequest,
    getTenantRequests,
    getOwnerRequests,
    getOwnerSummary,
    getRequestDetails,
    updateStatus,
};
