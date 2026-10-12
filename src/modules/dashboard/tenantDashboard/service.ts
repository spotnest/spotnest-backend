
import { AppError } from "../../../shared/errors/AppError.js";
import notificationService from "../../notifications/service.js";
import { emitDashboardUpdate } from "../../../shared/socket/index.js";
import repository from "./repository.js";
import type { IMaintenanceRequest, IPayment, IRental } from "./type.js";
import type { CreateMaintenanceInput } from "./validation.js";

type PopulatedRental = IRental & { property: { _id: { toString(): string }; title: string; propertyType: string; address: { street: string; city: string; state: string; zipCode: string; country: string }; images: { url: string }[]; bedrooms: number; bathrooms: number; areaSqFt?: number; amenities: string[] }; owner: { _id: { toString(): string }; name: string; email: string; phone?: string } };

const date = (value?: Date) => value?.toISOString();
const paymentResponse = (payment: IPayment) => ({ id: payment._id.toString(), type: payment.type, amount: payment.amount, status: payment.status.toLowerCase(), dueDate: date(payment.dueDate), paidAt: date(payment.paidAt), method: payment.method, referenceId: payment.referenceId, lateFee: payment.lateFee, lateFeeReason: payment.lateFeeReason, billingMonth: payment.billingMonth, createdAt: payment.created_at.toISOString() });
const maintenanceResponse = (request: IMaintenanceRequest) => ({ id: request._id.toString(), title: request.title, description: request.description, priority: request.priority, category: request.category, status: request.status, ownerResponse: request.ownerResponse, resolution: request.resolution, createdAt: request.created_at.toISOString(), updatedAt: request.updated_at.toISOString() });

const rentalResponse = (rental: PopulatedRental) => ({
    id: rental._id.toString(), bookingId: rental.booking?.toString() ?? "", status: rental.status, monthlyRent: rental.monthlyRent, securityDeposit: rental.securityDeposit, leaseStart: rental.leaseStart.toISOString(), leaseEnd: rental.leaseEnd.toISOString(), paymentFrequency: rental.paymentFrequency,
    property: { id: rental.property._id.toString(), title: rental.property.title, propertyType: rental.property.propertyType, address: rental.property.address, image: rental.property.images[0]?.url, bedrooms: rental.property.bedrooms, bathrooms: rental.property.bathrooms, areaSqFt: rental.property.areaSqFt, amenities: rental.property.amenities },
    owner: { id: rental.owner._id.toString(), name: rental.owner.name, email: rental.owner.email, phone: rental.owner.phone },
});

const getRentalOrNull = async (tenantId: string) => {
    await repository.activateDueRentals(tenantId);
    return repository.findActiveRental(tenantId) as Promise<PopulatedRental | null>;
};

const getRental = async (tenantId: string) => {
    const rental = await getRentalOrNull(tenantId);
    if (!rental) throw new AppError(404, "No active rental found");
    return rental;
};

const getPayments = async (tenantId: string) => {
    const rental = await getRentalOrNull(tenantId);
    if (!rental) return { rental: null, payments: [], summary: null };
    await (await import("../../payments/service.js")).default.ensureMonthlyRentPayments(rental._id.toString());
    const payments = await repository.findPayments(tenantId, rental._id.toString());
    const paid = payments.filter((payment) => payment.status.toUpperCase() === "PAID");
    const unpaid = payments.filter((payment) => payment.status.toUpperCase() !== "PAID");
    const recent = [...paid].sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))[0];
    const next = [...unpaid].sort((a, b) => (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER))[0];
    const fine = payments.reduce((total, payment) => total + payment.lateFee, 0);
    return { rental: rentalResponse(rental), payments: payments.map(paymentResponse), summary: { totalPaid: paid.reduce((total, payment) => total + payment.amount, 0), outstanding: unpaid.reduce((total, payment) => total + payment.amount + payment.lateFee, 0), fine, recentPayment: recent ? paymentResponse(recent) : null, nextPayment: next ? paymentResponse(next) : null, depositStatus: payments.some((payment) => (payment.type === "security_deposit" || payment.type === "ADVANCE") && payment.status.toUpperCase() === "PAID") ? "paid" : "unpaid" } };
};

const getDashboard = async (tenantId: string) => {
    const rental = await getRentalOrNull(tenantId);
    if (!rental) return { rental: null, payments: { payments: [], summary: null }, maintenance: [] };
    const [payments, maintenance] = await Promise.all([getPayments(tenantId), repository.findMaintenance(tenantId, rental._id.toString())]);
    return { rental: rentalResponse(rental), payments: { payments: payments.payments, summary: payments.summary }, maintenance: maintenance.slice(0, 5).map(maintenanceResponse) };
};

const getMaintenance = async (tenantId: string) => {
    const rental = await getRentalOrNull(tenantId);
    if (!rental) return { rental: null, requests: [] };
    const maintenanceModuleService = (await import("../../maintenance/service.js")).default;
    const result = await maintenanceModuleService.getTenantRequests(tenantId, { page: 1, limit: 100 });
    return {
        rental: rentalResponse(rental),
        requests: result.requests,
    };
};

const createMaintenance = async (tenantId: string, input: CreateMaintenanceInput) => {
    const maintenanceModuleService = (await import("../../maintenance/service.js")).default;
    const cat = (input.category as any) || "Other";
    const prio = (input.priority as any) || "Normal";
    return maintenanceModuleService.createRequest(tenantId, {
        title: input.title,
        description: input.description,
        category: cat,
        priority: prio,
    });
};

export default {
    getDashboard, getRental: async (tenantId: string) => {
        const rental = await getRentalOrNull(tenantId);
        return rental ? rentalResponse(rental) : null;
    },
    getPayments, getMaintenance, createMaintenance
};
