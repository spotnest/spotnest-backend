import { Router } from "express";
import authRoutes from "../modules/auth/routes.js";
import dashboardRoutes from "../modules/dashboard/adminDashboard/routes.js";
import propertyRoutes from "../modules/properties/routes.js";
import settingsRoutes from "../modules/settings/routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/properties", propertyRoutes);
apiRouter.use("/settings", settingsRoutes);

export default apiRouter;
