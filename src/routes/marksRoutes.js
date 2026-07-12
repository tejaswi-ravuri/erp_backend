// routes/marks.routes.js
import express from "express";
import * as marksController from "../controllers/marksController.js";
import { requireAuth } from "../middleware/auth.js";

const marksRouter = express.Router();

marksRouter.use(requireAuth);

marksRouter.get("/", marksController.list);
marksRouter.post("/", marksController.create);
marksRouter.put("/:id", marksController.update);

export default marksRouter;
