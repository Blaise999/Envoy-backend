// src/utils/errors.js

/** Generic AppError with status code */
export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

/** 404 Not Found middleware */
export function notFound(req, res, next) {
  res.status(404).json({ message: "Route not found" });
}

/** Error handler middleware */
export function errorHandler(err, req, res, next) {
  console.error("❌ Error:", err.message);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Internal server error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
}
