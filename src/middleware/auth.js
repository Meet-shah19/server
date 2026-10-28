import jwt from "jsonwebtoken";
import User from "../models/User.js";

export default async function auth(req, _res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return next(Object.assign(new Error("Authentication required."), { status: 401 }));
  if (!process.env.JWT_SECRET) {
    return next(Object.assign(new Error("JWT_SECRET is not configured."), { status: 500 }));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || user.status !== "Active") {
      return next(Object.assign(new Error("Your account is unavailable."), { status: 401 }));
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(Object.assign(new Error("Invalid or expired token."), { status: 401 }));
    }
    return next(error);
  }
}
