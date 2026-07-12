// routes/homework.routes.js
import express from "express";

// Adjust to wherever your existing auth middleware lives.
import { requireAuth } from "../middleware/auth.js";

import * as homeworkController from "../controllers/homeworkController.js";

const homeworkRouter = express.Router();

homeworkRouter.use(requireAuth);

homeworkRouter.get("/", homeworkController.list);
homeworkRouter.post("/", homeworkController.create);
homeworkRouter.post("/:id/notify", homeworkController.notify);
homeworkRouter.delete("/:id", homeworkController.remove);

export default homeworkRouter;

// In your app entrypoint (e.g. server.js / app.js):
//   import homeworkRoutes from "./routes/homework.routes.js";
//   app.use("/api/homework", homeworkRouter);
