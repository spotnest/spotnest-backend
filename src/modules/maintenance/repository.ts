import mongoose from "mongoose";
import { MaintenanceRequest } from "./model.js";
import { Rental } from "../dashboard/tenantDashboard/model.js";
import type { IMaintenanceRequest, IMaintenanceStatusHistory, MaintenanceStatus } from "./type.js";
import type { ListMaintenanceQuery } from "./validation.js";

const findActiveRentalsForTenant = async (tenantId: string) => {
    return Rental.find({ tenant: tenantId, status: "active" })
        .populate("property", "title propertyType address images bedrooms bathrooms")
        .populate("owner", "name email phone");
};

const findActiveRentalForTenantAndProperty = async (tenantId: string, propertyId?: string) => {
    const filter: any = { tenant: tenantId, status: "active" };
    if (propertyId) {
        filter.property = propertyId;
    }
    return Rental.findOne(filter)
        .populate("property", "title propertyType address images bedrooms bathrooms")
        .populate("owner", "name email phone");
};

const createRequest = async (data: Partial<IMaintenanceRequest>): Promise<IMaintenanceRequest> => {
    return MaintenanceRequest.create(data);
};

const findById = async (id: string): Promise<IMaintenanceRequest | null> => {
    if (!mongoose.isValidObjectId(id)) return null;
    return MaintenanceRequest.findById(id)
        .populate("property", "title propertyType address images bedrooms bathrooms")
        .populate("tenant", "name email phone role")
        .populate("owner", "name email phone role")
        .populate("statusHistory.changedBy", "name role");
};

const buildFilter = (baseFilter: any, query: ListMaintenanceQuery) => {
    const filter: any = { ...baseFilter };

    if (query.status && query.status !== "ALL") {
        filter.status = query.status;
    }
    if (query.priority && query.priority !== "ALL") {
        filter.priority = query.priority;
    }
    if (query.category && query.category !== "ALL") {
        filter.category = query.category;
    }
    if (query.propertyId && query.propertyId !== "ALL") {
        filter.property = query.propertyId;
    }
    if (query.search?.trim()) {
        const regex = new RegExp(query.search.trim(), "i");
        filter.$or = [{ title: regex }, { description: regex }];
    }

    return filter;
};

const findTenantRequests = async (
    tenantId: string,
    query: ListMaintenanceQuery
): Promise<{ requests: IMaintenanceRequest[]; total: number }> => {
    const filter = buildFilter({ tenant: tenantId }, query);
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
        MaintenanceRequest.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .populate("property", "title propertyType address images")
            .populate("tenant", "name email phone")
            .populate("owner", "name email phone")
            .populate("statusHistory.changedBy", "name role"),
        MaintenanceRequest.countDocuments(filter),
    ]);

    return { requests, total };
};

const findOwnerRequests = async (
    ownerId: string,
    query: ListMaintenanceQuery
): Promise<{ requests: IMaintenanceRequest[]; total: number }> => {
    const filter = buildFilter({ owner: ownerId }, query);
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
        MaintenanceRequest.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .populate("property", "title propertyType address images")
            .populate("tenant", "name email phone")
            .populate("owner", "name email phone")
            .populate("statusHistory.changedBy", "name role"),
        MaintenanceRequest.countDocuments(filter),
    ]);

    return { requests, total };
};

const getOwnerSummary = async (ownerId: string) => {
    const ownerObjectId = new mongoose.Types.ObjectId(ownerId);
    const counts = await MaintenanceRequest.aggregate([
        { $match: { owner: ownerObjectId } },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
            },
        },
    ]);

    const result = {
        pending: 0,
        accepted: 0,
        scheduled: 0,
        inProgress: 0,
        completed: 0,
        rejected: 0,
        cancelled: 0,
        total: 0,
    };

    for (const item of counts) {
        const status = item._id as MaintenanceStatus;
        const count = item.count as number;
        result.total += count;

        switch (status) {
            case "PENDING":
                result.pending = count;
                break;
            case "ACCEPTED":
                result.accepted = count;
                break;
            case "SCHEDULED":
                result.scheduled = count;
                break;
            case "IN_PROGRESS":
                result.inProgress = count;
                break;
            case "COMPLETED":
                result.completed = count;
                break;
            case "REJECTED":
                result.rejected = count;
                break;
            case "CANCELLED":
                result.cancelled = count;
                break;
        }
    }

    return result;
};

const updateStatusAndFields = async (
    id: string,
    updateFields: Partial<IMaintenanceRequest>,
    historyEntry: IMaintenanceStatusHistory
): Promise<IMaintenanceRequest | null> => {
    return MaintenanceRequest.findByIdAndUpdate(
        id,
        {
            $set: updateFields,
            $push: { statusHistory: historyEntry },
        },
        { new: true }
    )
        .populate("property", "title propertyType address images")
        .populate("tenant", "name email phone")
        .populate("owner", "name email phone")
        .populate("statusHistory.changedBy", "name role");
};

export default {
    findActiveRentalsForTenant,
    findActiveRentalForTenantAndProperty,
    createRequest,
    findById,
    findTenantRequests,
    findOwnerRequests,
    getOwnerSummary,
    updateStatusAndFields,
};
