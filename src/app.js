import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import entityRoutes from "./routes/entityRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import studentRouter from "./routes/studentRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import attendanceRouter from "./routes/attendanceRoutes.js";
import marksRouter from "./routes/marksRoutes.js";
import homeworkRouter from "./routes/homeworkRouter.js";
import userRouter from "./routes/userRouter.js";
import branchRouter from "./routes/branchRouter.js";
import admissionRouter from "./routes/admissionRoutes.js";
import studentFeeReportRoutes from "./routes/studentFeeReportRoutes.js";
import incomeRoutes from "./routes/incomeRoutes.js";
import expenditureRoutes from "./routes/expenditureRoutes.js";
import feePaymentRoutes from "./routes/feePaymentRouter.js";

dotenv.config();

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
console.log("client url---", process.env.CLIENT_URL);
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/uploads", express.static(path.resolve("uploads")));

app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRouter);
app.use("/api/entities", entityRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/attendance", attendanceRouter);
app.use("/api/marks", marksRouter);
app.use("/api/homework", homeworkRouter);
app.use("/api/admissions", admissionRouter);
app.use("/api/branches", branchRouter);
app.use("/api/fee", studentFeeReportRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/expenditure", expenditureRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
