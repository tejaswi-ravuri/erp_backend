import Staff from "../models/Staff.js";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const DEFAULT_TEACHER_PASSWORD = "1234567890";

function slugify(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function generateUniqueTeacherEmail(branch, fullName) {
  const branchSlug = slugify(branch);
  const nameSlug = slugify(fullName);
  let suffix = "";
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const email = `${branchSlug}.${nameSlug}${suffix}@masterminds.com`;
    const existing = await User.findOne({ email });
    if (!existing) return email;
    counter += 1;
    suffix = String(counter);
  }
}

// GET /api/public/branches
// Mirrors entities.Branch.list() but reachable with no session - the
// authenticated /api/entities/Branch route is useless to an anonymous
// visitor on a public registration page.
export const listPublicBranches = asyncHandler(async (req, res) => {
  console.log("hitting---");
  const branches = await Branch.find({
    is_active: { $ne: false },
  }).lean();

  res.json(branches);
});

export const registerTeacher = asyncHandler(async (req, res) => {
  try {
    const {
      registration_code,
      full_name,
      branch,
      phone,
      subjects,
      classes_taught,
      qualification,
      role,
    } = req.body;

    console.log(req.body);

    if (!full_name || !branch || !phone) {
      throw new Error("full_name, branch and phone are required.");
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw new Error("Phone must be a valid 10-digit mobile number.");
    }

    if (!Array.isArray(subjects) || subjects.length === 0) {
      throw new Error("Select at least one subject.");
    }

    if (!Array.isArray(classes_taught) || classes_taught.length === 0) {
      throw new Error("Select at least one class.");
    }

    const branchDoc = await Branch.findById(branch);
    console.log(branchDoc);
    if (!branchDoc) {
      throw new Error("Branch not found.");
    }

    const existingPhone = await Staff.findOne({
      phone,
      is_deleted: { $ne: true },
    });

    if (existingPhone) {
      throw new Error("Phone number already exists.");
    }

    const staff = await Staff.create({
      full_name,
      branch: branchDoc._id,
      phone,
      subjects,
      classes_taught,
      qualification,
      role: "teacher",
      status: "Active",
      joining_date: new Date(),
    });

    const email = await generateUniqueTeacherEmail(branchDoc.name, full_name);
    console.log("Creating user with:", {
      full_name,
      email,
      branch: branchDoc._id,
    });
    const user = await User.create({
      full_name,
      email,
      password: DEFAULT_TEACHER_PASSWORD,
      role: "teacher",
      branch: branchDoc._id,
      phone,
      linked_staff_id: staff._id,
      subjects,
    });
    console.log(user);
    res.status(201).json({
      staff,
      user,
      login: {
        email,
        password: DEFAULT_TEACHER_PASSWORD,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
      stack: err.stack, // remove this in production
    });
  }
});
