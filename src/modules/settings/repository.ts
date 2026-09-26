import Settings from "./model.js";
import type { ISettings, SettingsUpdate } from "./type.js";

const DEFAULTS: SettingsUpdate = {
    ownerApprovalRequired: true,
    emailVerificationRequired: true,
    userRegistrationEnabled: true,
    ownerRegistrationEnabled: true,
    propertyApprovalRequired: false,
    propertyListingEnabled: true,
    newOwnerRegistrationAlerts: true,
    ownerApprovalEmails: true,
    platformName: "SpotNest",
    supportEmail: "",
    supportPhone: "",
    currency: "INR",
    timezone: "Asia/Kolkata",
    defaultPaginationLimit: 10,
    maintenanceMode: false,
};

const getGlobal = async (): Promise<ISettings> => {
    return Settings.findOneAndUpdate(
        { key: "global" },
        { $setOnInsert: { key: "global", ...DEFAULTS } },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );
};

const updateGlobal = async (data: SettingsUpdate): Promise<ISettings> => {
    return Settings.findOneAndUpdate(
        { key: "global" },
        { $set: data },
        { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );
};

export default { getGlobal, updateGlobal };
