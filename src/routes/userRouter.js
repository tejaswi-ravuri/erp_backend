// routes/user.routes.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import * as userController from "../controllers/userController.js";

const userRouter = express.Router();

userRouter.use(requireAuth);

userRouter.get("/", userController.list);
userRouter.post("/", userController.create);
userRouter.put("/:id", userController.update);
userRouter.delete("/:id", userController.remove);

export default userRouter;
