import { ApiError } from "../utils/ApiError.js";

export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed.",
      details: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message]),
      ),
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    return res.status(409).json({
      error: "A record with this value already exists.",
      details: err.keyValue,
    });
  }

  // Invalid ObjectId in :id param
  if (err.name === "CastError") {
    return res.status(400).json({ error: `Invalid id: ${err.value}` });
  }

  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Something went wrong on our end." });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
