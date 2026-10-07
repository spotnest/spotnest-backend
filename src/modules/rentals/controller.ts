import type { Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import service from "./service.js";
import {
    acceptAgreementSchema,
    confirmAgreementSchema,
    setRentSplitSchema,
    terminateRentalSchema,
} from "./validation.js";

const getMyRental = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const rentalData = await service.getTenantRental(userId);
    res.json({ success: true, data: rentalData });
};

const getAgreement = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const agreementId = req.params.agreementId as string | undefined;
    const agreement = await service.getAgreementForTenant(userId, agreementId);
    res.json({ success: true, data: agreement });
};

const acceptAgreement = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const agreementId = req.params.agreementId as string;
    acceptAgreementSchema.parse(req.body);

    const agreement = await service.acceptAgreement(agreementId, userId);
    res.json({
        success: true,
        message: "Agreement accepted successfully",
        data: agreement,
    });
};

const confirmAgreement = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const agreementId = req.params.agreementId as string;
    confirmAgreementSchema.parse(req.body);

    const agreement = await service.confirmAgreement(agreementId, ownerId);
    res.json({
        success: true,
        message: "Agreement confirmed successfully",
        data: agreement,
    });
};

const getOwnerRentals = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const rentals = await service.getOwnerRentals(ownerId);
    res.json({ success: true, data: rentals });
};

const setRentSplit = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const rentalId = req.params.rentalId as string;
    const payload = setRentSplitSchema.parse(req.body);

    const result = await service.setRentSplit(rentalId, ownerId, payload);
    res.json({
        success: true,
        message: "Rent split updated successfully",
        data: result,
    });
};

const terminateRental = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const rentalId = req.params.rentalId as string;
    terminateRentalSchema.parse(req.body);

    const result = await service.terminateRental(rentalId, ownerId);
    res.json({
        success: true,
        message: result.message,
    });
};

export default {
    getMyRental,
    getAgreement,
    acceptAgreement,
    confirmAgreement,
    getOwnerRentals,
    setRentSplit,
    terminateRental,
};
