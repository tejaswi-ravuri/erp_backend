// controllers/feeController.js
//
// FeePayment (individual payment transactions) and StudentFeeReport (a
// student's fee STRUCTURE - what they owe, what's paid, what's left)
// merged into one file - collectPayment() already has to touch both
// models in a single call, so keeping them apart across two files never
// really reflected the actual coupling between them.
//
// Payment-related exports: listPayments, pendingSummary, createPayment,
//   collectPayment, updatePayment, removePayment
// Report-related exports:  listReports, createReport, updateReport,
//   removeReport, listEligibleStudents
//
// isAllowed(entityName, action, role) - rbac/permissions.js has separate
// entries for "FeePayment" and "StudentFeeReport" (both grant
// ADMIN_OFFICER/ACCOUNTS_MANAGER create/update, PRINCIPAL read-only,
// PRINCIPAL added to FeePayment's delete too) - the merge is a file-
// organization change only, not a permissions change; each function
// below still checks the correct entity name for what it's touching.

import FeePayment from "../models/FeePayment.js";
import Student from "../models/Student.js";
import StudentFeeReport from "../models/StudentFeeReport.js";
import { isAllowed } from "../rbac/permissions.js";
import { generateReceiptNo } from "../utils/admissionNumbering.js";
import { resolveBranchQueryFilter } from "../middleware/branchScope.js";

const PAYMENT_ENTITY = "FeePayment";
const REPORT_ENTITY = "StudentFeeReport";

const ROW_TO_FEE_TYPE = {
  school_fee: "School Fee",
  // "School Fee" and "Term Fee" are the same real-world fee and share one
  // report bucket (gross_term_fee/paid_term_fee/balance_term_fee) - both
  // row keys below increment the same balance in collectPayment(). The
  // "Term Fee" label is kept only so payments already tagged that way
  // stay valid; the Fee Payments form no longer has a separate input for it.
  term_fee: "Term Fee",
  admission_fee: "Admission Fee",
  previous_due: "Previous Due",
  application_fee: "Application Fee",
  transport_fee: "Transport Fee",
  registration_fee: "Registration Fee",
  hostel_fee: "Hostel Fee",
};

// Which StudentFeeReport field caps each row's amount in collectPayment() -
// "previous_due" is handled separately (it caps against `old_fee`, a flat
// number, not a balance_*_fee bucket field).
const ROW_TO_BALANCE_FIELD = {
  school_fee: "balance_term_fee",
  term_fee: "balance_term_fee",
  admission_fee: "balance_adm_fee",
  application_fee: "balance_application_fee",
  transport_fee: "balance_transport_fee",
  registration_fee: "balance_registration_fee",
  hostel_fee: "balance_hostel_fee",
};

// Which has_*_fee flag and gross/concession/paid fields belong to each
// bucket - used to zero out a bucket's numbers whenever it's turned off,
// so stale data from a previously-enabled bucket never lingers.
const FEE_BUCKETS = {
  admission: {
    flag: "has_admission_fee",
    fields: ["adm_gross_fee", "adm_concession", "paid_adm_fee"],
  },
  term: {
    flag: "has_term_fee",
    fields: ["gross_term_fee", "term_concession", "paid_term_fee"],
  },
  transport: {
    flag: "has_transport_fee",
    fields: ["transport_gross_fee", "transport_concession", "paid_transport_fee"],
  },
  hostel: {
    flag: "has_hostel_fee",
    fields: ["hostel_gross_fee", "hostel_concession", "paid_hostel_fee"],
  },
  application: {
    flag: "has_application_fee",
    fields: ["application_gross_fee", "application_concession", "paid_application_fee"],
  },
  registration: {
    flag: "has_registration_fee",
    fields: [
      "registration_gross_fee",
      "registration_concession",
      "paid_registration_fee",
    ],
  },
};

function sanitizeFeeBuckets(target) {
  for (const { flag, fields } of Object.values(FEE_BUCKETS)) {
    if (!target[flag]) {
      for (const field of fields) target[field] = 0;
    }
  }
}

// paid_*_fee only ever moves through collectPayment() - createReport/
// updateReport must never let a client set it directly, or the number
// drifts from the actual FeePayment history with no receipt behind it.
const PAID_FIELDS = [
  "paid_adm_fee",
  "paid_term_fee",
  "paid_transport_fee",
  "paid_hostel_fee",
  "paid_application_fee",
  "paid_registration_fee",
];

function stripPaidFields(body) {
  for (const field of PAID_FIELDS) delete body[field];
}

const forbidden = (res, entity, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} ${entity === PAYMENT_ENTITY ? "fee payments" : "fee reports"}.`,
  });

// ---------------------------------------------------------------------
// FeePayment - individual payment transactions
// ---------------------------------------------------------------------

// GET /api/fee-payments
// params (all optional): student_id, academic_year, status, sort, limit, from, to,
// branch, search (matches student_name), and page - when page is present the
// response also carries a `meta` block ({ total, page, limit, totalPages });
// when it's omitted (existing callers), the endpoint behaves as before
// (limit alone is still a plain cap).
export const listPayments = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "read", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "view");

    const {
      student_id,
      academic_year,
      status,
      sort,
      limit,
      page,
      from,
      to,
      search,
      branch,
    } = req.query;
    const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    if (student_id) filter.student_id = student_id;
    if (academic_year) filter.academic_year = academic_year;
    if (status) filter.status = status;
    if (from || to) {
      filter.payment_date = {};
      if (from) filter.payment_date.$gte = new Date(from);
      if (to) filter.payment_date.$lte = new Date(to);
    }
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.student_name = re;
    }

    let query = FeePayment.find(filter);
    if (sort) query = query.sort(sort);

    let meta;
    if (page) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const pageSize = Math.max(parseInt(limit, 10) || 25, 1);
      const total = await FeePayment.countDocuments(filter);
      query = query.skip((pageNum - 1) * pageSize).limit(pageSize);
      meta = {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      };
    } else if (limit) {
      query = query.limit(Number(limit));
    }

    const payments = await query.lean();
    return res.json({ success: true, data: payments, ...(meta && { meta }) });
  } catch (err) {
    console.error("fee.listPayments error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch fee payments." });
  }
};

// GET /api/fee-payments/payments-summary  (same filters as listPayments,
// minus page/limit) - total collected via a Mongo aggregation, so
// BPFees.jsx's "Total Collected" card never requires fetching every
// FeePayment row into the browser.
export const paymentsSummary = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "read", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "view");

    const { student_id, academic_year, status, from, to, search, branch } = req.query;
    const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    if (student_id) filter.student_id = student_id;
    if (academic_year) filter.academic_year = academic_year;
    if (status) filter.status = status;
    if (from || to) {
      filter.payment_date = {};
      if (from) filter.payment_date.$gte = new Date(from);
      if (to) filter.payment_date.$lte = new Date(to);
    }
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.student_name = re;
    }

    const [result] = await FeePayment.aggregate([
      { $match: { ...filter, status: "Paid" } },
      { $group: { _id: null, count: { $sum: 1 }, total_collected: { $sum: "$amount" } } },
    ]);

    return res.json({
      success: true,
      data: {
        count: result?.count || 0,
        total_collected: result?.total_collected || 0,
      },
    });
  } catch (err) {
    console.error("fee.paymentsSummary error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch payments summary." });
  }
};

// GET /api/fee-payments/pending-summary
// Powers the pending-fee cards/list folded into the Fee Payments page -
// total collected, total pending, and a list of students with pending fees.
export const pendingSummary = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "read", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "view");

    const { allowed, filter } = resolveBranchQueryFilter(req.user, req.query.branch);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    if (req.query.academic_year) filter.academic_year = req.query.academic_year;

    const all = await FeePayment.find(filter).lean();
    const totalCollected = all
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + (f.amount || 0), 0);
    const totalPending = all
      .filter((f) => f.status === "Pending")
      .reduce((sum, f) => sum + (f.amount || 0), 0);
    const pendingRecords = all.filter((f) => f.status === "Pending");

    return res.json({
      success: true,
      data: {
        total_collected: totalCollected,
        total_pending: totalPending,
        pending: pendingRecords,
      },
    });
  } catch (err) {
    console.error("fee.pendingSummary error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending fee summary.",
    });
  }
};

// POST /api/fee-payments - single ad-hoc record, not tied to a fee report
// row. Prefer collectPayment() for the Fee Payments page's actual flow.
export const createPayment = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "create", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "create");

    const branch = req.user.branch || req.body.branch;
    if (!branch) {
      return res
        .status(400)
        .json({ success: false, message: "A branch is required." });
    }

    const receipt_no = req.body.receipt_no || (await generateReceiptNo(branch));
    const record = await FeePayment.create({ ...req.body, branch, receipt_no });

    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A payment with that receipt number already exists.",
        details: err.keyValue,
      });
    }
    console.error("fee.createPayment error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to record fee payment." });
  }
};

export const collectPayment = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "create", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "create");

    const {
      student_fee_report_id,
      student_id,
      student_name,
      academic_year,
      payment_date,
      voucher_type,
      payment_mode,
      cheque_date,
      transaction_no,
      bank_name,
      bank_branch,
      rows,
    } = req.body;

    if (!student_id || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "student_id and at least one fee row with an amount are required.",
      });
    }
    for (const row of rows) {
      if (!ROW_TO_FEE_TYPE[row.key] || !(Number(row.amount) > 0)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid row: each row needs a valid key and a positive amount.",
        });
      }
    }

    // req.user.branch wins whenever it's present - same hardening as
    // createPayment() above, so a single-branch accounts manager can't
    // submit a payment against a different branch than their own.
    const branch = req.user.branch || req.body.branch;
    if (!branch) {
      return res
        .status(400)
        .json({ success: false, message: "A branch is required." });
    }

    const { allowed: reportAllowed, filter: reportFilter } =
      resolveBranchQueryFilter(req.user);
    if (!reportAllowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    reportFilter._id = student_fee_report_id;
    const report = await StudentFeeReport.findOne(reportFilter);
    if (!report) {
      return res.status(404).json({
        success: false,
        message:
          "No fee report found for this student - set one up before recording a payment.",
      });
    }

    // Cap every row at the report's actual remaining balance for that
    // bucket, before creating any FeePayment docs - a row can't collect
    // more than is actually owed. Tracked as a running "remaining" total
    // per bucket in case more than one row ever targets the same bucket
    // in a single call.
    const remaining = {};
    for (const row of rows) {
      const amount = Number(row.amount);
      if (row.key === "previous_due") {
        if (remaining.old_fee === undefined) remaining.old_fee = report.old_fee || 0;
        if (amount > remaining.old_fee) {
          return res.status(400).json({
            success: false,
            message: `Previous Due amount (₹${amount}) exceeds the outstanding balance (₹${remaining.old_fee}).`,
          });
        }
        remaining.old_fee -= amount;
        continue;
      }
      const balanceField = ROW_TO_BALANCE_FIELD[row.key];
      if (remaining[balanceField] === undefined)
        remaining[balanceField] = report[balanceField] || 0;
      if (amount > remaining[balanceField]) {
        return res.status(400).json({
          success: false,
          message: `${ROW_TO_FEE_TYPE[row.key]} amount (₹${amount}) exceeds the outstanding balance (₹${remaining[balanceField]}).`,
        });
      }
      remaining[balanceField] -= amount;
    }

    const receipt_no = req.body.receipt_no || (await generateReceiptNo(branch));

    const sharedFields = {
      branch,
      student_id,
      student_name,
      academic_year,
      payment_date,
      payment_mode,
      voucher_type,
      receipt_no,
      status: "Paid",
      cheque_date: cheque_date || undefined,
      transaction_no: transaction_no || undefined,
      bank_name: bank_name || undefined,
      bank_branch: bank_branch || undefined,
    };

    const payments = [];
    for (const row of rows) {
      const amount = Number(row.amount);
      const payment = await FeePayment.create({
        ...sharedFields,
        fee_type: ROW_TO_FEE_TYPE[row.key],
        amount,
      });
      payments.push(payment);

      if (row.key === "school_fee" || row.key === "term_fee") {
        report.paid_term_fee = (report.paid_term_fee || 0) + amount;
      } else if (row.key === "admission_fee") {
        report.paid_adm_fee = (report.paid_adm_fee || 0) + amount;
      } else if (row.key === "previous_due") {
        report.old_fee = Math.max(0, (report.old_fee || 0) - amount);
      } else if (row.key === "transport_fee") {
        report.paid_transport_fee = (report.paid_transport_fee || 0) + amount;
      } else if (row.key === "hostel_fee") {
        report.paid_hostel_fee = (report.paid_hostel_fee || 0) + amount;
      } else if (row.key === "application_fee") {
        report.paid_application_fee =
          (report.paid_application_fee || 0) + amount;
      } else if (row.key === "registration_fee") {
        report.paid_registration_fee =
          (report.paid_registration_fee || 0) + amount;
      }
    }

    await report.save(); // triggers pre-validate recompute of net/balance fields

    return res.status(201).json({ success: true, data: { payments, report } });
  } catch (err) {
    console.error("fee.collectPayment error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to record payment." });
  }
};

// PUT /api/fee-payments/:id
// Used both for general edits and for cancelling a voucher
// (body: { status: "Cancelled" }).
export const updatePayment = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "update", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "update");

    const { allowed, filter } = resolveBranchQueryFilter(req.user);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    filter._id = req.params.id;
    const existing = await FeePayment.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Fee payment not found." });
    }

    Object.assign(existing, req.body);
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("fee.updatePayment error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update fee payment." });
  }
};

// DELETE /api/fee-payments/:id
export const removePayment = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "delete", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "delete");

    const { allowed, filter } = resolveBranchQueryFilter(req.user);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    filter._id = req.params.id;
    const existing = await FeePayment.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Fee payment not found." });
    }

    await existing.deleteOne();
    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("fee.removePayment error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete fee payment." });
  }
};

// ---------------------------------------------------------------------
// StudentFeeReport - a student's fee structure (owed / paid / balance)
// ---------------------------------------------------------------------

// Shared by listReports/reportSummary so the two endpoints can never drift
// apart on what "the current filter set" means. Returns { allowed, filter }
// same shape as resolveBranchQueryFilter; `filter` is ready to hand straight
// to StudentFeeReport.find()/countDocuments()/aggregate($match).
function buildReportFilter(req) {
  const {
    student_id,
    class: cls,
    status,
    student_type,
    has_old_fee,
    has_balance,
    search,
    branch,
  } = req.query;
  const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
  if (!allowed) return { allowed, filter };

  if (student_id) filter.student_id = student_id;
  if (cls) filter.class = cls;
  if (status) filter.status = status;
  if (student_type) filter.student_type = student_type;
  if (has_old_fee === "true") filter.old_fee = { $gt: 0 };
  else if (has_old_fee === "false")
    filter.$or = [{ old_fee: { $lte: 0 } }, { old_fee: { $exists: false } }];
  if (has_balance === "true") filter.balance_term_fee = { $gt: 0 };
  else if (has_balance === "false") filter.balance_term_fee = { $lte: 0 };
  if (search) {
    // Escape regex metacharacters - this is user-typed search text, not a
    // pattern the caller controls intentionally.
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    // Kept as $and (not overwriting $or above) so has_old_fee=false and a
    // search term can both apply at once without one clobbering the other.
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ student_name: re }, { mob_number: re }] },
    ];
  }
  return { allowed: true, filter };
}

// GET /api/student-fee-reports  (list, branch-scoped)
// params (all optional): student_id, class, status, student_type, has_old_fee,
// has_balance, search (matches student_name/mob_number), sort, branch, and
// page/limit - when page is present the response also carries a `meta` block
// ({ total, page, limit, totalPages }); when it's omitted (existing callers),
// the endpoint behaves as before (limit alone is still a plain cap).
export const listReports = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "read", req.user.role))
      return forbidden(res, REPORT_ENTITY, "view");

    const { sort, limit, page } = req.query;
    const { allowed, filter } = buildReportFilter(req);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }

    let query = StudentFeeReport.find(filter).populate(
      "student_id",
      "admission_no full_name",
    );
    if (sort) query = query.sort(sort);

    let meta;
    if (page) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const pageSize = Math.max(parseInt(limit, 10) || 25, 1);
      const total = await StudentFeeReport.countDocuments(filter);
      query = query.skip((pageNum - 1) * pageSize).limit(pageSize);
      meta = {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      };
    } else if (limit) {
      query = query.limit(Number(limit));
    }

    const records = await query.lean();
    // .lean() skips Mongoose's own default-application on hydration, so
    // reports created before the has_*_fee flags existed come back with
    // those keys simply absent - backfill them here (Admission/Term always
    // applied historically; Transport/Application/Registration never did).
    const normalized = records.map((r) => ({
      ...r,
      has_admission_fee: r.has_admission_fee ?? true,
      has_term_fee: r.has_term_fee ?? true,
      has_transport_fee: r.has_transport_fee ?? false,
      has_hostel_fee: r.has_hostel_fee ?? false,
      has_application_fee: r.has_application_fee ?? false,
      has_registration_fee: r.has_registration_fee ?? false,
    }));
    return res.json({ success: true, data: normalized, ...(meta && { meta }) });
  } catch (err) {
    console.error("fee.listReports error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch fee reports." });
  }
};

// GET /api/student-fee-reports/report-summary  (same filters as listReports,
// minus page/limit/sort) - returns aggregate totals across every MATCHING
// report, not just the current page, without ever pulling the rows into
// Node. Mirrors StudentFeeReport.jsx's old client-side summaryTotals/totals
// useMemo (net_fee/paid_fee/balance_fee summed across all 6 FEE_BUCKETS).
export const reportSummary = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "read", req.user.role))
      return forbidden(res, REPORT_ENTITY, "view");

    const { allowed, filter } = buildReportFilter(req);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }

    const netFeeFields = [
      "net_adm_fee",
      "net_term_fee",
      "net_transport_fee",
      "net_hostel_fee",
      "net_application_fee",
      "net_registration_fee",
    ];
    const paidFeeFields = [
      "paid_adm_fee",
      "paid_term_fee",
      "paid_transport_fee",
      "paid_hostel_fee",
      "paid_application_fee",
      "paid_registration_fee",
    ];
    const balanceFeeFields = [
      "balance_adm_fee",
      "balance_term_fee",
      "balance_transport_fee",
      "balance_hostel_fee",
      "balance_application_fee",
      "balance_registration_fee",
    ];
    const sumOf = (fields) => ({
      $sum: fields.reduce((acc, f) => ({ $add: [acc, { $ifNull: [`$${f}`, 0] }] }), 0),
    });

    // Per-bucket breakdown (gross/concession/net/paid/balance for each of
    // the 6 FEE_BUCKETS) - powers StudentFeeReport.jsx's table footer TOTALS
    // row, which used to sum the full (unpaginated) `filtered` array
    // in-browser. Keyed to match the frontend's FEE_BUCKETS `key`s exactly.
    const bucketFieldMap = {
      adm: ["adm_gross_fee", "adm_concession", "net_adm_fee", "paid_adm_fee", "balance_adm_fee"],
      term: ["gross_term_fee", "term_concession", "net_term_fee", "paid_term_fee", "balance_term_fee"],
      transport: ["transport_gross_fee", "transport_concession", "net_transport_fee", "paid_transport_fee", "balance_transport_fee"],
      hostel: ["hostel_gross_fee", "hostel_concession", "net_hostel_fee", "paid_hostel_fee", "balance_hostel_fee"],
      application: ["application_gross_fee", "application_concession", "net_application_fee", "paid_application_fee", "balance_application_fee"],
      registration: ["registration_gross_fee", "registration_concession", "net_registration_fee", "paid_registration_fee", "balance_registration_fee"],
    };
    const bucketGroup = {};
    for (const [key, [gross, concession, net, paid, balance]] of Object.entries(bucketFieldMap)) {
      bucketGroup[`${key}_gross`] = { $sum: { $ifNull: [`$${gross}`, 0] } };
      bucketGroup[`${key}_concession`] = { $sum: { $ifNull: [`$${concession}`, 0] } };
      bucketGroup[`${key}_net`] = { $sum: { $ifNull: [`$${net}`, 0] } };
      bucketGroup[`${key}_paid`] = { $sum: { $ifNull: [`$${paid}`, 0] } };
      bucketGroup[`${key}_balance`] = { $sum: { $ifNull: [`$${balance}`, 0] } };
    }

    const [result] = await StudentFeeReport.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          old_fee: { $sum: { $ifNull: ["$old_fee", 0] } },
          net_fee: sumOf(netFeeFields),
          paid_fee: sumOf(paidFeeFields),
          balance_fee: sumOf(balanceFeeFields),
          ...bucketGroup,
        },
      },
    ]);

    const buckets = {};
    for (const key of Object.keys(bucketFieldMap)) {
      buckets[key] = {
        gross: result?.[`${key}_gross`] || 0,
        concession: result?.[`${key}_concession`] || 0,
        net: result?.[`${key}_net`] || 0,
        paid: result?.[`${key}_paid`] || 0,
        balance: result?.[`${key}_balance`] || 0,
      };
    }

    const summary = {
      count: result?.count || 0,
      old_fee: result?.old_fee || 0,
      net_fee: result?.net_fee || 0,
      paid_fee: result?.paid_fee || 0,
      // Matches the client's old computation: old_fee (previous due) is
      // itself an outstanding balance, so it's folded into balance_fee.
      balance_fee: (result?.old_fee || 0) + (result?.balance_fee || 0),
      buckets,
    };

    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error("fee.reportSummary error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch fee report summary." });
  }
};

// POST /api/student-fee-reports
export const createReport = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "create", req.user.role))
      return forbidden(res, REPORT_ENTITY, "create");

    // Branch is always server-derived - never trust req.body.branch.
    const branch = req.user.branch;

    if (!branch) {
      return res
        .status(400)
        .json({ success: false, message: "A branch is required." });
    }

    const payload = { ...req.body, branch };
    stripPaidFields(payload);
    sanitizeFeeBuckets(payload);
    const record = await StudentFeeReport.create(payload);
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("fee.createReport error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create fee report." });
  }
};

// PUT /api/student-fee-reports/:id
export const updateReport = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "update", req.user.role))
      return forbidden(res, REPORT_ENTITY, "update");

    const { allowed, filter } = resolveBranchQueryFilter(req.user);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    filter._id = req.params.id;

    const existing = await StudentFeeReport.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Fee report not found." });
    }

    const updates = { ...req.body };
    if (req.user.role !== "super_admin") delete updates.branch;
    stripPaidFields(updates);

    Object.assign(existing, updates);
    sanitizeFeeBuckets(existing);
    await existing.save(); // triggers pre-validate recompute of net/balance fields
    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("fee.updateReport error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update fee report." });
  }
};

// DELETE /api/student-fee-reports/:id
export const removeReport = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "delete", req.user.role))
      return forbidden(res, REPORT_ENTITY, "delete");

    const { allowed, filter } = resolveBranchQueryFilter(req.user);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    filter._id = req.params.id;

    const existing = await StudentFeeReport.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Fee report not found." });
    }

    await existing.deleteOne();
    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("fee.removeReport error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete fee report." });
  }
};

// Same shape as BPFees.jsx's PENDING_BUCKETS - kept in sync manually since
// bucket field names are schema, not config (see FEE_BUCKETS above).
const PENDING_BUCKETS = [
  { key: "application", hasFlag: "has_application_fee", balanceField: "balance_application_fee", label: "Application Fee" },
  { key: "registration", hasFlag: "has_registration_fee", balanceField: "balance_registration_fee", label: "Registration Fee" },
  { key: "adm", hasFlag: "has_admission_fee", balanceField: "balance_adm_fee", label: "Admission Fee" },
  { key: "term", hasFlag: "has_term_fee", balanceField: "balance_term_fee", label: "Term Fee" },
  { key: "transport", hasFlag: "has_transport_fee", balanceField: "balance_transport_fee", label: "Transport Fee" },
  { key: "hostel", hasFlag: "has_hostel_fee", balanceField: "balance_hostel_fee", label: "Hostel Fee" },
];

// GET /api/student-fee-reports/pending  (paginated, branch-scoped)
// Replaces BPFees.jsx's client-side pendingRows useMemo, which used to
// flatten EVERY fetched Active report into up to 7 rows (old_fee "Previous
// Due" + 6 buckets, only where has_*_fee is true and its balance > 0) in the
// browser. Same flattening, done as a Mongo aggregation instead, so only the
// current page's rows ever leave the database. params (all optional):
// class, search (student_name), branch, page/limit.
export const listPendingFees = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "read", req.user.role))
      return forbidden(res, REPORT_ENTITY, "view");

    const { class: cls, search, branch, page, limit } = req.query;
    const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    filter.status = "Active";
    if (cls) filter.class = cls;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.student_name = re;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 25, 1);

    // Build one candidate row per bucket (plus a synthetic "Previous Due"
    // row for old_fee) via $concatArrays, then $filter out the ones that
    // don't actually qualify (flag off, or nothing owed) before $unwind -
    // this keeps $unwind from ever seeing (and having to drop) null entries.
    const bucketRowExprs = PENDING_BUCKETS.map((b) => ({
      $cond: [
        { $and: [{ $ifNull: [`$${b.hasFlag}`, false] }, { $gt: [{ $ifNull: [`$${b.balanceField}`, 0] }, 0] }] },
        { key: b.key, fee_type: b.label, amount: `$${b.balanceField}` },
        null,
      ],
    }));

    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          _pendingRows: {
            $filter: {
              input: {
                $concatArrays: [
                  [
                    {
                      $cond: [
                        { $gt: [{ $ifNull: ["$old_fee", 0] }, 0] },
                        { key: "old_fee", fee_type: "Previous Due", amount: "$old_fee" },
                        null,
                      ],
                    },
                  ],
                  bucketRowExprs,
                ],
              },
              as: "row",
              cond: { $ne: ["$$row", null] },
            },
          },
        },
      },
      { $unwind: "$_pendingRows" },
      {
        $project: {
          report: "$$ROOT",
          student_id: 1,
          student_name: 1,
          class: 1,
          fee_type: "$_pendingRows.fee_type",
          key: "$_pendingRows.key",
          amount: "$_pendingRows.amount",
        },
      },
      { $sort: { student_name: 1, _id: 1 } },
      {
        $facet: {
          data: [{ $skip: (pageNum - 1) * pageSize }, { $limit: pageSize }],
          totals: [
            { $group: { _id: null, total: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
          ],
        },
      },
    ];

    const [result] = await StudentFeeReport.aggregate(pipeline);
    const rows = result?.data || [];
    const total = result?.totals?.[0]?.total || 0;
    const totalAmount = result?.totals?.[0]?.totalAmount || 0;

    const data = rows.map((r) => ({
      id: `${r.report._id}_${r.key}`,
      report: r.report,
      student_id: r.student_id,
      student_name: r.student_name,
      class: r.class,
      fee_type: r.fee_type,
      amount: r.amount,
    }));

    return res.json({
      success: true,
      data,
      meta: {
        total,
        totalAmount,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    });
  } catch (err) {
    console.error("fee.listPendingFees error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch pending fees." });
  }
};

// GET /api/student-fee-reports/eligible-students?class=<classId>&search=<name>
export const listEligibleStudents = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "read", req.user.role))
      return forbidden(res, REPORT_ENTITY, "view");

    const { class: classId, search } = req.query;
    if (!classId) {
      return res
        .status(400)
        .json({ success: false, message: "A class is required." });
    }

    const branch = req.user.branch;
    if (!branch) {
      return res
        .status(400)
        .json({ success: false, message: "A branch is required." });
    }

    const studentFilter = { class: classId, branch, status: "Active" };
    if (search) {
      // FIX: Student has no `name` field - it's `full_name`.
      studentFilter.full_name = { $regex: search, $options: "i" };
    }

    // FIX: Student has no `mobile` field - it's `parent_phone`. `name` and
    // `father_name` don't exist either - they're `full_name`/`parent_name`.
    const students = await Student.find(studentFilter)
      .select(
        "full_name parent_name parent_phone admission_no roll_no class branch",
      )
      .lean();

    if (students.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const studentIds = students.map((s) => s._id);
    const existingReports = await StudentFeeReport.find({
      student_id: { $in: studentIds },
      branch,
    }).lean();
    const reportByStudentId = Object.fromEntries(
      existingReports.map((r) => [String(r.student_id), r]),
    );

    // Response keys stay father_name/mobile (matching StudentFeeReport's own
    // field names) even though the source Student fields are named
    // differently - keeps the frontend/payload contract simple.
    const data = students.map((s) => {
      const existing = reportByStudentId[String(s._id)];
      return {
        student_id: s._id,
        name: s.full_name,
        father_name: s.parent_name,
        mobile: s.parent_phone,
        admission_no: s.admission_no,
        roll_no: s.roll_no,
        class: s.class,
        has_report: !!existing,
        existing_report: existing || null,
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error("fee.listEligibleStudents error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch eligible students." });
  }
};
