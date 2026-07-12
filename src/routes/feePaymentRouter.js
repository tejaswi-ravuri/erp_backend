// routes/feePayment.routes.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import {
  listPayments,
  pendingSummary,
  createPayment,
  collectPayment,
  updatePayment,
  removePayment,
} from "../controllers/feeController.js";

const feePaymentRoutes = express.Router();

feePaymentRoutes.use(requireAuth);

feePaymentRoutes.get("/", listPayments);
feePaymentRoutes.get("/pending-summary", pendingSummary);
feePaymentRoutes.post("/", createPayment);
feePaymentRoutes.post("/collect", collectPayment);
feePaymentRoutes.put("/:id", updatePayment);
feePaymentRoutes.delete("/:id", removePayment);

export default feePaymentRoutes;

// In your app entrypoint (e.g. server.js / app.js):
//   import feePaymentRoutes from "./routes/feePayment.routes.js";
//   app.use("/api/fee-payments", feePaymentRoutes);
