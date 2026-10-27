import { Payment, Rental } from "./model.js";
// Maintenance is owned by the maintenance module; this module only reads it.
import { MaintenanceRequest } from "../../maintenance/model.js";
import type { IPayment, IRental } from "./type.js";

const findActiveRental = (tenant: string) => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return Rental.findOne({
        tenant,
        $or: [
            { status: "active" },
            { status: "ended", leaseEnd: { $gte: threeDaysAgo } },
        ],
    })
        .sort({ leaseEnd: -1, created_at: -1 })
        .populate("property")
        .populate("owner", "name email phone");
};
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
    // Only conclude the rental after 3 days past leaseEnd
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const expired = await Rental.find({ tenant, status: { $in: ["active", "scheduled"] }, leaseEnd: { $lt: threeDaysAgo } }).select("booking");
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
export default { findActiveRental, findPayments, findMaintenance, activateDueRentals };
