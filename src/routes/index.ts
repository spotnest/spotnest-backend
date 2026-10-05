import { Router } from "express";
import authRoutes from "../modules/auth/routes.js";
import dashboardRoutes from "../modules/dashboard/adminDashboard/routes.js";
import propertyRoutes from "../modules/properties/routes.js";
import settingsRoutes from "../modules/settings/routes.js";
import notificationRoutes from "../modules/notifications/routes.js";
import visitRoutes from "../modules/visits/routes.js";
import tenantRoutes from "../modules/dashboard/tenantDashboard/routes.js";
import chatRoutes from "../modules/chat/routes.js";
import subscriptionRoutes from "../modules/subscriptions/routes.js";
import bookingRoutes from "../modules/bookings/routes.js";
import paymentRoutes from "../modules/payments/routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/properties", propertyRoutes);
apiRouter.use("/settings", settingsRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/visits", visitRoutes);
apiRouter.use("/tenant", tenantRoutes);
apiRouter.use("/chat", chatRoutes);
apiRouter.use("/subscriptions", subscriptionRoutes);
apiRouter.use("/bookings", bookingRoutes);
apiRouter.use("/payments", paymentRoutes);

export default apiRouter;