import express from "express";

import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES } from "../config/constants.js";
import * as branchController from "../controllers/branchController.js";

const branchRouter = express.Router();

branchRouter.use(requireAuth);

branchRouter.get("/", branchController.list);
branchRouter.post(
  "/",
  requireRole(ROLES.ADMIN_OFFICER),
  branchController.create,
);
branchRouter.put(
  "/:id",
  requireRole(ROLES.ADMIN_OFFICER),
  branchController.update,
);
branchRouter.delete(
  "/:id",
  requireRole(ROLES.ADMIN_OFFICER),
  branchController.remove,
);

export default branchRouter;
