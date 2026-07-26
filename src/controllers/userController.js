import mongoose from "mongoose";
import User from "../models/User.js";
import Class from "../models/Class.js";
import Notification from "../models/Notification.js";
import {
  ROLES,
  SINGLE_BRANCH_ROLES,
  MULTI_BRANCH_ROLES,
} from "../config/constants.js";
import { isAllowed } from "../rbac/permissions.js";
import { resolveBranchQueryFilter } from "../middleware/branchScope.js";
import Branch from "../models/Branch.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { normalizeSchoolName } from "../utils/schoolName.js";

const ENTITY = "User";

const forbidden = (res, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} users.`,
  });

// Which roles a creator may assign to a brand-new staff account. Admin
// Officer manages branch-level leadership across the org (Principal,
// Accounts Manager); Accounts Manager only ever adds Teachers into their
// own branch. Principal and super_admin are intentionally left out of
// this map - their existing (broader) ability to create users is
// unchanged, since only these two roles' scopes were narrowed.
const ASSIGNABLE_ROLES_ON_CREATE = {
  [ROLES.ADMIN_OFFICER]: [ROLES.PRINCIPAL, ROLES.ACCOUNTS_MANAGER],
  [ROLES.ACCOUNTS_MANAGER]: [ROLES.TEACHER],
};

// GET /api/users
export const list = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "read", req.user.role))
      return forbidden(res, "view");

    const { role, exclude_role, branch } = req.query;
    if (role === ROLES.STUDENT) {
      return res.status(400).json({
        success: false,
        message: "Student accounts aren't accessible via this endpoint.",
      });
    }

    const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to that branch.",
      });
    }
    if (req.user.role === ROLES.PRINCIPAL) {
      // Principal's Staff page only ever shows Teachers (editable) and
      // Accounts Managers (visible, read-only) - never themselves or any
      // other role, regardless of what the caller asks for.
      filter.role = { $in: [ROLES.TEACHER, ROLES.ACCOUNTS_MANAGER] };
    } else if (req.user.role === ROLES.ACCOUNTS_MANAGER) {
      // Accounts Manager's Staff page shows every other branch staff
      // member, but never the Principal and never themselves - regardless
      // of what the caller asks for.
      filter.role = { $nin: [ROLES.STUDENT, ROLES.PRINCIPAL] };
      filter._id = { $ne: req.user._id };
    } else if (role) {
      filter.role = role;
    } else {
      // Always exclude students by default, on top of whatever else the
      // caller wants excluded.
      const excluded = new Set([ROLES.STUDENT]);
      if (exclude_role) excluded.add(exclude_role);
      filter.role = { $nin: [...excluded] };
    }

    const users = await User.find(filter)
      .populate("delete_requested_by", "full_name")
      .lean();
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error("users.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch users." });
  }
};

// POST /api/users
export const create = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "create", req.user.role))
      return forbidden(res, "create");

    const { role, password } = req.body;
    if (role === ROLES.STUDENT) {
      return res.status(400).json({
        success: false,
        message:
          "Student accounts need the student admission flow, not this endpoint.",
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "A password is required to create a user.",
      });
    }

    const assignableRoles = ASSIGNABLE_ROLES_ON_CREATE[req.user.role];
    if (assignableRoles && !assignableRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Your role can only add: ${assignableRoles
          .map((r) => r.replace("_", " "))
          .join(", ")}.`,
      });
    }

    // Multi-branch roles (admin_officer/super_admin) must only ever use the
    // `branches` array - never `branch` - or resolveBranchQueryFilter would
    // wrongly pin them to a single branch (see branchScope.js). Force it to
    // null here regardless of what req.body/req.user happens to carry.
    const branch = MULTI_BRANCH_ROLES.includes(role)
      ? null
      : req.body.branch || req.user.branch;
    if (SINGLE_BRANCH_ROLES.includes(role) && !branch) {
      return res.status(400).json({
        success: false,
        message: "Please select a branch for this role.",
      });
    }
    const branchDetails = branch ? await Branch.findById(branch) : null;

    // User.create() runs the schema's own pre-save hook, which hashes
    // the password automatically - never hash it again here.
    const doc = await User.create({
      ...req.body,
      branch,
      schoolName: branchDetails?.schoolName || "Master Minds Default",
    });

    return res.status(201).json({ success: true, data: doc.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A user with that email already exists.",
        details: err.keyValue,
      });
    }
    console.error("users.create error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create user." });
  }
};

// PUT /api/users/:id
export const update = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "update");

    const existing = await User.findOne({
      _id: req.params.id,
      role: { $ne: ROLES.STUDENT },
    }).select("+password");
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    if (req.user.role === ROLES.PRINCIPAL && existing.role !== ROLES.TEACHER) {
      return res.status(403).json({
        success: false,
        message: "Principals can only modify Teacher records.",
      });
    }
    if (existing.delete_requested) {
      return res.status(409).json({
        success: false,
        message:
          "This staff member has a pending deactivation request - resolve it before editing.",
      });
    }

    const { password, ...rest } = req.body;
    Object.assign(existing, rest);
    // Same invariant as create(): multi-branch roles must never carry a
    // `branch` value, whether it came in via this update or was already
    // stale on the document, or resolveBranchQueryFilter mis-scopes them.
    if (MULTI_BRANCH_ROLES.includes(existing.role)) {
      existing.branch = null;
    }
    if (password) {
      existing.password = password; // pre-save hook re-hashes this on .save()
    }
    await existing.save();

    return res.json({ success: true, data: existing.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A user with that email already exists.",
        details: err.keyValue,
      });
    }
    console.error("users.update error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update user." });
  }
};

// POST /api/users/transfer-teachers — Admin Officer only (see userRouter.js's
// requireRole gate; stricter than the generic User RBAC rule, which also
// covers principal/accounts_manager).
// body: { teacher_ids: [...ObjectId], destination_branch: <Branch _id> }
//
// Per-teacher partial success (not all-or-nothing like a plain bulk update):
// a teacher who still holds class_teacher_id/subject_teachers duties on any
// non-deleted Class in their CURRENT branch is blocked and notified instead
// of transferring them - the Class model's own branch-guard hook only fires
// when the Class doc is saved, not when a teacher's User.branch changes, so
// nothing else in the system would catch a stale reference left behind by a
// silent transfer. The Principal already has Class-update permission, so
// they get the actionable alert (they can reassign the classes and mark it
// resolved); Accounts Manager gets an informational copy of the same alert.
export const transferTeachers = asyncHandler(async (req, res) => {
  const { teacher_ids, destination_branch } = req.body;
  if (
    !Array.isArray(teacher_ids) ||
    teacher_ids.length === 0 ||
    !destination_branch
  ) {
    throw new ApiError(
      400,
      "teacher_ids (a non-empty array) and destination_branch are required.",
    );
  }

  // req.user.branches is admin_officer's OWN assigned branches - GET
  // /api/branches returns every branch system-wide for multi-branch roles,
  // so the client's dropdown alone can't be trusted to have already scoped
  // this correctly.
  const myBranchIds = new Set((req.user.branches || []).map(String));
  if (!myBranchIds.has(String(destination_branch))) {
    throw new ApiError(403, "You are not assigned to the destination branch.");
  }

  const destBranch = await Branch.findOne({
    _id: destination_branch,
    is_active: { $ne: false },
  }).lean();
  if (!destBranch) {
    throw new ApiError(404, "Destination branch not found or inactive.");
  }

  const teachers = await User.find({
    _id: { $in: teacher_ids },
    role: ROLES.TEACHER,
  }).lean();
  if (teachers.length !== teacher_ids.length) {
    throw new ApiError(
      404,
      "One or more selected staff were not found, or are not teachers.",
    );
  }

  const sourceBranchIds = [...new Set(teachers.map((t) => String(t.branch)))];
  const sourceBranches = await Branch.find({
    _id: { $in: sourceBranchIds },
  }).lean();
  const sourceBranchMap = Object.fromEntries(
    sourceBranches.map((b) => [String(b._id), b]),
  );

  // Structural validation - all-or-nothing (unlike the per-teacher class-duty
  // check below): collect every problem, then reject the whole request if
  // any exist, since these are basic eligibility checks rather than a
  // per-teacher operational state.
  const errors = [];
  for (const t of teachers) {
    const src = sourceBranchMap[String(t.branch)];
    if (!src) {
      errors.push(`${t.full_name}: current branch could not be resolved.`);
      continue;
    }
    if (!myBranchIds.has(String(t.branch))) {
      errors.push(`${t.full_name}: you are not assigned to their current branch.`);
      continue;
    }
    if (String(t.branch) === String(destination_branch)) {
      errors.push(`${t.full_name}: already assigned to the destination branch.`);
      continue;
    }
    if (
      normalizeSchoolName(src.schoolName) !==
      normalizeSchoolName(destBranch.schoolName)
    ) {
      errors.push(`${t.full_name}: destination branch belongs to a different school.`);
    }
  }
  if (errors.length > 0) {
    throw new ApiError(400, errors.join(" "));
  }

  const teacherIds = teachers.map(
    (t) => new mongoose.Types.ObjectId(String(t._id)),
  );
  const activeClasses = await Class.find({
    branch: { $in: sourceBranchIds.map((id) => new mongoose.Types.ObjectId(id)) },
    is_deleted: { $ne: true },
    $or: [
      { class_teacher_id: { $in: teacherIds } },
      { "subject_teachers.teacher_id": { $in: teacherIds } },
    ],
  }).lean();

  // teacherId -> [{ grade, academic_year, role, subject }]
  const dutiesByTeacher = {};
  for (const cls of activeClasses) {
    if (
      cls.class_teacher_id &&
      teacherIds.some((id) => String(id) === String(cls.class_teacher_id))
    ) {
      const key = String(cls.class_teacher_id);
      (dutiesByTeacher[key] ||= []).push({
        grade: cls.grade,
        academic_year: cls.academic_year,
        role: "class_teacher",
      });
    }
    for (const row of cls.subject_teachers || []) {
      if (teacherIds.some((id) => String(id) === String(row.teacher_id))) {
        const key = String(row.teacher_id);
        (dutiesByTeacher[key] ||= []).push({
          grade: cls.grade,
          academic_year: cls.academic_year,
          role: "subject_teacher",
          subject: row.subject,
        });
      }
    }
  }

  const transferred = [];
  const blocked = [];

  for (const t of teachers) {
    const duties = dutiesByTeacher[String(t._id)];
    if (duties && duties.length > 0) {
      const description = duties
        .map((d) =>
          d.role === "class_teacher"
            ? `Class Teacher of ${d.grade} (${d.academic_year})`
            : `${d.subject} teacher for ${d.grade} (${d.academic_year})`,
        )
        .join("; ");
      // Principal gets the actionable copy (they can reassign class_teacher_id/
      // subject_teachers and mark it resolved); Accounts Manager gets an
      // informational copy of the same alert. Each recipient_role is its own
      // Notification document, deduped independently via the upsert filter.
      const notificationIds = [];
      for (const recipientRole of [ROLES.PRINCIPAL, ROLES.ACCOUNTS_MANAGER]) {
        const isPrincipal = recipientRole === ROLES.PRINCIPAL;
        const notif = await Notification.findOneAndUpdate(
          {
            related_staff_id: t._id,
            type: "staff_transfer_reassignment",
            status: "Open",
            recipient_role: recipientRole,
          },
          {
            recipient_role: recipientRole,
            branch: t.branch,
            type: "staff_transfer_reassignment",
            title: isPrincipal
              ? `Reassign classes before transferring ${t.full_name}`
              : `${t.full_name}'s transfer is on hold`,
            message: isPrincipal
              ? `${t.full_name} still holds active class duties and could not be transferred to ${destBranch.name}: ${description}. Reassign these on the Classes page, then mark this notification done - the Admin Officer will be notified to retry the transfer.`
              : `${t.full_name} still holds active class duties (${description}) and could not be transferred to ${destBranch.name}. The Principal has been notified to reassign these classes.`,
            related_staff_id: t._id,
            initiated_by: req.user._id,
            destination_branch: destination_branch,
            status: "Open",
            updated_by: req.user._id,
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        );
        notificationIds.push(notif._id);
      }
      blocked.push({
        _id: t._id,
        full_name: t.full_name,
        branch: t.branch,
        duties,
        notification_ids: notificationIds,
      });
      continue;
    }

    // Conditional single-doc update (not a blind updateMany) so a transfer
    // of the same teacher started elsewhere between validation and here is
    // detected via matchedCount rather than silently overwritten.
    const updateResult = await User.updateOne(
      { _id: t._id, branch: t.branch, role: ROLES.TEACHER },
      {
        branch: destination_branch,
        schoolName: destBranch.schoolName,
        updated_by: req.user._id,
      },
    );
    if (updateResult.matchedCount === 0) {
      blocked.push({
        _id: t._id,
        full_name: t.full_name,
        branch: t.branch,
        duties: [],
        reason: "Branch changed since selection - refresh and try again.",
      });
      continue;
    }

    await Notification.updateMany(
      { related_staff_id: t._id, type: "staff_transfer_reassignment", status: "Open" },
      { status: "Resolved", updated_by: req.user._id },
    );
    transferred.push({
      _id: t._id,
      full_name: t.full_name,
      from_branch: t.branch,
      to_branch: destination_branch,
    });
  }

  res.json({ success: true, transferred, blocked });
});

// DELETE /api/users/:id — soft delete
export const remove = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "delete", req.user.role))
      return forbidden(res, "deactivate");

    // Excludes students - this endpoint can't touch student User docs.
    const existing = await User.findOne({
      _id: req.params.id,
      role: { $ne: ROLES.STUDENT },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }
    if (req.user.role === ROLES.PRINCIPAL && existing.role !== ROLES.TEACHER) {
      return res.status(403).json({
        success: false,
        message: "Principals can only deactivate Teacher records.",
      });
    }
    if (existing.delete_requested) {
      return res.status(409).json({
        success: false,
        message:
          "This staff member has a pending deactivation request - approve or reject it instead.",
      });
    }

    existing.is_active = false;
    await existing.save();

    return res.json({
      success: true,
      data: { _id: existing._id, is_active: false },
    });
  } catch (err) {
    console.error("users.remove error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to deactivate user." });
  }
};

// Deactivation-approval workflow (Accounts Manager -> Principal). An
// Accounts Manager can no longer deactivate staff directly (see
// rbac/permissions.js - ACCOUNTS_MANAGER was removed from User.delete);
// instead they request it, the Principal approves or rejects, and the
// requester can withdraw a still-pending request. Mirrors the
// request-delete/approve-delete/reject-delete pattern already used for
// Expenditure/Income (see expenditureController.js), with Notification
// documents (see models/Notification.js) standing in for the email/inbox
// side of the flow - the same infra the teacher-transfer alerts use.

// POST /api/users/:id/request-delete — Accounts Manager only (route-gated).
export const requestDelete = asyncHandler(async (req, res) => {
  const existing = await User.findOne({
    _id: req.params.id,
    role: { $ne: ROLES.STUDENT },
  });
  if (!existing) throw new ApiError(404, "User not found.");

  if (String(existing._id) === String(req.user._id)) {
    throw new ApiError(400, "You cannot request your own deactivation.");
  }
  if (existing.role === ROLES.PRINCIPAL) {
    throw new ApiError(403, "You cannot request deactivation of a Principal.");
  }
  if (String(existing.branch) !== String(req.user.branch)) {
    throw new ApiError(
      403,
      "You can only request deactivation of staff in your own branch.",
    );
  }
  if (existing.delete_requested) {
    throw new ApiError(
      409,
      "A deactivation request is already pending for this staff member.",
    );
  }

  existing.delete_requested = true;
  existing.delete_requested_by = req.user._id;
  existing.delete_requested_at = new Date();
  await existing.save();

  await Notification.create({
    recipient_role: ROLES.PRINCIPAL,
    branch: existing.branch,
    type: "staff_delete_request",
    related_staff_id: existing._id,
    initiated_by: req.user._id,
    status: "Open",
    title: `Deactivation requested: ${existing.full_name}`,
    message: `${req.user.full_name} has requested to deactivate ${existing.full_name} (${existing.role}). Review it on the Staff page.`,
  });

  res.json({ success: true, data: existing.toSafeJSON() });
});

// POST /api/users/:id/withdraw-delete-request — Accounts Manager only,
// and only the Accounts Manager who submitted the request.
export const withdrawDeleteRequest = asyncHandler(async (req, res) => {
  const existing = await User.findOne({
    _id: req.params.id,
    role: { $ne: ROLES.STUDENT },
  });
  if (!existing) throw new ApiError(404, "User not found.");

  if (!existing.delete_requested) {
    throw new ApiError(
      409,
      "This staff member has no pending deactivation request.",
    );
  }
  if (String(existing.delete_requested_by) !== String(req.user._id)) {
    throw new ApiError(403, "You can only withdraw a request you submitted.");
  }

  existing.delete_requested = false;
  existing.delete_requested_by = null;
  existing.delete_requested_at = null;
  await existing.save();

  await Notification.updateMany(
    {
      related_staff_id: existing._id,
      type: "staff_delete_request",
      status: "Open",
    },
    { status: "Resolved", updated_by: req.user._id },
  );

  res.json({ success: true, data: existing.toSafeJSON() });
});

// POST /api/users/:id/approve-delete — Principal only, own branch only.
export const approveDeleteRequest = asyncHandler(async (req, res) => {
  const existing = await User.findOne({
    _id: req.params.id,
    role: { $ne: ROLES.STUDENT },
  });
  if (!existing) throw new ApiError(404, "User not found.");

  if (String(existing.branch) !== String(req.user.branch)) {
    throw new ApiError(
      403,
      "You can only approve deactivation requests for your own branch.",
    );
  }
  if (!existing.delete_requested) {
    throw new ApiError(
      409,
      "This staff member has no pending deactivation request.",
    );
  }

  const requestedBy = existing.delete_requested_by;

  existing.is_active = false;
  existing.delete_requested = false;
  existing.delete_requested_by = null;
  existing.delete_requested_at = null;
  await existing.save();

  await Notification.updateMany(
    {
      related_staff_id: existing._id,
      type: "staff_delete_request",
      status: "Open",
    },
    { status: "Resolved", updated_by: req.user._id },
  );

  const notifications = [];
  if (requestedBy) {
    notifications.push({
      recipient_role: ROLES.ACCOUNTS_MANAGER,
      recipient_user_id: requestedBy,
      branch: existing.branch,
      type: "staff_delete_approved",
      related_staff_id: existing._id,
      status: "Open",
      title: `Deactivation approved: ${existing.full_name}`,
      message: `Your request to deactivate ${existing.full_name} was approved by the Principal.`,
    });
  }

  // Admin Officer(s) responsible for this branch (User.branches array
  // membership - see branchScope.js, there's no single admin_officer FK on
  // Branch itself) are informed only now, on final approval, not when the
  // request was first submitted.
  const adminOfficers = await User.find({
    role: ROLES.ADMIN_OFFICER,
    branches: existing.branch,
  }).select("_id");
  for (const officer of adminOfficers) {
    notifications.push({
      recipient_role: ROLES.ADMIN_OFFICER,
      recipient_user_id: officer._id,
      branch: existing.branch,
      type: "staff_delete_notice",
      related_staff_id: existing._id,
      status: "Open",
      title: `Staff deactivated: ${existing.full_name}`,
      message: `${existing.full_name} (${existing.role}) was deactivated by the Principal following an Accounts Manager's request.`,
    });
  }
  if (notifications.length) await Notification.insertMany(notifications);

  res.json({
    success: true,
    data: { _id: existing._id, is_active: false },
  });
});

// POST /api/users/:id/reject-delete — Principal only, own branch only.
export const rejectDeleteRequest = asyncHandler(async (req, res) => {
  const existing = await User.findOne({
    _id: req.params.id,
    role: { $ne: ROLES.STUDENT },
  });
  if (!existing) throw new ApiError(404, "User not found.");

  if (String(existing.branch) !== String(req.user.branch)) {
    throw new ApiError(
      403,
      "You can only reject deactivation requests for your own branch.",
    );
  }
  if (!existing.delete_requested) {
    throw new ApiError(
      409,
      "This staff member has no pending deactivation request.",
    );
  }

  const requestedBy = existing.delete_requested_by;

  existing.delete_requested = false;
  existing.delete_requested_by = null;
  existing.delete_requested_at = null;
  await existing.save();

  await Notification.updateMany(
    {
      related_staff_id: existing._id,
      type: "staff_delete_request",
      status: "Open",
    },
    { status: "Resolved", updated_by: req.user._id },
  );

  if (requestedBy) {
    await Notification.create({
      recipient_role: ROLES.ACCOUNTS_MANAGER,
      recipient_user_id: requestedBy,
      branch: existing.branch,
      type: "staff_delete_declined",
      related_staff_id: existing._id,
      status: "Open",
      title: `Deactivation declined: ${existing.full_name}`,
      message: `Your request to deactivate ${existing.full_name} was declined by the Principal.`,
    });
  }

  res.json({ success: true, data: existing.toSafeJSON() });
});
