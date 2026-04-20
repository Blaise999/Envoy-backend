// middleware/optionalAuth.js
export function optionalAuth(req, _res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return next();
  try {
    req.user = verifyJwt(token); // your existing verify
  } catch { /* ignore invalid token */ }
  next();
}
