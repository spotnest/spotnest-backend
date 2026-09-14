import { Router } from "express";
import authRoutes from "../modules/auth/routes.js";
import dashboardRoutes from "../modules/dashboard/adminDashboard/routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/dashboard", dashboardRoutes);

export default apiRouter;
