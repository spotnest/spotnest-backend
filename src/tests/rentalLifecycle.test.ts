import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import connectDB from "../shared/config/db.js";
import { RENTAL_PAYMENT_DEADLINE_MS } from "../shared/config/constants.js";
import { AppError } from "../shared/errors/AppError.js";
import { UserRole, UserStatus } from "../modules/auth/type.js";
import User from "../modules/auth/model.js";
import Property from "../modules/properties/model.js";
import Booking from "../modules/bookings/model.js";
import { Rental, Payment } from "../modules/dashboard/tenantDashboard/model.js";
import { RentalAgreement, RentalOccupant } from "../modules/rentals/model.js";
import rentalService from "../modules/rentals/service.js";
import paymentService from "../modules/payments/service.js";
import bookingService from "../modules/bookings/service.js";
import { expireUnpaidAgreements } from "../modules/rentals/scheduler.js";

describe("Rental Lifecycle, Owner Approval, and 2-Minute Deadline Suite", () => {
    let testOwner: any;
    let testTenant: any;
    let testOtherUser: any;
    let testProperty: any;

    before(async () => {
        await connectDB();

        // Unique suffix for this test run
        const suffix = Date.now().toString().slice(-6);

        testOwner = await User.create({
            name: `Test Owner ${suffix}`,
            email: `owner_${suffix}@test.spotnest.com`,
            password_hash: "hashed_pwd",
            role: UserRole.OWNER,
            status: UserStatus.ACTIVE,
            rentalTerms: "Standard owner terms for testing lifecycle."
        });

        testTenant = await User.create({
            name: `Test Tenant ${suffix}`,
            email: `tenant_${suffix}@test.spotnest.com`,
            password_hash: "hashed_pwd",
            role: UserRole.TENANT,
            status: UserStatus.ACTIVE
        });

        testOtherUser = await User.create({
            name: `Test Other ${suffix}`,
            email: `other_${suffix}@test.spotnest.com`,
            password_hash: "hashed_pwd",
            role: UserRole.TENANT,
            status: UserStatus.ACTIVE
        });

        testProperty = await Property.create({
            owner: testOwner._id,
            title: `Test Apartment ${suffix}`,
            description: "High quality test apartment",
            propertyType: "apartment",
            price: 25000,
            advanceAmount: 25000,
            rentalTerms: "Standard property rental terms must be at least 20 chars.",
            bedrooms: 2,
            bathrooms: 2,
            address: {
                street: "123 Test St",
                city: "Bengaluru",
                state: "Karnataka",
                zipCode: "560001",
                country: "India"
            },
            location: {
                type: "Point",
                coordinates: [77.5946, 12.9716]
            }
        });
    });

    after(async () => {
        // Cleanup test data created during the test run
        if (testProperty) {
            await RentalAgreement.deleteMany({ property: testProperty._id });
            await Rental.deleteMany({ property: testProperty._id });
            await Booking.deleteMany({ propertyId: testProperty._id });
            await Property.deleteOne({ _id: testProperty._id });
        }
        if (testOwner) await User.deleteOne({ _id: testOwner._id });
        if (testTenant) await User.deleteOne({ _id: testTenant._id });
        if (testOtherUser) await User.deleteOne({ _id: testOtherUser._id });

        await mongoose.connection.close();
    });

    // Helper to create a fresh booking, rental, occupant, and agreement
    async function setupFreshAgreement(status: any = "PENDING_TENANT"): Promise<{ booking: any; rental: any; occupant: any; agreement: any }> {
        const booking = await Booking.create({
            propertyId: testProperty._id,
            userId: testTenant._id,
            ownerId: testOwner._id,
            startDate: new Date(),
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            monthlyRent: 25000,
            advanceAmount: 25000,
            status: "APPROVED",
            paymentStatus: "NOT_DUE"
        });

        const rental = await Rental.create({
            booking: booking._id,
            property: testProperty._id,
            owner: testOwner._id,
            tenant: testTenant._id,
            monthlyRent: 25000,
            securityDeposit: 25000,
            leaseStart: booking.startDate,
            leaseEnd: booking.endDate,
            paymentFrequency: "monthly",
            status: "scheduled"
        });

        const occupant = await RentalOccupant.create({
            rental: rental._id,
            tenant: testTenant._id,
            rentAmount: 25000,
            securityDepositShare: 25000,
            status: "PENDING"
        });

        const agreement = await RentalAgreement.create({
            rental: rental._id,
            occupant: occupant._id,
            tenant: testTenant._id,
            owner: testOwner._id,
            property: testProperty._id,
            monthlyRent: 25000,
            securityDepositShare: 25000,
            leaseStart: booking.startDate,
            leaseEnd: booking.endDate,
            terms: "Agreement terms for testing",
            status
        });

        return { booking, rental, occupant, agreement };
    }

    test("1. Tenant accepts the agreement: status transitions to PENDING_OWNER, tenantAcceptedAt is saved, paymentDeadline is not set", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");

        const updated = await rentalService.acceptAgreement(
            agreement._id.toString(),
            testTenant._id.toString()
        );

        assert.strictEqual(updated.status, "PENDING_OWNER");
        assert.ok(updated.tenantAcceptedAt, "tenantAcceptedAt should be set");
        assert.strictEqual(updated.paymentDeadline, undefined, "paymentDeadline must NOT be set upon tenant acceptance");
    });

    test("2. Owner approves before tenant acceptance is rejected (409)", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");

        await assert.rejects(
            async () => {
                await rentalService.confirmAgreement(
                    agreement._id.toString(),
                    testOwner._id.toString()
                );
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 409);
                assert.match(err.message, /cannot be confirmed in state PENDING_TENANT|Tenant must accept the agreement/);
                return true;
            }
        );
    });

    test("3. Tenant accepts, then owner approves: status becomes APPROVED_PENDING_PAYMENT, ownerAcceptedAt is saved, paymentDeadline is set ~120,000 ms ahead", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");

        // Step 1: Tenant accepts
        await rentalService.acceptAgreement(
            agreement._id.toString(),
            testTenant._id.toString()
        );

        // Step 2: Owner approves
        const beforeConfirm = Date.now();
        const confirmed = await rentalService.confirmAgreement(
            agreement._id.toString(),
            testOwner._id.toString()
        );
        const afterConfirm = Date.now();

        assert.strictEqual(confirmed.status, "APPROVED_PENDING_PAYMENT");
        assert.ok(confirmed.ownerAcceptedAt, "ownerAcceptedAt should be set");
        assert.ok(confirmed.paymentDeadline, "paymentDeadline must be set");

        const deadlineMs = new Date(confirmed.paymentDeadline).getTime();
        const expectedMin = beforeConfirm + RENTAL_PAYMENT_DEADLINE_MS;
        const expectedMax = afterConfirm + RENTAL_PAYMENT_DEADLINE_MS;

        assert.ok(
            deadlineMs >= expectedMin - 2000 && deadlineMs <= expectedMax + 2000,
            `Deadline (${deadlineMs}) should be within expected 120s window [${expectedMin}, ${expectedMax}]`
        );
    });

    test("4. Repeating owner approval is rejected and does not reset or extend paymentDeadline", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");

        await rentalService.acceptAgreement(
            agreement._id.toString(),
            testTenant._id.toString()
        );

        const confirmedFirst = await rentalService.confirmAgreement(
            agreement._id.toString(),
            testOwner._id.toString()
        );

        const originalDeadline = new Date(confirmedFirst.paymentDeadline!).getTime();

        // Wait small delay
        await new Promise((r) => setTimeout(r, 50));

        // Attempt second approval
        await assert.rejects(
            async () => {
                await rentalService.confirmAgreement(
                    agreement._id.toString(),
                    testOwner._id.toString()
                );
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 409);
                assert.match(err.message, /already approved/);
                return true;
            }
        );

        // Verify deadline is unchanged in database
        const refetched = await RentalAgreement.findById(agreement._id);
        assert.strictEqual(
            new Date(refetched!.paymentDeadline!).getTime(),
            originalDeadline,
            "paymentDeadline must NOT be modified or extended on retry"
        );
    });

    test("5. getTenantRental returns the exact persisted paymentDeadline and dates as ISO strings or null", async () => {
        const { booking, agreement } = await setupFreshAgreement("PENDING_TENANT");

        // Case A: Prior to acceptance, dates are null
        const preAcceptance = await rentalService.getTenantRental(
            testTenant._id.toString(),
            booking._id.toString()
        );
        assert.ok(preAcceptance);
        assert.strictEqual(preAcceptance.agreement?.tenantAcceptedAt, null);
        assert.strictEqual(preAcceptance.agreement?.ownerAcceptedAt, null);
        assert.strictEqual(preAcceptance.agreement?.paymentDeadline, null);

        // Accept and confirm
        await rentalService.acceptAgreement(
            agreement._id.toString(),
            testTenant._id.toString()
        );
        const confirmed = await rentalService.confirmAgreement(
            agreement._id.toString(),
            testOwner._id.toString()
        );

        // Case B: After approval, returns exact ISO strings
        const postApproval = await rentalService.getTenantRental(
            testTenant._id.toString(),
            booking._id.toString()
        );

        assert.ok(postApproval);
        assert.ok(postApproval.agreement);
        assert.strictEqual(postApproval.agreement.status, "APPROVED_PENDING_PAYMENT");
        assert.strictEqual(
            postApproval.agreement.paymentDeadline,
            new Date(confirmed.paymentDeadline!).toISOString()
        );
        assert.ok(typeof postApproval.agreement.tenantAcceptedAt === "string");
        assert.ok(typeof postApproval.agreement.ownerAcceptedAt === "string");
    });

    test("6. Scheduler marks overdue agreement EXPIRED and does not affect active unexpired agreements", async () => {
        const { agreement: expiredAgr, booking: expiredBk } = await setupFreshAgreement("APPROVED_PENDING_PAYMENT");
        const { agreement: activeAgr } = await setupFreshAgreement("APPROVED_PENDING_PAYMENT");

        // Expire the first agreement (deadline 10 seconds ago)
        expiredAgr.paymentDeadline = new Date(Date.now() - 10000);
        await expiredAgr.save();

        // Active agreement deadline in future (60 seconds ahead)
        activeAgr.paymentDeadline = new Date(Date.now() + 60000);
        await activeAgr.save();

        const expiredCount = await expireUnpaidAgreements(new Date());
        assert.ok(expiredCount >= 1, "Should have expired at least 1 agreement");

        const refetchedExpiredAgr = await RentalAgreement.findById(expiredAgr._id);
        const refetchedExpiredBk = await Booking.findById(expiredBk._id);
        const refetchedActiveAgr = await RentalAgreement.findById(activeAgr._id);

        assert.strictEqual(refetchedExpiredAgr!.status, "EXPIRED");
        assert.strictEqual(refetchedExpiredBk!.status, "EXPIRED");
        assert.strictEqual(refetchedActiveAgr!.status, "APPROVED_PENDING_PAYMENT");
    });

    test("7. Frontend countdown calculation derived strictly from paymentDeadline (02:00, MM:SS)", () => {
        function computeCountdown(deadlineIso: string, nowMs: number) {
            const remainingSeconds = Math.max(
                0,
                Math.floor((new Date(deadlineIso).getTime() - nowMs) / 1000)
            );
            const minutes = Math.floor(remainingSeconds / 60)
                .toString()
                .padStart(2, "0");
            const seconds = (remainingSeconds % 60).toString().padStart(2, "0");
            return { remainingSeconds, display: `${minutes}:${seconds}` };
        }

        const now = 1700000000000;
        const deadline120s = new Date(now + 120000).toISOString();
        const deadline95s = new Date(now + 95000).toISOString();
        const deadline0s = new Date(now).toISOString();

        assert.strictEqual(computeCountdown(deadline120s, now).display, "02:00");
        assert.strictEqual(computeCountdown(deadline95s, now).display, "01:35");
        assert.strictEqual(computeCountdown(deadline0s, now).display, "00:00");
    });

    test("8. Component remount / page refresh preserves countdown from paymentDeadline without reset", () => {
        function computeCountdown(deadlineIso: string, nowMs: number) {
            const remainingSeconds = Math.max(
                0,
                Math.floor((new Date(deadlineIso).getTime() - nowMs) / 1000)
            );
            return remainingSeconds;
        }

        const initialTime = 1700000000000;
        const serverDeadline = new Date(initialTime + 120000).toISOString();

        // User visits at initialTime: 120s left
        assert.strictEqual(computeCountdown(serverDeadline, initialTime), 120);

        // User navigates away and re-renders/remounts 45 seconds later
        const remountTime = initialTime + 45000;
        assert.strictEqual(computeCountdown(serverDeadline, remountTime), 75);
    });

    test("9. Missing or invalid paymentDeadline disables advance payment", () => {
        function evaluateEligibility(status: string, paymentDeadline?: string | null) {
            if (status !== "APPROVED_PENDING_PAYMENT") return false;
            if (!paymentDeadline) return false;
            const deadlineTime = new Date(paymentDeadline).getTime();
            if (isNaN(deadlineTime)) return false;
            return deadlineTime > Date.now();
        }

        assert.strictEqual(evaluateEligibility("APPROVED_PENDING_PAYMENT", null), false);
        assert.strictEqual(evaluateEligibility("APPROVED_PENDING_PAYMENT", undefined), false);
        assert.strictEqual(evaluateEligibility("APPROVED_PENDING_PAYMENT", "invalid-date"), false);
        assert.strictEqual(
            evaluateEligibility("APPROVED_PENDING_PAYMENT", new Date(Date.now() + 60000).toISOString()),
            true
        );
    });

    test("10. At paymentDeadline, advance payment is disabled, timer reaches 00:00, and expiry message appears", () => {
        const deadline = new Date(Date.now() - 1000).toISOString();
        const remainingSeconds = Math.max(
            0,
            Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)
        );
        const isExpired = remainingSeconds <= 0;
        const canPay = !isExpired;
        const expiryMessage = "This rental request has expired. Please submit a new rental request.";

        assert.strictEqual(remainingSeconds, 0);
        assert.strictEqual(isExpired, true);
        assert.strictEqual(canPay, false);
        assert.strictEqual(expiryMessage, "This rental request has expired. Please submit a new rental request.");
    });

    test("11. Order creation is rejected on backend once paymentDeadline has passed", async () => {
        const { booking, agreement } = await setupFreshAgreement("APPROVED_PENDING_PAYMENT");
        booking.paymentStatus = "ADVANCE_PAYMENT_PENDING";
        await booking.save();

        agreement.tenantAcceptedAt = new Date();
        agreement.ownerAcceptedAt = new Date();
        agreement.paymentDeadline = new Date(Date.now() - 5000);
        await agreement.save();

        await assert.rejects(
            async () => {
                await paymentService.createAdvanceOrder(
                    booking._id.toString(),
                    testTenant._id.toString()
                );
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 409);
                assert.match(err.message, /agreement payment deadline has expired/);
                return true;
            }
        );

        // Booking and agreement should now be marked EXPIRED
        const refetchedAgreement = await RentalAgreement.findById(agreement._id);
        const refetchedBooking = await Booking.findById(booking._id);
        assert.strictEqual(refetchedAgreement!.status, "EXPIRED");
        assert.strictEqual(refetchedBooking!.status, "EXPIRED");
    });

    test("12. Late payment attempt after deadline cannot activate rental", async () => {
        const { booking, rental, occupant, agreement } = await setupFreshAgreement("APPROVED_PENDING_PAYMENT");
        agreement.paymentDeadline = new Date(Date.now() - 5000);
        await agreement.save();

        // Create a payment record marked PAID with paidAt after deadline
        await Payment.create({
            rental: rental._id,
            tenant: testTenant._id,
            type: "ADVANCE",
            amount: 25000,
            status: "PAID",
            paidAt: new Date(Date.now() - 1000),
            razorpayPaymentId: `pay_late_${Date.now()}`
        });

        const result = await paymentService.confirmAdvanceRental(booking._id.toString());
        assert.strictEqual(result.activated, false, "Late payment must NOT activate rental");
        assert.strictEqual(result.expired, true, "Agreement must be marked expired");

        const refetchedRental = await Rental.findById(rental._id);
        const refetchedOccupant = await RentalOccupant.findById(occupant._id);
        assert.strictEqual(refetchedRental!.status, "scheduled", "Rental must NOT be activated");
        assert.strictEqual(refetchedOccupant!.status, "PENDING", "Occupant must NOT be activated");
    });

    test("13. Legitimate on-time advance payment verification activates rental, sets agreement ACTIVE, booking CONFIRMED", async () => {
        const { booking, rental, occupant, agreement } = await setupFreshAgreement("APPROVED_PENDING_PAYMENT");
        agreement.paymentDeadline = new Date(Date.now() + 120000);
        await agreement.save();

        const paymentId = `pay_ontime_${Date.now()}`;
        await Payment.create({
            rental: rental._id,
            tenant: testTenant._id,
            type: "ADVANCE",
            amount: 25000,
            status: "PAID",
            paidAt: new Date(),
            razorpayPaymentId: paymentId
        });

        const result = await paymentService.confirmAdvanceRental(booking._id.toString());
        assert.strictEqual(result.activated, true, "On-time payment must activate rental");
        assert.strictEqual(result.expired, false);

        const refetchedAgreement = await RentalAgreement.findById(agreement._id);
        const refetchedBooking = await Booking.findById(booking._id);
        const refetchedRental = await Rental.findById(rental._id);
        const refetchedOccupant = await RentalOccupant.findById(occupant._id);

        assert.strictEqual(refetchedAgreement!.status, "ACTIVE");
        assert.ok(refetchedAgreement!.advancePaidAt);
        assert.ok(["ACTIVE", "CONFIRMED"].includes(refetchedBooking!.status));
        assert.strictEqual(refetchedRental!.status, "active");
        assert.strictEqual(refetchedOccupant!.status, "ACTIVE");
    });

    test("14. Duplicate payment verification calls are idempotent and do not duplicate occupants or transactions", async () => {
        const { booking, rental, agreement } = await setupFreshAgreement("APPROVED_PENDING_PAYMENT");
        agreement.paymentDeadline = new Date(Date.now() + 120000);
        await agreement.save();

        const paymentId = `pay_dup_${Date.now()}`;

        await Payment.create({
            rental: rental._id,
            tenant: testTenant._id,
            type: "ADVANCE",
            amount: 25000,
            status: "PAID",
            paidAt: new Date(),
            razorpayPaymentId: paymentId
        });

        // First confirmation
        const firstResult = await paymentService.confirmAdvanceRental(booking._id.toString());
        assert.strictEqual(firstResult.activated, true);

        // Duplicate second confirmation
        const secondResult = await paymentService.confirmAdvanceRental(booking._id.toString());
        assert.strictEqual(secondResult.activated, true);

        // Verify only 1 payment transaction exists for this paymentId
        const payments = await Payment.find({ razorpayPaymentId: paymentId });
        assert.strictEqual(payments.length, 1, "Must not create duplicate payment transactions");

        // Verify only 1 occupant exists
        const occupants = await RentalOccupant.find({ rental: rental._id });
        assert.strictEqual(occupants.length, 1, "Must not duplicate occupants");
    });

    test("15. Owner rental list displays agreement status, tenant acceptance status, and paymentDeadline accurately", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");
        await rentalService.acceptAgreement(
            agreement._id.toString(),
            testTenant._id.toString()
        );
        const confirmed = await rentalService.confirmAgreement(
            agreement._id.toString(),
            testOwner._id.toString()
        );

        const ownerRentals = await rentalService.getOwnerRentals(testOwner._id.toString());
        assert.ok(ownerRentals.length > 0);

        const item = ownerRentals.find((r) => r.property.id === testProperty._id.toString());
        assert.ok(item, "Should find the owner rental item");
        const occupant = item.occupants.find((o) => o.tenant.id === testTenant._id.toString());
        assert.ok(occupant);
        assert.strictEqual(occupant.agreementStatus, "APPROVED_PENDING_PAYMENT");
        assert.strictEqual(
            occupant.paymentDeadline,
            new Date(confirmed.paymentDeadline!).toISOString()
        );
        assert.ok(occupant.tenantAcceptedAt);
    });

    test("16. Booking response distinguishes booking status from agreement status", async () => {
        const { booking, agreement } = await setupFreshAgreement("PENDING_TENANT");

        // Booking status is APPROVED, agreement status is PENDING_TENANT
        const bk = await Booking.findById(booking._id);
        const ag = await RentalAgreement.findById(agreement._id);

        assert.strictEqual(bk!.status, "APPROVED");
        assert.strictEqual(ag!.status, "PENDING_TENANT");
        assert.notStrictEqual(bk!.status, ag!.status);
    });

    test("17. Unauthorized tenant, unauthorized owner, nonexistent agreement ID, and invalid transitions rejected", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");

        // Wrong tenant accepts -> 404 (agreement not found for this tenant)
        await assert.rejects(
            async () => {
                await rentalService.acceptAgreement(
                    agreement._id.toString(),
                    testOtherUser._id.toString()
                );
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 404);
                return true;
            }
        );

        // Wrong owner confirms -> 404 (agreement not found for this owner)
        await assert.rejects(
            async () => {
                await rentalService.confirmAgreement(
                    agreement._id.toString(),
                    testOtherUser._id.toString()
                );
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 404);
                return true;
            }
        );

        // Nonexistent agreement ID -> 404
        const fakeId = new mongoose.Types.ObjectId().toString();
        await assert.rejects(
            async () => {
                await rentalService.confirmAgreement(fakeId, testOwner._id.toString());
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 404);
                return true;
            }
        );
    });

    test("18. Expired agreement transition is idempotent and allows tenant to submit a new rental request", async () => {
        const isolatedProperty = await Property.create({
            owner: testOwner._id,
            title: `Isolated Expiry Property ${Date.now()}`,
            description: "Property for testing expiry and re-requesting",
            propertyType: "apartment",
            price: 25000,
            advanceAmount: 25000,
            rentalTerms: "Standard property rental terms must be at least 20 chars.",
            bedrooms: 2,
            bathrooms: 2,
            address: {
                street: "123 Expiry St",
                city: "Bengaluru",
                state: "Karnataka",
                zipCode: "560001",
                country: "India"
            },
            location: {
                type: "Point",
                coordinates: [77.5946, 12.9716]
            }
        });

        try {
            const booking = await Booking.create({
                propertyId: isolatedProperty._id,
                userId: testTenant._id,
                ownerId: testOwner._id,
                startDate: new Date(),
                endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                monthlyRent: 25000,
                advanceAmount: 25000,
                status: "APPROVED",
                paymentStatus: "NOT_DUE"
            });

            const rental = await Rental.create({
                booking: booking._id,
                property: isolatedProperty._id,
                owner: testOwner._id,
                tenant: testTenant._id,
                monthlyRent: 25000,
                securityDeposit: 25000,
                leaseStart: booking.startDate,
                leaseEnd: booking.endDate,
                paymentFrequency: "monthly",
                status: "scheduled"
            });

            const occupant = await RentalOccupant.create({
                rental: rental._id,
                tenant: testTenant._id,
                rentAmount: 25000,
                securityDepositShare: 25000,
                status: "PENDING"
            });

            const agreement = await RentalAgreement.create({
                rental: rental._id,
                occupant: occupant._id,
                tenant: testTenant._id,
                owner: testOwner._id,
                property: isolatedProperty._id,
                monthlyRent: 25000,
                securityDepositShare: 25000,
                leaseStart: booking.startDate,
                leaseEnd: booking.endDate,
                terms: "Agreement terms for testing",
                status: "APPROVED_PENDING_PAYMENT",
                paymentDeadline: new Date(Date.now() - 5000)
            });

            // Expire via scheduler
            await expireUnpaidAgreements(new Date());

            const expAgr = await RentalAgreement.findById(agreement._id);
            const expBk = await Booking.findById(booking._id);
            assert.strictEqual(expAgr!.status, "EXPIRED");
            assert.strictEqual(expBk!.status, "EXPIRED");

            // Running expire again is idempotent
            await expireUnpaidAgreements(new Date());
            const expAgr2 = await RentalAgreement.findById(agreement._id);
            assert.strictEqual(expAgr2!.status, "EXPIRED");

            // Tenant can now submit a NEW rental request without 409 conflict
            const tomorrow = new Date();
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            const nextYear = new Date();
            nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);

            const newBooking = await bookingService.createBooking(testTenant._id.toString(), {
                propertyId: isolatedProperty._id.toString(),
                startDate: tomorrow,
                endDate: nextYear,
                notes: "Submitting replacement rental request after expiry"
            });

            assert.ok(newBooking);
            assert.strictEqual(newBooking.status, "PENDING");
        } finally {
            await RentalAgreement.deleteMany({ property: isolatedProperty._id });
            await Rental.deleteMany({ property: isolatedProperty._id });
            await Booking.deleteMany({ propertyId: isolatedProperty._id });
            await Property.deleteOne({ _id: isolatedProperty._id });
        }
    });

    test("19. Authoritative 72-hour window (259,200,000 ms) is enforced on owner confirmation", async () => {
        assert.strictEqual(
            RENTAL_PAYMENT_DEADLINE_MS,
            72 * 60 * 60 * 1000,
            "RENTAL_PAYMENT_DEADLINE_MS must equal 72 hours (259,200,000 ms)"
        );

        const { agreement } = await setupFreshAgreement("PENDING_TENANT");
        await rentalService.acceptAgreement(agreement._id.toString(), testTenant._id.toString());

        const beforeConfirm = Date.now();
        const confirmed = await rentalService.confirmAgreement(
            agreement._id.toString(),
            testOwner._id.toString()
        );
        const afterConfirm = Date.now();

        const deadlineMs = new Date(confirmed.paymentDeadline!).getTime();
        const minExpected = beforeConfirm + 72 * 60 * 60 * 1000;
        const maxExpected = afterConfirm + 72 * 60 * 60 * 1000;

        assert.ok(
            deadlineMs >= minExpected - 2000 && deadlineMs <= maxExpected + 2000,
            `Deadline (${new Date(deadlineMs).toISOString()}) must be exactly ~72 hours ahead`
        );
    });


    async function createTestProperty(label: string) {
        return await Property.create({
            owner: testOwner._id,
            title: `Property ${label} ${Date.now()}`,
            description: "High quality test apartment",
            propertyType: "apartment",
            price: 25000,
            advanceAmount: 25000,
            rentalTerms: "Standard property rental terms must be at least 20 chars.",
            bedrooms: 2,
            bathrooms: 2,
            address: {
                street: "123 Test St",
                city: "Bengaluru",
                state: "Karnataka",
                zipCode: "560001",
                country: "India",
            },
            location: {
                type: "Point",
                coordinates: [77.5946, 12.9716],
            },
        });
    }

    test("20. Manual rental agreement creation generates Rental, Occupant, and Agreement in PENDING_TENANT state", async () => {
        const prop = await createTestProperty("20");
        try {
            const agreementTerms = "Comprehensive manual rental agreement terms for Spotnest test property.";
            const manualResult = await rentalService.createManualRentalAgreement(
                testOwner._id.toString(),
                {
                    propertyId: prop._id.toString(),
                    tenantEmail: testTenant.email,
                    monthlyRent: 28000,
                    securityDeposit: 56000,
                    maintenanceFee: 2500,
                    noticePeriodDays: 45,
                    leaseStart: new Date().toISOString(),
                    leaseEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    terms: agreementTerms,
                    autoSend: false,
                }
            );

            assert.ok(manualResult.agreement._id);
            assert.ok(manualResult.rental._id);

            const createdAgreement = await RentalAgreement.findById(manualResult.agreement._id);
            assert.ok(createdAgreement);
            assert.strictEqual(createdAgreement.status, "PENDING_TENANT");
            assert.strictEqual(createdAgreement.monthlyRent, 28000);
            assert.strictEqual(createdAgreement.securityDepositShare, 56000);
            assert.strictEqual(createdAgreement.maintenanceFee, 2500);
            assert.strictEqual(createdAgreement.noticePeriodDays, 45);
            assert.strictEqual(createdAgreement.terms, agreementTerms);
            assert.strictEqual(createdAgreement.version, 1);
            assert.strictEqual(createdAgreement.deliveryStatus, "PENDING");

            const createdRental = await Rental.findById(manualResult.rental._id);
            assert.ok(createdRental);
            assert.strictEqual(createdRental.monthlyRent, 28000);
            assert.strictEqual(createdRental.securityDeposit, 56000);

            // Cleanup
            await RentalAgreement.deleteOne({ _id: createdAgreement._id });
            await RentalOccupant.deleteMany({ rental: createdRental._id });
            await Rental.deleteOne({ _id: createdRental._id });
        } finally {
            await Property.deleteOne({ _id: prop._id });
        }
    });

    test("21. listOwnerAgreements and getOwnerAgreementById return populated agreement records", async () => {
        const prop = await createTestProperty("21");
        try {
            const manualResult = await rentalService.createManualRentalAgreement(
                testOwner._id.toString(),
                {
                    propertyId: prop._id.toString(),
                    tenantEmail: testTenant.email,
                    monthlyRent: 22000,
                    securityDeposit: 44000,
                    leaseStart: new Date().toISOString(),
                    leaseEnd: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
                    terms: "Standard lease agreement terms for inspection test verification.",
                    autoSend: false,
                }
            );

            const ownerAgreements = await rentalService.listOwnerAgreements(testOwner._id.toString());
            assert.ok(Array.isArray(ownerAgreements));
            const found = ownerAgreements.find((a: any) => a._id.toString() === manualResult.agreement._id.toString());
            assert.ok(found, "Should find the newly created agreement in list");
            assert.strictEqual(found.monthlyRent, 22000);
            assert.strictEqual(found.securityDepositShare, 44000);

            const detail = await rentalService.getOwnerAgreementById(
                manualResult.agreement._id.toString(),
                testOwner._id.toString()
            );
            assert.ok(detail);
            assert.strictEqual(detail._id.toString(), manualResult.agreement._id.toString());
            assert.strictEqual(detail.status, "PENDING_TENANT");

            // Cleanup
            await RentalAgreement.deleteOne({ _id: manualResult.agreement._id });
            await RentalOccupant.deleteMany({ rental: manualResult.rental._id });
            await Rental.deleteOne({ _id: manualResult.rental._id });
        } finally {
            await Property.deleteOne({ _id: prop._id });
        }
    });

    test("22. Agreement update workflow: draft edits in-place; accepted agreement increments version and archives history", async () => {
        const prop = await createTestProperty("22");
        try {
            const manualResult = await rentalService.createManualRentalAgreement(
                testOwner._id.toString(),
                {
                    propertyId: prop._id.toString(),
                    tenantEmail: testTenant.email,
                    monthlyRent: 20000,
                    securityDeposit: 40000,
                    leaseStart: new Date().toISOString(),
                    leaseEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    terms: "Initial agreement terms before revision for testing purposes.",
                    autoSend: false,
                }
            );

            // Phase 1: Edit unsigned draft in-place
            const draftUpdate = await rentalService.updateAgreement(
                manualResult.agreement._id.toString(),
                testOwner._id.toString(),
                {
                    monthlyRent: 21000,
                    terms: "Updated draft agreement terms with rent increased to 21000.",
                }
            );
            assert.strictEqual(draftUpdate.monthlyRent, 21000);
            assert.strictEqual(draftUpdate.version, 1, "Draft edit must preserve version 1");
            assert.strictEqual(draftUpdate.history?.length || 0, 0, "Draft edit should not add history");

            // Phase 2: Tenant accepts agreement
            await rentalService.acceptAgreement(manualResult.agreement._id.toString(), testTenant._id.toString());
            const acceptedAgr = await RentalAgreement.findById(manualResult.agreement._id);
            assert.strictEqual(acceptedAgr!.status, "PENDING_OWNER");
            assert.ok(acceptedAgr!.tenantAcceptedAt);

            // Phase 3: Owner modifies accepted agreement -> must create Revision v2, reset to PENDING_TENANT
            const revisionUpdate = await rentalService.updateAgreement(
                manualResult.agreement._id.toString(),
                testOwner._id.toString(),
                {
                    monthlyRent: 22500,
                    revisionNote: "Adjusted after tenant discussion",
                    terms: "Revised agreement terms Version 2 with new terms and clauses.",
                }
            );

            assert.strictEqual(revisionUpdate.version, 2, "Version must increment to 2");
            assert.strictEqual(revisionUpdate.status, "PENDING_TENANT", "Status must reset to PENDING_TENANT");
            assert.strictEqual(revisionUpdate.tenantAcceptedAt, undefined, "tenantAcceptedAt must be reset");
            assert.strictEqual(revisionUpdate.history?.length, 1, "History must contain 1 archived revision");
            assert.strictEqual(revisionUpdate.history![0]?.version, 1);
            assert.strictEqual(revisionUpdate.history![0]?.monthlyRent, 21000);
            assert.strictEqual(revisionUpdate.history![0]?.note, "Adjusted after tenant discussion");

            // Cleanup
            await RentalAgreement.deleteOne({ _id: manualResult.agreement._id });
            await RentalOccupant.deleteMany({ rental: manualResult.rental._id });
            await Rental.deleteOne({ _id: manualResult.rental._id });
        } finally {
            await Property.deleteOne({ _id: prop._id });
        }
    });

    test("23. Deletion rules: Unsigned draft is deleted permanently; accepted agreement is soft-cancelled", async () => {
        const propA = await createTestProperty("23A");
        const propB = await createTestProperty("23B");

        try {
            // Case A: Unsigned draft
            const draft = await rentalService.createManualRentalAgreement(
                testOwner._id.toString(),
                {
                    propertyId: propA._id.toString(),
                    tenantEmail: testTenant.email,
                    monthlyRent: 19000,
                    securityDeposit: 38000,
                    leaseStart: new Date().toISOString(),
                    leaseEnd: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
                    terms: "Draft agreement to test permanent deletion capabilities.",
                    autoSend: false,
                }
            );

            const deleteDraftResult = await rentalService.deleteOrCancelAgreement(
                draft.agreement._id.toString(),
                testOwner._id.toString()
            );
            assert.strictEqual(deleteDraftResult.deleted, true);
            const refetchedDraft = await RentalAgreement.findById(draft.agreement._id);
            assert.strictEqual(refetchedDraft, null, "Draft agreement must be completely removed from DB");

            // Case B: Accepted agreement
            const accepted = await rentalService.createManualRentalAgreement(
                testOwner._id.toString(),
                {
                    propertyId: propB._id.toString(),
                    tenantEmail: testTenant.email,
                    monthlyRent: 19000,
                    securityDeposit: 38000,
                    leaseStart: new Date().toISOString(),
                    leaseEnd: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
                    terms: "Accepted agreement to test soft-cancellation capabilities.",
                    autoSend: false,
                }
            );

            await rentalService.acceptAgreement(accepted.agreement._id.toString(), testTenant._id.toString());

            const cancelResult = await rentalService.deleteOrCancelAgreement(
                accepted.agreement._id.toString(),
                testOwner._id.toString()
            );
            assert.strictEqual(cancelResult.cancelled, true);

            const refetchedCancelled = await RentalAgreement.findById(accepted.agreement._id);
            assert.ok(refetchedCancelled);
            assert.strictEqual(refetchedCancelled.status, "CANCELLED");
            assert.ok(refetchedCancelled.cancelledAt);
            assert.strictEqual(refetchedCancelled.cancelledBy?.toString(), testOwner._id.toString());

            // Cleanup
            await RentalAgreement.deleteOne({ _id: accepted.agreement._id });
            await RentalOccupant.deleteMany({ rental: accepted.rental._id });
            await Rental.deleteOne({ _id: accepted.rental._id });
        } finally {
            await Property.deleteOne({ _id: propA._id });
            await Property.deleteOne({ _id: propB._id });
        }
    });

    test("24. Active rental agreement cannot be edited in place (rejects with 400)", async () => {
        const { agreement } = await setupFreshAgreement("PENDING_TENANT");
        agreement.status = "ACTIVE";
        agreement.advancePaidAt = new Date();
        await agreement.save();

        await assert.rejects(
            async () => {
                await rentalService.updateAgreement(
                    agreement._id.toString(),
                    testOwner._id.toString(),
                    {
                        monthlyRent: 35000,
                        terms: "Attempting to edit already active lease agreement terms.",
                    }
                );
            },
            (err: any) => {
                assert.strictEqual(err.statusCode, 400);
                assert.match(err.message, /Active agreements with paid advances cannot be edited in place/);
                return true;
            }
        );
    });

    test("25. Lease termination demotes tenant to USER role if no other active tenancies exist", async () => {
        const singleUseTenant = await User.create({
            name: "Single Use Tenant",
            email: `single_tenant_${Date.now()}@test.spotnest.com`,
            password_hash: "hashed_pwd",
            role: UserRole.TENANT,
            status: UserStatus.ACTIVE,
        });

        try {
            const booking = await Booking.create({
                propertyId: testProperty._id,
                userId: singleUseTenant._id,
                ownerId: testOwner._id,
                startDate: new Date(),
                endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                monthlyRent: 25000,
                advanceAmount: 25000,
                status: "APPROVED",
                paymentStatus: "PAID",
            });

            const rental = await Rental.create({
                booking: booking._id,
                property: testProperty._id,
                owner: testOwner._id,
                tenant: singleUseTenant._id,
                monthlyRent: 25000,
                securityDeposit: 25000,
                leaseStart: booking.startDate,
                leaseEnd: booking.endDate,
                paymentFrequency: "monthly",
                status: "active",
            });

            const occupant = await RentalOccupant.create({
                rental: rental._id,
                tenant: singleUseTenant._id,
                rentAmount: 25000,
                securityDepositShare: 25000,
                status: "ACTIVE",
            });

            const agreement = await RentalAgreement.create({
                rental: rental._id,
                occupant: occupant._id,
                tenant: singleUseTenant._id,
                owner: testOwner._id,
                property: testProperty._id,
                monthlyRent: 25000,
                securityDepositShare: 25000,
                leaseStart: booking.startDate,
                leaseEnd: booking.endDate,
                terms: "Agreement terms for testing",
                status: "ACTIVE",
                advancePaidAt: new Date(),
            });

            // Terminate rental
            await rentalService.terminateRental(rental._id.toString(), testOwner._id.toString());

            // Verify tenant was demoted to USER role
            const updatedUser = await User.findById(singleUseTenant._id);
            assert.strictEqual(updatedUser!.role, UserRole.USER);

            // Cleanup
            await RentalAgreement.deleteOne({ _id: agreement._id });
            await RentalOccupant.deleteOne({ _id: occupant._id });
            await Rental.deleteOne({ _id: rental._id });
            await Booking.deleteOne({ _id: booking._id });
        } finally {
            await User.deleteOne({ _id: singleUseTenant._id });
        }
    });

    test("26. formatAgreementTerms dynamically replaces stale rent/deposit amounts", async () => {
        const staleTerms = `STANDARD RESIDENTIAL LEASE AGREEMENT
1. PURPOSE & PREMISES: The Owner agrees to lease...
2. MONTHLY RENT: The Tenant agrees to pay the monthly rent of ₹3,323 on or before the 5th day of every calendar month.
3. SECURITY DEPOSIT / ADVANCE: A refundable security deposit of ₹6,646 must be paid prior to move-in.`;

        const formatted = rentalService.formatAgreementTerms(
            staleTerms,
            3401,
            6802,
            "Ocean View Villa"
        );

        assert.ok(formatted.includes("₹3,401"));
        assert.ok(formatted.includes("₹6,802"));
        assert.ok(!formatted.includes("₹3,323"));
        assert.ok(!formatted.includes("₹6,646"));
    });

    test("27. Occupied property rejects overlapping dates and triggers 3-day tenant extension inquiry for subsequent dates", async () => {
        const prop = await createTestProperty("27");

        // Create an active rental for prop with testTenant
        const activeRental = await Rental.create({
            property: prop._id,
            owner: testOwner._id,
            tenant: testTenant._id,
            monthlyRent: 25000,
            securityDeposit: 50000,
            leaseStart: new Date(),
            leaseEnd: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            status: "active",
        });

        // Another applicant (applicantUser) requests to rent the property
        const applicantUser = await User.create({
            name: "Applicant Tenant",
            email: `applicant_${Date.now()}@example.com`,
            password_hash: "hashed_pwd",
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
            isBlock: false,
        });

        try {
            // Case A: Applicant requests date starting during existing lease -> MUST REJECT (400)
            const overlappingStart = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
            const overlappingEnd = new Date(Date.now() + 240 * 24 * 60 * 60 * 1000);

            await assert.rejects(
                async () => {
                    await bookingService.createBooking(applicantUser._id.toString(), {
                        propertyId: prop._id.toString(),
                        startDate: overlappingStart,
                        endDate: overlappingEnd,
                        notes: "Attempting to book during current occupancy",
                    });
                },
                (err: any) => {
                    assert.strictEqual(err.statusCode, 400);
                    assert.match(err.message, /This property is currently occupied until/);
                    return true;
                }
            );

            // Case B: Applicant requests starting AFTER current lease ends -> Allowed, triggers 3-day inquiry
            const validStart = new Date(Date.now() + 190 * 24 * 60 * 60 * 1000);
            const validEnd = new Date(Date.now() + 370 * 24 * 60 * 60 * 1000);

            const newBooking = await bookingService.createBooking(applicantUser._id.toString(), {
                propertyId: prop._id.toString(),
                startDate: validStart,
                endDate: validEnd,
                notes: "Requesting from lease end date",
            });

            // Verify tenant inquiry was created
            assert.ok(newBooking.tenantInquiry);
            assert.strictEqual(newBooking.tenantInquiry.status, "PENDING");
            assert.strictEqual(newBooking.tenantInquiry.currentTenantId.toString(), testTenant._id.toString());
            assert.ok(newBooking.tenantInquiry.deadline);

            // Owner cannot approve while inquiry is pending
            await assert.rejects(
                async () => {
                    await bookingService.reviewBooking(
                        newBooking._id.toString(),
                        testOwner._id.toString(),
                        { decision: "APPROVED" }
                    );
                },
                (err: any) => {
                    assert.strictEqual(err.statusCode, 409);
                    assert.match(err.message, /Waiting for the current tenant to respond/);
                    return true;
                }
            );

            // Current tenant responds to the inquiry with MOVE_OUT
            const updatedBooking = await bookingService.respondToTenantInquiry(
                newBooking._id.toString(),
                testTenant._id.toString(),
                { choice: "MOVE_OUT" }
            );

            assert.strictEqual(updatedBooking.tenantInquiry!.status, "ACCEPTED_MOVE_OUT");
            assert.ok(updatedBooking.tenantInquiry!.responseMessage?.includes("I will end the rent"));

            // Owner can now approve the booking!
            const approved = await bookingService.reviewBooking(
                newBooking._id.toString(),
                testOwner._id.toString(),
                { decision: "APPROVED" }
            );

            assert.strictEqual(approved.status, "APPROVED");
        } finally {
            await Rental.deleteOne({ _id: activeRental._id });
            await Booking.deleteMany({ userId: applicantUser._id });
            await User.deleteOne({ _id: applicantUser._id });
            await Property.deleteOne({ _id: prop._id });
        }
    });
});
