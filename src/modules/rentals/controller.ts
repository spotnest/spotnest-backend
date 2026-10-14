import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import service from "./service.js";
import {
    acceptAgreementSchema,
    confirmAgreementSchema,
    createManualAgreementSchema,
    setRentSplitSchema,
    terminateRentalSchema,
    updateAgreementSchema,
    updateOwnerRentalTermsSchema,
} from "./validation.js";

const getMyRental = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const bookingId = req.query.bookingId as string | undefined;
    const rentalData = await service.getTenantRental(userId, bookingId);
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

    // Allow an empty request body while preserving validation.
    acceptAgreementSchema.parse(req.body ?? {});

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

    // Owner confirmation does not require a request body.
    // Still validate the body if fields are supplied.
    confirmAgreementSchema.parse(req.body ?? {});

    const agreement = await service.confirmAgreement(
        agreementId,
        ownerId
    );

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

const getOwnerRentalTerms = async (
    req: AuthRequest,
    res: Response
) => {
    const result = await service.getOwnerRentalTerms(req.user!.id);

    res.json({
        success: true,
        data: result,
    });
};

const updateOwnerRentalTerms = async (
    req: AuthRequest,
    res: Response
) => {
    const payload = updateOwnerRentalTermsSchema.parse(req.body);

    const result = await service.updateOwnerRentalTerms(
        req.user!.id,
        payload.terms
    );

    res.json({
        success: true,
        message: "Rental terms saved successfully",
        data: result,
    });
};
const createManualAgreement = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const payload = createManualAgreementSchema.parse(req.body);
    const result = await service.createManualRentalAgreement(ownerId, payload);
    res.status(201).json({
        success: true,
        message: "Rental agreement created successfully",
        data: result,
    });
};

const listOwnerAgreements = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const agreements = await service.listOwnerAgreements(ownerId);
    res.json({ success: true, data: agreements });
};

const getOwnerAgreement = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const agreementId = req.params.agreementId as string;
    const agreement = await service.getOwnerAgreementById(agreementId, ownerId);
    res.json({ success: true, data: agreement });
};

const updateAgreement = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const agreementId = req.params.agreementId as string;
    const payload = updateAgreementSchema.parse(req.body);
    const agreement = await service.updateAgreement(agreementId, ownerId, payload);
    res.json({
        success: true,
        message: "Agreement updated successfully",
        data: agreement,
    });
};

const deleteOrCancelAgreement = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const agreementId = req.params.agreementId as string;
    const result = await service.deleteOrCancelAgreement(agreementId, ownerId);
    res.json({
        success: true,
        message: result.message,
        data: result,
    });
};

const resendAgreement = async (req: AuthRequest, res: Response) => {
    const ownerId = req.user!.id;
    const agreementId = req.params.agreementId as string;
    const result = await service.resendAgreementNotification(agreementId, ownerId);
    res.json({
        success: true,
        message: result.message,
        data: result,
    });
};

const lookupTenant = async (req: AuthRequest, res: Response) => {
    const email = req.query.email as string;
    if (!email) {
        res.json({ success: true, data: null });
        return;
    }
    const tenant = await service.lookupTenantByEmail(email);
    res.json({ success: true, data: tenant });
};

const getAdminRentals = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { page, limit, status } = req.query;
        const result = await service.getAdminRentals({
            ...(page ? { page: Number(page) } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
            ...(status ? { status: String(status) } : {}),
        });
        res.json({ success: true, data: result.rentals, pagination: result.pagination });
    } catch (err) {
        next(err);
    }
};

const adminTerminateRental = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const rentalId = req.params.rentalId as string;
        const reason = req.body?.reason as string | undefined;
        const result = await service.adminTerminateRental(rentalId, reason);
        res.json({ success: true, message: result.message });
    } catch (err) {
        next(err);
    }
};

export default {
    getMyRental,
    getAgreement,
    acceptAgreement,
    confirmAgreement,
    getOwnerRentals,
    setRentSplit,
    terminateRental,
    getOwnerRentalTerms,
    updateOwnerRentalTerms,
    createManualAgreement,
    listOwnerAgreements,
    getOwnerAgreement,
    updateAgreement,
    deleteOrCancelAgreement,
    resendAgreement,
    lookupTenant,
    getAdminRentals,
    adminTerminateRental,
};

