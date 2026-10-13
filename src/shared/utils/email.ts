import { Resend } from "resend";

const getResendClient = (): Resend | null => {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
        return null;
    }
    return new Resend(key);
};

const from = process.env.EMAIL_FROM || "SpotNest <no-reply@stitchflow.space>";

export const sendOtpEmail = async (
    to: string,
    otp: string,
    type: "email_verify" | "password_reset"
): Promise<void> => {
    const resend = getResendClient();
    if (!resend) {
        console.warn(`[EMAIL_SKIPPED] RESEND_API_KEY not set — OTP email to ${to} skipped`);
        return;
    }

    const subject = type === "email_verify" ? "Verify your SpotNest email" : "Reset your SpotNest password";
    const expiry = process.env.OTP_EXPIRY_MINUTES ?? "10";
    await resend.emails.send({
        from,
        to,
        subject,
        html: `
            <h2>Your SpotNest ${type === "email_verify" ? "Verification Code" : "Password Reset Code"}</h2>
            <p>Your code is: <strong>${otp}</strong></p>
            <p>This code expires in ${expiry} minutes.</p>
        `,
    });
};

export const sendOwnerRegistrationAlert = async (ownerEmail: string, ownerName: string): Promise<void> => {
    const resend = getResendClient();
    if (!resend) {
        console.warn("[EMAIL_SKIPPED] RESEND_API_KEY not set — registration alert skipped");
        return;
    }

    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (!adminEmail) {
        console.warn("[EMAIL_SKIPPED] ADMIN_ALERT_EMAIL not set — registration alert not sent");
        return;
    }
    await resend.emails.send({
        from,
        to: adminEmail,
        subject: "New owner registration awaiting approval",
        text: `${ownerName} (${ownerEmail}) registered as an owner and is awaiting ID verification review.`,
    });
};

export const sendOwnerApprovedEmail = async (to: string): Promise<void> => {
    const resend = getResendClient();
    if (!resend) {
        console.warn(`[EMAIL_SKIPPED] RESEND_API_KEY not set — approval email to ${to} skipped`);
        return;
    }

    await resend.emails.send({
        from,
        to,
        subject: "You're approved to list on SpotNest",
        text: "Your ID verification has been approved. You can now log in and list properties.",
    });
};

export const sendOwnerRejectedEmail = async (to: string, reason: string): Promise<void> => {
    const resend = getResendClient();
    if (!resend) {
        console.warn(`[EMAIL_SKIPPED] RESEND_API_KEY not set — rejection email to ${to} skipped`);
        return;
    }

    await resend.emails.send({
        from,
        to,
        subject: "SpotNest ID verification not approved",
        text: `Your ID verification was not approved: ${reason}. You're welcome to register again with a clearer document.`,
    });
};

export const sendAgreementEmail = async (
    to: string,
    details: {
        propertyTitle: string;
        ownerName: string;
        monthlyRent: number;
        securityDeposit: number;
        agreementUrl?: string;
    }
): Promise<void> => {
    const resend = getResendClient();
    if (!resend) {
        console.warn(`[EMAIL_SKIPPED] RESEND_API_KEY not set — agreement email to ${to} skipped`);
        return;
    }

    const appUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const agreementLink = details.agreementUrl || `${appUrl}/tenant/dashboard/rental`;

    await resend.emails.send({
        from,
        to,
        subject: `New Rental Agreement: ${details.propertyTitle}`,
        html: `
            <h2>New Rental Agreement Prepared for You</h2>
            <p>Property Owner <strong>${details.ownerName}</strong> has prepared a rental agreement for <strong>${details.propertyTitle}</strong>.</p>
            <ul>
                <li><strong>Monthly Rent:</strong> ₹${details.monthlyRent.toLocaleString("en-IN")}</li>
                <li><strong>Security Deposit:</strong> ₹${details.securityDeposit.toLocaleString("en-IN")}</li>
            </ul>
            <p>Please review the agreement terms and complete your acceptance:</p>
            <p><a href="${agreementLink}" style="display:inline-block;padding:10px 18px;background:#00696b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">Review Rental Agreement</a></p>
        `,
    });
};

export const sendTenantExtensionInquiryEmail = async (
    to: string,
    details: {
        propertyTitle: string;
        tenantName: string;
        requestedStartDate: string;
        requestedEndDate: string;
        deadlineDate: string;
        responseUrl?: string;
    }
): Promise<void> => {
    const resend = getResendClient();
    if (!resend) {
        console.warn(
            `[EMAIL_SKIPPED] RESEND_API_KEY not set — tenant extension inquiry email to ${to} skipped`
        );
        return;
    }

    const appUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const actionLink = details.responseUrl || `${appUrl}/tenant/dashboard/rental`;

    await resend.emails.send({
        from,
        to,
        subject: `Action Required: Move-out Schedule & Rental Inquiry for ${details.propertyTitle}`,
        html: `
            <h2>Move-Out Schedule & Lease Renewal Inquiry</h2>
            <p>Hello <strong>${details.tenantName}</strong>,</p>
            <p>Another applicant has requested to rent <strong>${details.propertyTitle}</strong> from <strong>${details.requestedStartDate}</strong> to <strong>${details.requestedEndDate}</strong>.</p>
            <p><strong>Are you okay to end the rent at the scheduled time, or are you considering extending your rental?</strong></p>
            
            <h3>Your Options:</h3>
            <ol>
                <li><strong>Yes, I am okay. I will end the rent at that time.</strong> (Confirm move-out)</li>
                <li><strong>No, I am considering extending my rental.</strong> (Request lease renewal)</li>
                <li><strong>Send a custom message</strong> to the property owner.</li>
            </ol>
            
            <p style="padding:12px;background:#fff8e1;border-left:4px solid #b78103;color:#5c4100;font-weight:bold;">
                Notice: Please answer within 3 days (by ${details.deadlineDate}). If you do not answer within 3 days, we will accept the new request with your deemed consent.
            </p>
            
            <p style="margin-top:20px;">
                <a href="${actionLink}" style="display:inline-block;padding:12px 22px;background:#00696b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
                    Respond in Tenant Portal
                </a>
            </p>
        `,
    });
};