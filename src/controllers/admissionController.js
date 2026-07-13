import Admission, { ADMISSION_CLASS_SOUGHT } from "../models/Admission.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import { isAllowed } from "../rbac/permissions.js";
import {
  generateUniqueId,
  generateApplicationNo,
  generateAdmissionNo,
  generateRollNo,
} from "../utils/admissionNumbering.js";
import { isValidAadhaar } from "../utils/verhoeff.js";
import AdmissionEnquiry from "../models/AdmissionEnquiry.js";

const ENTITY = "Admission";

const forbidden = (res, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} admissions.`,
  });

// GET /api/admissions
export const list = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "read", req.user.role))
      return forbidden(res, "view");

    const filter = {};
    if (req.user.branch) filter.branch = req.user.branch;
    if (req.query.form_status) filter.form_status = req.query.form_status;

    let query = Admission.find(filter)
      .populate("branch", "name code")
      .populate("class_sought", "grade");

    if (req.query.sort) query = query.sort(req.query.sort);
    if (req.query.limit) query = query.limit(Number(req.query.limit));

    const admissions = await query.lean();

    return res.json({
      success: true,
      data: admissions,
    });
  } catch (err) {
    console.error("admissions.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch admissions." });
  }
};

// POST /api/admissions
export const create = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "create", req.user.role))
      return forbidden(res, "create");

    // req.user.branch wins whenever it's present (SINGLE_BRANCH_ROLES,
    // e.g. accounts_manager) - a client can no longer submit a different
    // branch id than the one they're actually scoped to. req.body.branch
    // is only used as a fallback for MULTI_BRANCH_ROLES who don't carry a
    // fixed req.user.branch.
    const branch = req.user.branch || req.body.branch;
    if (!branch) {
      return res
        .status(400)
        .json({ success: false, message: "A branch is required." });
    }

    const [unique_id, application_no] = await Promise.all([
      generateUniqueId(),
      generateApplicationNo(branch),
    ]);

    const doc = await Admission.create({
      ...req.body,
      branch,
      unique_id,
      application_no,
      added_by: req.user.id,
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A duplicate unique identifier was generated - please retry.",
        details: err.keyValue,
      });
    }
    console.error("admissions.create error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create admission." });
  }
};

// PUT /api/admissions/:id
export const update = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "update");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const existing = await Admission.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Admission not found." });
    }

    // Defense in depth: once past the draft stage, aadhaar must actually
    // be a valid (Verhoeff-checksummed) 12-digit number, matching the
    // frontend's stricter "isSubmit" validation.
    const nextStatus = req.body.form_status || existing.form_status;
    if (nextStatus !== "Enquiry" && nextStatus !== "Applied") {
      const aadhaar = req.body.aadhaar_no ?? existing.aadhaar_no;
      if (!isValidAadhaar(aadhaar)) {
        return res.status(400).json({
          success: false,
          message: "A valid Aadhaar number is required at this stage.",
        });
      }
    }

    // unique_id/application_no/admission_no are never client-editable.
    const { unique_id, application_no, admission_no, ...safeBody } = req.body;
    Object.assign(existing, safeBody);
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("admissions.update error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update admission." });
  }
};

// DELETE /api/admissions/:id
export const remove = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "delete", req.user.role))
      return forbidden(res, "delete");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const existing = await Admission.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Admission not found." });
    }
    if (
      existing.form_status !== "Enquiry" &&
      existing.form_status !== "Rejected"
    ) {
      return res.status(400).json({
        success: false,
        message: "Only Enquiry or Rejected applications can be deleted.",
      });
    }

    await existing.deleteOne();
    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("admissions.remove error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete admission." });
  }
};

// Shared by admit() and convert() - resolves class_sought to a real
// Class document and creates the Student record. Does NOT touch the
// Admission document itself - callers handle that (different callers
// need different admission-side updates).
//
// FIXED: this used to re-derive a "grade" string via an unawaited async
// helper (classSoughtToGrade), then re-query Class.findOne({grade,
// branch, academic_year}) to find... the same class admission.class_sought
// already pointed at. Two bugs in one: the missing `await` meant `grade`
// was a pending Promise (so the query never matched anything and this
// ALWAYS threw "No Class found..."), and the re-lookup was redundant to
// begin with - class_sought is already the Class _id. Just use it directly.
async function createStudentFromAdmission(admission, admissionNo) {
  const classDoc = await Class.findById(admission.class_sought);
  if (!classDoc) {
    throw new Error(
      `Class not found for id "${admission.class_sought}" - this admission's class_sought may be stale or invalid.`,
    );
  }

  // Guard-rail: the class this admission points to should belong to the
  // admission's own branch. Catches a stale class_sought (e.g. academic
  // year was changed on the admission after the class was picked)
  // instead of silently creating a student in the wrong branch's class.
  if (String(classDoc.branch) !== String(admission.branch)) {
    throw new Error(
      "The admission's class does not belong to its own branch - please re-select the class before admitting.",
    );
  }

  const roll_no = await generateRollNo(classDoc._id);

  const student = await Student.create({
    full_name: admission.student_name,
    admission_no: admissionNo,
    class: classDoc._id,
    roll_no,
    gender: admission.gender,
    dob: admission.dob,
    blood_group: admission.blood_group || undefined,
    parent_name: admission.father_name,
    parent_phone: admission.father_mobile,
    parent_email: admission.father_email || undefined,
    branch: admission.branch,
    address: admission.communication_address || undefined,
    joining_date: new Date().toISOString().split("T")[0],
    status: "Active",
  });

  return student;
}

// POST /api/admissions/:id/admit
export const admit = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "admit");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const admission = await Admission.findOne(filter);
    if (!admission) {
      return res
        .status(404)
        .json({ success: false, message: "Admission not found." });
    }
    if (admission.student_id) {
      return res.status(400).json({
        success: false,
        message:
          "This admission has already been converted to a student record.",
      });
    }
    if (!isValidAadhaar(admission.aadhaar_no)) {
      return res.status(400).json({
        success: false,
        message: "A valid Aadhaar number is required before admitting.",
      });
    }

    const admission_no = await generateAdmissionNo(admission.branch);
    const student = await createStudentFromAdmission(admission, admission_no);

    admission.form_status = "Admitted";
    admission.admission_no = admission_no;
    admission.student_id = student._id;
    await admission.save();

    return res.json({ success: true, data: { admission, student } });
  } catch (err) {
    console.error("admissions.admit error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to admit student.",
    });
  }
};

// POST /api/admissions/:id/convert
// Fallback for records already marked "Admitted" with no linked student
// (e.g. legacy data, or status was changed to Admitted directly without
// going through admit()) - idempotent, no-ops if a student is already
// linked.
export const convert = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "convert");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const admission = await Admission.findOne(filter);
    if (!admission) {
      return res
        .status(404)
        .json({ success: false, message: "Admission not found." });
    }
    if (admission.form_status !== "Admitted") {
      return res.status(400).json({
        success: false,
        message:
          "Only Admitted applications can be converted to a student record.",
      });
    }
    if (admission.student_id) {
      return res.status(200).json({
        success: true,
        message: "Already converted.",
        data: { student_id: admission.student_id },
      });
    }

    const admissionNo =
      admission.admission_no || (await generateAdmissionNo(admission.branch));
    const student = await createStudentFromAdmission(admission, admissionNo);

    admission.admission_no = admissionNo;
    admission.student_id = student._id;
    await admission.save();

    return res.json({ success: true, data: { admission, student } });
  } catch (err) {
    console.error("admissions.convert error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to convert to student.",
    });
  }
};

export const addApplicationEnquiry = async (req, res) => {
  try {
    const requiredFields = [
      "id",
      "studentName",
      "branch",
      "mobile",
      "academicYear",
      "status",
      "date",
      "fatherName",
      "className",
      "board",
      "emailId",
      "addressLine1",
      "landmark",
      "city",
      "district",
      "state",
      "previousSchool",
      "enquiryType",
      "proName",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    req.body.applicationid = req.body.id;
    delete req.body.id;

    const existingEnquiry = await AdmissionEnquiry.findOne({
      applicationid: req.body.applicationid,
    });

    if (existingEnquiry) {
      Object.assign(existingEnquiry, req.body);
      await existingEnquiry.save();
      return res.status(200).json({
        success: true,
        message: "Application enquiry updated successfully.",
        data: existingEnquiry,
      });
    }

    const enquiryData = {
      ...req.body,
      added_by: req.user.id,
    };

    const enquiry = await AdmissionEnquiry.create(enquiryData);

    return res.status(201).json({ success: true, data: enquiry });
  } catch (err) {
    console.error("admissions.addApplicationEnquiry error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add application enquiry.",
    });
  }
};

export const deleteApplicationEnquiry = async (req, res) => {
  try {
    const enquiryId = req.params.id;

    const enquiry = await AdmissionEnquiry.findById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Application enquiry not found.",
      });
    }

    await enquiry.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Application enquiry deleted successfully.",
      data: { _id: enquiryId },
    });
  } catch (err) {
    console.error("admissions.deleteApplicationEnquiry error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete application enquiry.",
    });
  }
};

export const getApplicationEnquiryById = async (req, res) => {
  try {
    const enquiry = await AdmissionEnquiry.findById(req.params.id);
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Application enquiry not found.",
      });
    }

    if (req.user.branch && enquiry.branch !== req.user.branch) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this enquiry.",
      });
    }

    return res.status(200).json({ success: true, data: enquiry });
  } catch (err) {
    console.error("admissions.getApplicationEnquiryById error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch application enquiry.",
    });
  }
};

export const updateApplicationEnquiry = async (req, res) => {
  try {
    const enquiryId = req.params.id;

    const enquiry = await AdmissionEnquiry.findById(enquiryId);
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Application enquiry not found.",
      });
    }

    if (req.user.branch && enquiry.branch !== req.user.branch) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this enquiry.",
      });
    }

    const requiredFields = [
      "studentName",
      "branch",
      "mobile",
      "academicYear",
      "status",
      "date",
      "fatherName",
      "className",
      "board",
      "emailId",
      "addressLine1",
      "landmark",
      "city",
      "district",
      "state",
      "previousSchool",
      "enquiryType",
      "proName",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    Object.assign(enquiry, req.body);
    await enquiry.save();

    return res.status(200).json({
      success: true,
      message: "Application enquiry updated successfully.",
      data: enquiry,
    });
  } catch (err) {
    console.error("admissions.updateApplicationEnquiry error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update application enquiry.",
    });
  }
};

export const listApplicationEnquiries = async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.academicYear) {
      filter.academicYear = req.query.academicYear;
    }
    if (req.query.className) {
      filter.className = req.query.className;
    }
    if (req.query.branch) {
      filter.branch = req.query.branch;
    }

    let query = AdmissionEnquiry.find(filter);

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query = query.or([
        { studentName: searchRegex },
        { applicationid: searchRegex },
        { mobile: searchRegex },
        { fatherName: searchRegex },
      ]);
    }

    query = query.sort({ createdAt: -1, date: -1 });

    if (req.query.page && req.query.limit) {
      const page = parseInt(req.query.page);
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;
      query = query.skip(skip).limit(limit);
    } else if (req.query.limit) {
      query = query.limit(parseInt(req.query.limit));
    }

    const enquiries = await query.exec();
    const total = await AdmissionEnquiry.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: enquiries,
      pagination: {
        total,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || enquiries.length,
        pages: Math.ceil(
          total / (parseInt(req.query.limit) || enquiries.length || 1),
        ),
      },
    });
  } catch (err) {
    console.error("admissions.listApplicationEnquiries error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch application enquiries.",
    });
  }
};

export const CLASS_SOUGHT_OPTIONS = ADMISSION_CLASS_SOUGHT;
