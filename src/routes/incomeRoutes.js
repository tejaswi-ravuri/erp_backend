// routes/income.routes.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import * as incomeController from "../controllers/incomeController.js";

const incomeRoutes = express.Router();

incomeRoutes.use(requireAuth);

incomeRoutes.get("/", incomeController.list);
incomeRoutes.post("/", incomeController.create);
incomeRoutes.put("/:id", incomeController.update);
incomeRoutes.delete("/:id", incomeController.remove);

export default incomeRoutes;

// In your app entrypoint (e.g. server.js / app.js):
//   import incomeRoutes from "./routes/income.routes.js";
//   app.use("/api/income", incomeRoutes);
