export const PERMISSIONS = {
    CUSTOMERS_VIEW: "customers.view",
    CUSTOMERS_CREATE: "customers.create",
    CUSTOMERS_UPDATE: "customers.update",
    CUSTOMERS_DELETE: "customers.delete",

    PROPERTY_VIEW: "property.view",
    PROPERTY_CREATE: "property.create",
    PROPERTY_UPDATE: "property.update",
    PROPERTY_DELETE: "property.delete",
    PROPERTY_ASSIGN: "property.assign",
    PROPERTY_VERIFY: "property.verify",

    SUPPORT_VIEW: "support.view",
    SUPPORT_CREATE: "support.create",
    SUPPORT_UPDATE: "support.update",
    SUPPORT_RESOLVE: "support.resolve",
    SUPPORT_CLOSE: "support.close",

    REPORTS_VIEW: "reports.view",
    REPORTS_EXPORT: "reports.export",

    SETTINGS_VIEW: "settings.view",
    SETTINGS_MANAGE: "settings.manage",
} as const;
export type Permission =
    (typeof PERMISSIONS)[keyof typeof PERMISSIONS];