import { AppError } from "../../shared/errors/AppError.js";
import settingsRepository from "./repository.js";
import type { SettingsUpdateInput } from "./validation.js";

const getSettings = async () => {
    const settings = await settingsRepository.getGlobal();
    const data = settings.toObject();
    delete (data as Record<string, unknown>)._id;
    delete (data as Record<string, unknown>).__v;
    return data;
};

const updateSettings = async (data: SettingsUpdateInput) => {
    if (data.propertyApprovalRequired && data.defaultListingStatus === "active") {
        throw new AppError(400, "Properties requiring approval must default to unlisted");
    }
    const definedData = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const settings = await settingsRepository.updateGlobal(definedData);
    const result = settings.toObject();
    delete (result as Record<string, unknown>)._id;
    delete (result as Record<string, unknown>).__v;
    return result;
};

export default { getSettings, updateSettings };
