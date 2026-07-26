// routes/user.routes.js
import express from "express";

import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES } from "../config/constants.js";
import * as userController from "../controllers/userController.js";

const userRouter = express.Router();

userRouter.use(requireAuth);

userRouter.get("/", userController.list);
userRouter.post("/", userController.create);
userRouter.post(
  "/transfer-teachers",
  requireRole(ROLES.ADMIN_OFFICER),
  userController.transferTeachers,
);
userRouter.put("/:id", userController.update);
userRouter.delete("/:id", userController.remove);

// Deactivation-approval workflow: Accounts Manager requests/withdraws,
// Principal approves/rejects. See userController.js for the full flow.
userRouter.post(
  "/:id/request-delete",
  requireRole(ROLES.ACCOUNTS_MANAGER),
  userController.requestDelete,
);
userRouter.post(
  "/:id/withdraw-delete-request",
  requireRole(ROLES.ACCOUNTS_MANAGER),
  userController.withdrawDeleteRequest,
);
userRouter.post(
  "/:id/approve-delete",
  requireRole(ROLES.PRINCIPAL),
  userController.approveDeleteRequest,
);
userRouter.post(
  "/:id/reject-delete",
  requireRole(ROLES.PRINCIPAL),
  userController.rejectDeleteRequest,
);

export default userRouter;
