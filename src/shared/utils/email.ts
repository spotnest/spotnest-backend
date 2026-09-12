import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const from = process.env.EMAIL_FROM || "SpotNest <no-reply@stitchflow.space>";

export const sendOtpEmail = async (
    to: string,
    otp: string,
    type: "email_verify" | "password_reset"
): Promise<void> => {
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
    await resend.emails.send({
        from,
        to,
        subject: "You're approved to list on SpotNest",
        text: "Your ID verification has been approved. You can now log in and list properties.",
    });
};

export const sendOwnerRejectedEmail = async (to: string, reason: string): Promise<void> => {
    await resend.emails.send({
        from,
        to,
        subject: "SpotNest ID verification not approved",
        text: `Your ID verification was not approved: ${reason}. You're welcome to register again with a clearer document.`,
    });
};