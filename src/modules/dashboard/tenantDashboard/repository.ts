import { MaintenanceRequest, Payment, Rental } from "./model.js";
import type { IMaintenanceRequest, IPayment, IRental } from "./type.js";

const findActiveRental = (tenant: string) =>
    Rental.findOne({ tenant, status: "active" })
        .populate("property")
        .populate("owner", "name email phone");
const findPayments = (tenant: string, rental: string) =>
    Payment.find({ tenant, rental })
        .sort({ dueDate: -1, created_at: -1 });
const activateDueRentals = async (tenant: string) => {
    const now = new Date();
    const dueRentals = await Rental.find({ tenant, status: "scheduled", leaseStart: { $lte: now } }).select("_id booking");
    if (dueRentals.length) {
        await Rental.updateMany({ _id: { $in: dueRentals.map((rental) => rental._id) } }, { $set: { status: "active" } });
        const bookingIds = dueRentals.flatMap((rental) => rental.booking ? [rental.booking] : []);
        if (bookingIds.length) {
            const Booking = (await import("../../bookings/model.js")).default;
            await Booking.updateMany({ _id: { $in: bookingIds }, status: "CONFIRMED" }, { $set: { status: "ACTIVE" } });
        }
    }
    const expired = await Rental.find({ tenant, status: { $in: ["active", "scheduled"] }, leaseEnd: { $lt: now } }).select("booking");
    if (expired.length) {
        await Rental.updateMany({ _id: { $in: expired.map((rental) => rental._id) } }, { $set: { status: "ended" } });
        const bookingIds = expired.flatMap((rental) => rental.booking ? [rental.booking] : []);
        if (bookingIds.length) {
            const Booking = (await import("../../bookings/model.js")).default;
            await Booking.updateMany({ _id: { $in: bookingIds }, status: { $in: ["CONFIRMED", "ACTIVE"] } }, { $set: { status: "COMPLETED" } });
        }
    }
};
const findMaintenance = (tenant: string, rental: string) =>
    MaintenanceRequest.find({ tenant, rental })
        .sort({ created_at: -1 });
const createMaintenance = (data: Pick<IMaintenanceRequest, "rental" | "property" | "tenant" | "owner" | "title" | "description" | "priority"> & Partial<Pick<IMaintenanceRequest, "category">>) =>
    MaintenanceRequest.create(data);

export default { findActiveRental, findPayments, findMaintenance, createMaintenance, activateDueRentals };
