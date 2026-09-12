import { Router } from "express";
import authRoutes from "../modules/auth/routes.js";
import propertyRoutes from "../modules/properties/routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/properties", propertyRoutes);

export default apiRouter;
