// src/middleware/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || "dev_secret";

/**
 * Usage:
 *  router.get("/protected", requireAuth(), handler)
 *  router.get("/admin", requireAuth(["admin"]), handler)
 */
export function requireAuth(roles = []) {
  return (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({ message: "Unauthorized" });

      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload; // { sub, role, email, iat, exp }

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    } catch (err) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  };
}

// Optional convenience for admin-only routes
export const requireAdmin = () => requireAuth(["admin"]);
