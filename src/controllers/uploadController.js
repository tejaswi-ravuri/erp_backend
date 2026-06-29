import { cloudinary, isCloudinaryEnabled } from "../config/cloudinary.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Upload strategy (per product decision):
 *   1. File is ALWAYS saved to local disk first (via multer, before this handler runs).
 *      This is the primary, source-of-truth copy and the one the app serves from.
 *   2. We THEN attempt a backup copy to Cloudinary, but this is best-effort:
 *      - If Cloudinary isn't configured, we skip it silently.
 *      - If the Cloudinary upload fails (network, quota, etc.), we log a
 *        warning and still return success, because the local file is safe.
 *   The response always includes `file_url` (local, what the app should use)
 *   and `backup_url` (Cloudinary, null if unavailable) for transparency.
 */
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file was uploaded. Field name must be 'file'.");
  }

  const category = req.params.category || "documents";
  const localPath = `/uploads/${categoryFolder(category)}/${req.file.filename}`;
  const file_url = `${req.protocol}://${req.get("host")}${localPath}`;

  let backup_url = null;
  if (isCloudinaryEnabled) {
    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: `masterminds-erp/${category}`,
        resource_type: "auto",
      });
      backup_url = result.secure_url;
    } catch (err) {
      console.warn(`[upload] Cloudinary backup failed for ${req.file.filename}:`, err.message);
      // Intentionally not re-thrown - local copy already succeeded.
    }
  }

  res.status(201).json({
    file_url,
    backup_url,
    file_name: req.file.originalname,
    size: req.file.size,
    mime_type: req.file.mimetype,
  });
});

function categoryFolder(category) {
  const map = { students: "students", staff: "staff" };
  return map[category] || "documents";
}
