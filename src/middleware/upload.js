import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const UPLOAD_ROOT = path.resolve("uploads");

// Subfolder per category keeps the disk organized and makes it easy to
// reason about retention/backup policies per type later.
const CATEGORY_FOLDERS = {
  students: "students",
  staff: "staff",
  documents: "documents",
  signatures: "documents",
  misc: "documents",
};

for (const folder of new Set(Object.values(CATEGORY_FOLDERS))) {
  fs.mkdirSync(path.join(UPLOAD_ROOT, folder), { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = CATEGORY_FOLDERS[req.params.category] || "documents";
    cb(null, path.join(UPLOAD_ROOT, category));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = crypto.randomBytes(16).toString("hex");
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed.`));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export { UPLOAD_ROOT };
