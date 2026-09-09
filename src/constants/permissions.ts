export const PERMISSIONS = {
    EMPLOYEES_VIEW: "employees.view",
    EMPLOYEES_CREATE: "employees.create",
    EMPLOYEES_UPDATE: "employees.update",
    EMPLOYEES_DELETE: "employees.delete",

    PRODUCTION_VIEW: "production.view",
    PRODUCTION_CREATE: "production.create",
    PRODUCTION_UPDATE: "production.update",
    PRODUCTION_DELETE: "production.delete",
    PRODUCTION_ASSIGN: "production.assign",
    PRODUCTION_VERIFY: "production.verify",

    ATTENDANCE_VIEW: "attendance.view",
    ATTENDANCE_MANAGE: "attendance.manage",
    ATTENDANCE_EXPORT: "attendance.export",

    INVENTORY_VIEW: "inventory.view",
    INVENTORY_CREATE: "inventory.create",
    INVENTORY_UPDATE: "inventory.update",
    INVENTORY_DELETE: "inventory.delete",

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