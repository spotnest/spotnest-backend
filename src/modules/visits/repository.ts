import Visit from "./model.js";
import type { IVisit, VisitStatus } from "./type.js";

export interface CreateVisitData {
    property: string;
    requester: string;
    owner: string;
    requestedDate: Date;
    requestedTime: string;
    message?: string;
}

const create = async (
    data: CreateVisitData
): Promise<IVisit> => {
    return Visit.create(data);
};

const findById = async (
    id: string
): Promise<IVisit | null> => {
    return Visit.findById(id);
};

const findPendingByRequesterAndProperty = async (
    requester: string,
    property: string
): Promise<IVisit | null> => {
    return Visit.findOne({
        requester,
        property,
        status: "pending",
    });
};

const findByRequester = async (
    requester: string
): Promise<IVisit[]> => {
    return Visit.find({ requester })
        .sort({ created_at: -1 });
};

const findByOwner = async (
    owner: string
): Promise<IVisit[]> => {
    return Visit.find({ owner })
        .sort({ created_at: -1 });
};

const findByProperty = async (
    property: string
): Promise<IVisit[]> => {
    return Visit.find({ property })
        .sort({ created_at: -1 });
};

const update = async (
    id: string,
    data: Partial<Pick<
        IVisit,
        | "status"
        | "scheduledDate"
        | "scheduledTime"
        | "rejectionReason"
        | "rescheduleReason"
    >>
): Promise<IVisit | null> => {
    return Visit.findByIdAndUpdate(
        id,
        { $set: data },
        {
            new: true,
            runValidators: true,
        }
    );
};

const findByOwnerAndStatus = async (
    owner: string,
    status: VisitStatus
): Promise<IVisit[]> => {
    return Visit.find({ owner, status })
        .sort({ created_at: -1 });
};

const findByRequesterAndStatus = async (
    requester: string,
    status: VisitStatus
): Promise<IVisit[]> => {
    return Visit.find({ requester, status })
        .sort({ created_at: -1 });
};

export default {
    create,
    findById,
    findPendingByRequesterAndProperty,
    findByRequester,
    findByOwner,
    findByProperty,
    update,
    findByOwnerAndStatus,
    findByRequesterAndStatus,
};