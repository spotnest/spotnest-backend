export interface OwnerDashboardRecentRequest {
    id: string;
    propertyTitle: string;
    tenantName: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    createdAt: string;
}

export interface OwnerDashboardRecentPayment {
    id: string;
    type: string;
    status: string;
    amount: number;
    billingMonth?: string;
    dueDate?: string;
    paidAt?: string;
    propertyTitle: string;
    tenantName: string;
    updatedAt: string;
}

export interface OwnerDashboardResponse {
    properties: {
        total: number;
        active: number;
        inactive: number;
        archived: number;
    };
    requests: {
        /** Rental requests waiting for the owner's decision. */
        pending: number;
        /** Approved requests waiting for the tenant's advance payment. */
        awaitingAdvance: number;
    };
    rentals: {
        active: number;
        scheduled: number;
        /** Agreements the tenant accepted that the owner still has to confirm. */
        agreementsAwaitingConfirmation: number;
    };
    payments: {
        currency: "INR";
        /** Sum of all PAID payments (advance + rent). */
        totalReceived: number;
        /** Sum of PAID payments with paidAt in the current calendar month (UTC). */
        receivedThisMonth: number;
        /** Unpaid monthly rent (amount + late fees) that is already due or overdue. */
        outstandingRent: number;
        overdueCount: number;
    };
    recentRequests: OwnerDashboardRecentRequest[];
    recentPayments: OwnerDashboardRecentPayment[];
}
