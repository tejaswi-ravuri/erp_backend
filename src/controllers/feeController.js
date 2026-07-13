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

const forbidden = (res, entity, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} ${entity === PAYMENT_ENTITY ? "fee payments" : "fee reports"}.`,
  });

// ---------------------------------------------------------------------
// FeePayment - individual payment transactions
// ---------------------------------------------------------------------

// GET /api/fee-payments
// params (all optional): student_id, academic_year, status, sort, limit
export const listPayments = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "read", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "view");

    const { student_id, academic_year, status, sort, limit } = req.query;
    const filter = {};
    if (req.user.branch) filter.branch = req.user.branch;
    if (student_id) filter.student_id = student_id;
    if (academic_year) filter.academic_year = academic_year;
    if (status) filter.status = status;

    let query = FeePayment.find(filter);
    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

    const payments = await query.lean();
    return res.json({ success: true, data: payments });
  } catch (err) {
    console.error("fee.listPayments error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch fee payments." });
  }
};

// GET /api/fee-payments/pending-summary
// Powers the pending-fee cards/list folded into the Fee Payments page -
// total collected, total pending, and a list of students with pending fees.
export const pendingSummary = async (req, res) => {
  try {
    if (!isAllowed(PAYMENT_ENTITY, "read", req.user.role))
      return forbidden(res, PAYMENT_ENTITY, "view");

    const filter = {};
    if (req.user.branch) filter.branch = req.user.branch;
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

    const reportFilter = { _id: student_fee_report_id };
    if (req.user.branch) reportFilter.branch = req.user.branch;
    const report = await StudentFeeReport.findOne(reportFilter);
    if (!report) {
      return res.status(404).json({
        success: false,
        message:
          "No fee report found for this student - set one up before recording a payment.",
      });
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

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
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

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
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

// GET /api/student-fee-reports  (list, branch-scoped)
export const listReports = async (req, res) => {
  try {
    if (!isAllowed(REPORT_ENTITY, "read", req.user.role))
      return forbidden(res, REPORT_ENTITY, "view");

    const { student_id, class: cls, status, sort, limit, has_old_fee } =
      req.query;
    const filter = {};
    // FIX: was unconditional (`filter.branch = req.user.branch`), unlike
    // every other list/lookup in this file - aligned to the same
    // `if (req.user.branch)` pattern used everywhere else, so a
    // multi-branch role without a fixed req.user.branch doesn't silently
    // filter on `branch: undefined`.
    if (req.user.branch) filter.branch = req.user.branch;

    if (student_id) filter.student_id = student_id;
    if (cls) filter.class = cls;
    if (status) filter.status = status;
    if (has_old_fee === "true") filter.old_fee = { $gt: 0 };
    else if (has_old_fee === "false")
      filter.$or = [{ old_fee: { $lte: 0 } }, { old_fee: { $exists: false } }];

    let query = StudentFeeReport.find(filter).populate(
      "student_id",
      "admission_no full_name",
    );
    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

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
      has_application_fee: r.has_application_fee ?? false,
      has_registration_fee: r.has_registration_fee ?? false,
    }));
    return res.json({ success: true, data: normalized });
  } catch (err) {
    console.error("fee.listReports error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch fee reports." });
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

    const filter = { _id: req.params.id };
    if (req.user.role !== "super_admin") filter.branch = req.user.branch;

    const existing = await StudentFeeReport.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Fee report not found." });
    }

    const updates = { ...req.body };
    if (req.user.role !== "super_admin") delete updates.branch;

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

    const filter = { _id: req.params.id };
    if (req.user.role !== "super_admin") filter.branch = req.user.branch;

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
