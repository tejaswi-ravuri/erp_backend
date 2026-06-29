import { v2 as cloudinary } from "cloudinary";

export const isCloudinaryEnabled = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);

if (isCloudinaryEnabled) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("[cloudinary] Backup uploads enabled");
} else {
  console.log(
    "[cloudinary] Not configured - files will be stored on local disk only (this is fine).",
  );
}

export { cloudinary };
