import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";

// GET /api/notifications?all=1
// Scoped inline rather than via rbac/permissions.js - this is simple enough
// (recipient_role+branch or recipient_user_id addressing) that a full
// PERMISSIONS entry would just be indirection. A caller sees whatever
// matches their role+branch (single-branch roles like principal/
// accounts_manager) UNIONed with anything addressed to them by
// recipient_user_id directly (used for multi-branch roles like
// admin_officer, who have no single branch to match on - e.g. the "retry
// this transfer" loop-back in resolve() below).
export const list = asyncHandler(async (req, res) => {
  const or = [{ recipient_user_id: req.user._id }];
  if (req.user.branch) {
    or.push({ recipient_role: req.user.role, branch: req.user.branch });
  }

  const filter = { $or: or, is_deleted: { $ne: true } };
  if (req.query.all !== "1") filter.status = "Open";

  const data = await Notification.find(filter)
    .sort("-created_date")
    .limit(100)
    .lean();
  res.json({ data });
});

// PUT /api/notifications/:id/resolve
export const resolve = asyncHandler(async (req, res) => {
  const notif = await Notification.findOne({
    _id: req.params.id,
    is_deleted: { $ne: true },
  });
  if (!notif) throw new ApiError(404, "Notification not found.");

  const isRoleOwner =
    notif.recipient_role === req.user.role &&
    String(notif.branch) === String(req.user.branch);
  const isUserOwner =
    notif.recipient_user_id &&
    String(notif.recipient_user_id) === String(req.user._id);
  if (!isRoleOwner && !isUserOwner && req.user.role !== ROLES.ADMIN_OFFICER) {
    throw new ApiError(403, "You cannot resolve this notification.");
  }

  notif.status = "Resolved";
  notif.updated_by = req.user._id;
  await notif.save();

  // When the Principal marks the actionable "reassign these classes" alert
  // done, loop back to whichever Admin Officer started the transfer so
  // they know it's safe to retry - nothing else in the system would tell
  // them the block has cleared.
  if (
    notif.type === "staff_transfer_reassignment" &&
    notif.recipient_role === ROLES.PRINCIPAL &&
    notif.initiated_by
  ) {
    const [teacher, destBranch] = await Promise.all([
      notif.related_staff_id
        ? User.findById(notif.related_staff_id).select("full_name").lean()
        : null,
      notif.destination_branch
        ? Branch.findById(notif.destination_branch).select("name").lean()
        : null,
    ]);
    const teacherName = teacher?.full_name || "The teacher";

    await Notification.create({
      recipient_role: ROLES.ADMIN_OFFICER,
      recipient_user_id: notif.initiated_by,
      branch: notif.branch,
      destination_branch: notif.destination_branch,
      related_staff_id: notif.related_staff_id,
      type: "staff_transfer_retry",
      title: `Ready to retry transferring ${teacherName}`,
      message: destBranch
        ? `${teacherName}'s classes have been reassigned - you can retry transferring them to ${destBranch.name} now.`
        : `${teacherName}'s classes have been reassigned - you can retry the transfer now.`,
      status: "Open",
      updated_by: req.user._id,
    });
  }

  res.json({ success: true, data: notif });
});
