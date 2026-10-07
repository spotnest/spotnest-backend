import { Rental, Payment } from "../dashboard/tenantDashboard/model.js";
import { RentalOccupant, RentalAgreement } from "./model.js";
import type { IRentalOccupant, IRentalAgreement } from "./type.js";

const findRentalById = (rentalId: string) =>
    Rental.findById(rentalId)
        .populate("property")
        .populate("owner", "name email phone")
        .populate("tenant", "name email phone");

const findRentalsByOwner = (ownerId: string) =>
    Rental.find({ owner: ownerId, status: { $ne: "cancelled" } })
        .populate("property")
        .populate("tenant", "name email phone")
        .sort({ created_at: -1 });

const findActiveOccupantForTenant = (tenantId: string) =>
    RentalOccupant.findOne({ tenant: tenantId, status: { $in: ["PENDING", "ACTIVE"] } })
        .populate("rental");

const findOccupantsByRental = (rentalId: string) =>
    RentalOccupant.find({ rental: rentalId, status: { $nin: ["TERMINATED"] } })
        .populate("tenant", "name email phone");

const findAgreementsByRental = (rentalId: string) =>
    RentalAgreement.find({ rental: rentalId, status: { $ne: "TERMINATED" } })
        .populate("tenant", "name email phone")
        .populate("occupant");

const findAgreementForTenant = (tenantId: string, agreementId?: string) => {
    if (agreementId) {
        return RentalAgreement.findOne({ _id: agreementId, tenant: tenantId })
            .populate("property")
            .populate("owner", "name email phone")
            .populate("occupant");
    }
    return RentalAgreement.findOne({ tenant: tenantId, status: { $ne: "TERMINATED" } })
        .sort({ created_at: -1 })
        .populate("property")
        .populate("owner", "name email phone")
        .populate("occupant");
};

const findAgreementById = (agreementId: string) =>
    RentalAgreement.findById(agreementId)
        .populate("property")
        .populate("tenant", "name email phone")
        .populate("owner", "name email phone")
        .populate("occupant");

const findPaymentsByOccupant = (occupantId: string) =>
    Payment.find({ occupant: occupantId }).sort({ dueDate: -1, created_at: -1 });

const findPaymentsByRental = (rentalId: string) =>
    Payment.find({ rental: rentalId }).sort({ dueDate: -1, created_at: -1 });

export default {
    findRentalById,
    findRentalsByOwner,
    findActiveOccupantForTenant,
    findOccupantsByRental,
    findAgreementsByRental,
    findAgreementForTenant,
    findAgreementById,
    findPaymentsByOccupant,
    findPaymentsByRental,
};
