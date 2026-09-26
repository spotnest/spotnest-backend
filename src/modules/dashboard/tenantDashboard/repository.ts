import { MaintenanceRequest, Payment, Rental } from "./model.js";
import type { IMaintenanceRequest, IPayment, IRental } from "./type.js";

const findActiveRental = (tenant: string) =>
    Rental.findOne({ tenant, status: "active" })
        .populate("property")
        .populate("owner", "name email phone");
const findPayments = (tenant: string, rental: string) =>
    Payment.find({ tenant, rental })
        .sort({ dueDate: -1, created_at: -1 });
const findMaintenance = (tenant: string, rental: string) =>
    MaintenanceRequest.find({ tenant, rental })
        .sort({ created_at: -1 });
const createMaintenance = (data: Pick<IMaintenanceRequest, "rental" | "property" | "tenant" | "owner" | "title" | "description" | "priority"> & Partial<Pick<IMaintenanceRequest, "category">>) =>
    MaintenanceRequest.create(data);

export default { findActiveRental, findPayments, findMaintenance, createMaintenance };
