import Student from "../models/Student.js";
import Staff from "../models/Staff.js";
import Attendance from "../models/Attendance.js";
import Marks from "../models/Marks.js";
import FeePayment from "../models/FeePayment.js";
import StudentFeeReport from "../models/StudentFeeReport.js";
import Income from "../models/Income.js";
import Expenditure from "../models/Expenditure.js";
import Admission from "../models/Admission.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { CROSS_BRANCH_ROLES, BRANCHES } from "../config/constants.js";

const NOT_DELETED = { is_deleted: { $ne: true } };

/** Returns { branch: "X" } for branch-scoped roles, {} for cross-branch roles
 *  (unless they explicitly pass ?branch=X, e.g. Accounts Manager drilling into one branch). */
function scopeFor(req) {
  if (CROSS_BRANCH_ROLES.includes(req.user.role)) {
    return req.query.branch ? { branch: req.query.branch } : {};
  }
  return { branch: req.user.branch };
}

function dateRange(req) {
  const range = {};
  if (req.query.from) range.$gte = new Date(req.query.from);
  if (req.query.to) range.$lte = new Date(req.query.to);
  return Object.keys(range).length ? range : null;
}

// GET /api/analytics/overview
export const overview = asyncHandler(async (req, res) => {
  const scope = scopeFor(req);
  const baseFilter = { ...scope, ...NOT_DELETED };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalStudents,
    activeStudents,
    totalStaff,
    feeThisMonthAgg,
    feePendingAgg,
    todayAttendance,
    pendingAdmissions,
  ] = await Promise.all([
    Student.countDocuments(baseFilter),
    Student.countDocuments({ ...baseFilter, status: "Active" }),
    Staff.countDocuments({ ...baseFilter, status: "Active" }),
    FeePayment.aggregate([
      { $match: { ...baseFilter, status: "Paid", payment_date: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    FeePayment.aggregate([
      { $match: { ...baseFilter, status: "Pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Attendance.aggregate([
      { $match: { ...baseFilter, date: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Admission.countDocuments({ ...baseFilter, form_status: { $in: ["Enquiry", "Applied", "Under Review"] } }),
  ]);

  const attendanceMap = Object.fromEntries(todayAttendance.map((a) => [a._id, a.count]));

  res.json({
    branch_scope: scope.branch || "all_branches",
    total_students: totalStudents,
    active_students: activeStudents,
    total_staff: totalStaff,
    fee_collected_this_month: feeThisMonthAgg[0]?.total || 0,
    fee_pending: feePendingAgg[0]?.total || 0,
    today_attendance: {
      present: attendanceMap.Present || 0,
      absent: attendanceMap.Absent || 0,
      late: attendanceMap.Late || 0,
    },
    pending_admissions: pendingAdmissions,
  });
});

// GET /api/analytics/fees-summary?academic_year=&from=&to=
export const feesSummary = asyncHandler(async (req, res) => {
  const scope = scopeFor(req);
  const match = { ...scope, ...NOT_DELETED };
  if (req.query.academic_year) match.academic_year = req.query.academic_year;
  const range = dateRange(req);
  if (range) match.payment_date = range;

  const [byType, byMonth, byStatus, byClass] = await Promise.all([
    FeePayment.aggregate([
      { $match: match },
      { $group: { _id: "$fee_type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    FeePayment.aggregate([
      { $match: match },
      {
        $group: {
          _id: { y: { $year: "$payment_date" }, m: { $month: "$payment_date" } },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]),
    FeePayment.aggregate([
      { $match: match },
      { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    StudentFeeReport.aggregate([
      { $match: { ...scope, ...NOT_DELETED } },
      {
        $group: {
          _id: "$class",
          net_term_fee: { $sum: "$net_term_fee" },
          paid_term_fee: { $sum: "$paid_term_fee" },
          balance_term_fee: { $sum: "$balance_term_fee" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({ by_fee_type: byType, by_month: byMonth, by_status: byStatus, by_class: byClass });
});

// GET /api/analytics/attendance-summary?class=&from=&to=
export const attendanceSummary = asyncHandler(async (req, res) => {
  const scope = scopeFor(req);
  const match = { ...scope, ...NOT_DELETED };
  if (req.query.class) match.class = req.query.class;
  const range = dateRange(req);
  if (range) match.date = range;

  const [byStatus, byClass, trend] = await Promise.all([
    Attendance.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Attendance.aggregate([
      { $match: match },
      { $group: { _id: { class: "$class", status: "$status" }, count: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, status: "$status" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]),
  ]);

  const totalMarked = byStatus.reduce((sum, s) => sum + s.count, 0);
  const present = byStatus.find((s) => s._id === "Present")?.count || 0;
  const attendancePct = totalMarked ? Math.round((present / totalMarked) * 1000) / 10 : 0;

  res.json({ overall_attendance_pct: attendancePct, by_status: byStatus, by_class: byClass, trend });
});

// GET /api/analytics/academic-performance?class=&exam_type=&subject=
export const academicPerformance = asyncHandler(async (req, res) => {
  const scope = scopeFor(req);
  const match = { ...scope, ...NOT_DELETED };
  if (req.query.class) match.class = req.query.class;
  if (req.query.exam_type) match.exam_type = req.query.exam_type;
  if (req.query.subject) match.subject = req.query.subject;

  const [bySubject, byClass, distribution] = await Promise.all([
    Marks.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$subject",
          avg_pct: { $avg: { $multiply: [{ $divide: ["$marks_obtained", "$max_marks"] }, 100] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Marks.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$class",
          avg_pct: { $avg: { $multiply: [{ $divide: ["$marks_obtained", "$max_marks"] }, 100] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Marks.aggregate([
      { $match: match },
      {
        $bucket: {
          groupBy: { $multiply: [{ $divide: ["$marks_obtained", "$max_marks"] }, 100] },
          boundaries: [0, 35, 50, 60, 75, 90, 100.01],
          default: "other",
          output: { count: { $sum: 1 } },
        },
      },
    ]),
  ]);

  res.json({ by_subject: bySubject, by_class: byClass, score_distribution: distribution });
});

// GET /api/analytics/income-expenditure?from=&to=
export const incomeExpenditure = asyncHandler(async (req, res) => {
  const scope = scopeFor(req);
  const matchIncome = { ...scope, ...NOT_DELETED };
  const matchExp = { ...scope, ...NOT_DELETED };
  const range = dateRange(req);
  if (range) {
    matchIncome.date = range;
    matchExp.date = range;
  }

  const [incomeByMonth, expByMonth, expByCategory, totalsArr] = await Promise.all([
    Income.aggregate([
      { $match: matchIncome },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, total: { $sum: "$amount" } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]),
    Expenditure.aggregate([
      { $match: matchExp },
      { $group: { _id: { y: { $year: "$date" }, m: { $month: "$date" } }, total: { $sum: "$amount" } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]),
    Expenditure.aggregate([
      { $match: matchExp },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ]),
    Promise.all([
      Income.aggregate([{ $match: matchIncome }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Expenditure.aggregate([{ $match: matchExp }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]),
  ]);

  const totalIncome = totalsArr[0][0]?.total || 0;
  const totalExpenditure = totalsArr[1][0]?.total || 0;

  res.json({
    total_income: totalIncome,
    total_expenditure: totalExpenditure,
    net: totalIncome - totalExpenditure,
    income_by_month: incomeByMonth,
    expenditure_by_month: expByMonth,
    expenditure_by_category: expByCategory,
  });
});

// GET /api/analytics/branch-comparison  (Accounts Manager / Super Admin ONLY - route-gated)
export const branchComparison = asyncHandler(async (req, res) => {
  const results = await Promise.all(
    BRANCHES.map(async (branch) => {
      const match = { branch, ...NOT_DELETED };
      const [students, staff, feeAgg, attendanceAgg] = await Promise.all([
        Student.countDocuments(match),
        Staff.countDocuments(match),
        FeePayment.aggregate([
          { $match: { ...match, status: "Paid" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Attendance.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      ]);
      const attMap = Object.fromEntries(attendanceAgg.map((a) => [a._id, a.count]));
      const totalAtt = Object.values(attMap).reduce((a, b) => a + b, 0);
      return {
        branch,
        total_students: students,
        total_staff: staff,
        fee_collected: feeAgg[0]?.total || 0,
        attendance_pct: totalAtt ? Math.round(((attMap.Present || 0) / totalAtt) * 1000) / 10 : 0,
      };
    }),
  );
  res.json({ branches: results });
});

// GET /api/analytics/admissions-funnel?academic_year=
export const admissionsFunnel = asyncHandler(async (req, res) => {
  const scope = scopeFor(req);
  const match = { ...scope, ...NOT_DELETED };
  if (req.query.academic_year) match.academic_year = req.query.academic_year;

  const funnel = await Admission.aggregate([
    { $match: match },
    { $group: { _id: "$form_status", count: { $sum: 1 } } },
  ]);
  const byClass = await Admission.aggregate([
    { $match: match },
    { $group: { _id: "$class_sought", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({ funnel, by_class_sought: byClass });
});
