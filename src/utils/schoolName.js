// Branch.schoolName is free text with no real FK to a School record - this
// is the one place "same school" comparisons normalize it, so every caller
// (transferTeachers today, anything else later) treats it identically.
export const normalizeSchoolName = (s) => String(s ?? "").trim().toLowerCase();
