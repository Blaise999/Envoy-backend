// src/utils/asynchandler.js
/**
 * Wrap an async route handler to catch errors
 * Usage:
 *   router.get("/", asyncHandler(async (req,res)=>{...}))
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
