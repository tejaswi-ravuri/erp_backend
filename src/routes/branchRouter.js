import express from "express";

import { requireAuth } from "../middleware/auth.js";
import * as branchController from "../controllers/branchController.js";

const branchRouter = express.Router();

branchRouter.use(requireAuth);

branchRouter.get("/", branchController.list);

export default branchRouter;
