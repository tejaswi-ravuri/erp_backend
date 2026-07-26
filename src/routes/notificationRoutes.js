// routes/notificationRoutes.js
import { Router } from "express";
import { list, resolve } from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/auth.js";

const notificationRoutes = Router();
notificationRoutes.use(requireAuth);

notificationRoutes.get("/", list);
notificationRoutes.put("/:id/resolve", resolve);

export default notificationRoutes;
