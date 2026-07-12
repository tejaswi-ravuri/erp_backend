// routes/attendance.routes.js
import express from "express";
import * as attendanceController from "../controllers/attendanceController.js";
import { requireAuth } from "../middleware/auth.js";

const attendanceRouter = express.Router();

attendanceRouter.use(requireAuth);

attendanceRouter.get("/", attendanceController.list);
attendanceRouter.post("/", attendanceController.create);
attendanceRouter.post("/bulk-mark", attendanceController.bulkMark);
attendanceRouter.put("/:id", attendanceController.update);

export default attendanceRouter;
