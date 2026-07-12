// routes/studentFeeReport.routes.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import {
  listReports,
  createReport,
  updateReport,
  removeReport,
  listPayments,
  listEligibleStudents,
  collectPayment,
  createPayment,
  updatePayment,
  removePayment,
} from "../controllers/feeController.js";

const studentFeeReportRoutes = express.Router();

studentFeeReportRoutes.use(requireAuth);
studentFeeReportRoutes.get("/eligible-students", listEligibleStudents);

studentFeeReportRoutes.get("/", listReports);
studentFeeReportRoutes.get("/listPayments", listPayments);
studentFeeReportRoutes.post("/", createReport);
studentFeeReportRoutes.put("/:id", updateReport);
studentFeeReportRoutes.delete("/:id", removeReport);
studentFeeReportRoutes.post("/createpayment", createPayment);
studentFeeReportRoutes.post("/collectpayment", collectPayment);
studentFeeReportRoutes.post("/removePayment", removePayment);
studentFeeReportRoutes.post("/updatepayment", updatePayment);

export default studentFeeReportRoutes;

// In your app entrypoint (e.g. server.js / app.js):
//   import studentFeeReportRoutes from "./routes/studentFeeReport.routes.js";
//   app.use("/api/student-fee-reports", studentFeeReportRoutes);
