// routes/expenditure.routes.js
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import * as expenditureController from "../controllers/expenditureController.js";

const expenditureRoutes = express.Router();

expenditureRoutes.use(requireAuth);

expenditureRoutes.get("/", expenditureController.list);
expenditureRoutes.post("/", expenditureController.create);
expenditureRoutes.put("/:id", expenditureController.update);
expenditureRoutes.delete("/:id", expenditureController.remove);

export default expenditureRoutes;

// In your app entrypoint (e.g. server.js / app.js):
//   import expenditureRoutes from "./routes/expenditure.routes.js";
//   app.use("/api/expenditure", expenditureRoutes);
