// routes/income.routes.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import * as incomeController from "../controllers/incomeController.js";

const incomeRoutes = express.Router();

incomeRoutes.use(requireAuth);

incomeRoutes.get("/", incomeController.list);
incomeRoutes.post("/", incomeController.create);
incomeRoutes.put("/:id", incomeController.update);
incomeRoutes.post("/:id/request-delete", incomeController.requestDelete);
incomeRoutes.post("/:id/approve-delete", incomeController.approveDelete);
incomeRoutes.post("/:id/reject-delete", incomeController.rejectDelete);

export default incomeRoutes;

// In your app entrypoint (e.g. server.js / app.js):
//   import incomeRoutes from "./routes/income.routes.js";
//   app.use("/api/income", incomeRoutes);
