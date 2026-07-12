import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  overview,
  feesSummary,
  attendanceSummary,
  academicPerformance,
  incomeExpenditure,
  branchComparison,
  admissionsFunnel,
  dashboardStats,
} from "../controllers/analyticsController.js";
import { ROLES } from "../config/constants.js";

const router = express.Router();
router.use(requireAuth);

// Every role gets *some* analytics, but each sees only their own branch
// (enforced in the controller via scopeFor()) except Accounts Manager / Super Admin.
router.get("/overview", overview);
router.get(
  "/fees-summary",
  requireRole(ROLES.ADMIN_OFFICER, ROLES.ACCOUNTS_MANAGER, ROLES.PRINCIPAL),
  feesSummary,
);
router.get(
  "/attendance-summary",
  requireRole(
    ROLES.TEACHER,
    ROLES.PRINCIPAL,
    ROLES.ADMIN_OFFICER,
    ROLES.ACCOUNTS_MANAGER,
  ),
  attendanceSummary,
);
router.get(
  "/academic-performance",
  requireRole(ROLES.TEACHER, ROLES.PRINCIPAL, ROLES.ACCOUNTS_MANAGER),
  academicPerformance,
);
router.get(
  "/income-expenditure",
  requireRole(ROLES.ADMIN_OFFICER, ROLES.ACCOUNTS_MANAGER, ROLES.PRINCIPAL),
  incomeExpenditure,
);
router.get(
  "/admissions-funnel",
  requireRole(ROLES.PRINCIPAL, ROLES.ADMIN_OFFICER, ROLES.ACCOUNTS_MANAGER),
  admissionsFunnel,
);
router.get(
  "/dashboard-stats",
  requireRole(ROLES.PRINCIPAL, ROLES.ADMIN_OFFICER, ROLES.ACCOUNTS_MANAGER),
  dashboardStats,
);

// Cross-branch comparison is exactly the kind of view only Accounts Manager / Super Admin should have.
router.get(
  "/branch-comparison",
  requireRole(ROLES.ACCOUNTS_MANAGER),
  branchComparison,
);

export default router;
