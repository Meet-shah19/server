import jwt from "jsonwebtoken";
import User from "../models/User.js";

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw Object.assign(new Error("JWT_SECRET is not configured."), { status: 500 });
  }
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role };
}

export async function login(req, res, next) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;
    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || user.status !== "Active" || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    return res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
}

export function me(req, res) {
  return res.json(publicUser(req.user));
}
