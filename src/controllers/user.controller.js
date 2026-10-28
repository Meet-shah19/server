import User from "../models/User.js";

const allowedRoles = ["admin", "instructor", "student"];

function cleanUser(user) {
  const result = user.toJSON();
  delete result.password;
  return result;
}

export async function listUsers(_req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.json(users.map(cleanUser));
  } catch (error) {
    return next(error);
  }
}

export async function createUser(req, res, next) {
  try {
    const { name, email } = req.body;
    const role = String(req.body.role || "student").toLowerCase();
    if (!name?.trim() || !email?.trim() || !allowedRoles.includes(role) ||
      typeof req.body.password !== "string" || req.body.password.length < 8) {
      return res.status(400).json({ error: "A name, valid email, valid role, and password of at least 8 characters are required." });
    }
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      status: req.body.status === "Inactive" ? "Inactive" : "Active",
      password: req.body.password,
    });
    return res.status(201).json(cleanUser(user));
  } catch (error) {
    return next(error);
  }
}

export async function updateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const { name, email, role, status } = req.body;
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) {
      const normalizedRole = String(role).toLowerCase();
      if (!allowedRoles.includes(normalizedRole)) {
        return res.status(400).json({ error: "Role must be admin, instructor, or student." });
      }
      user.role = normalizedRole;
    }
    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status)) {
        return res.status(400).json({ error: "Status must be Active or Inactive." });
      }
      user.status = status;
    }
    if (req.body.password !== undefined) {
      if (typeof req.body.password !== "string" || req.body.password.length < 8) {
        return res.status(400).json({ error: "Password must contain at least 8 characters." });
      }
      user.password = req.body.password;
    }
    await user.save();
    return res.json(cleanUser(user));
  } catch (error) {
    return next(error);
  }
}

export async function updateMe(req, res, next) {
  try {
    const { name, email } = req.body;
    if (name !== undefined) req.user.name = name;
    if (email !== undefined) req.user.email = email;
    await req.user.save();
    return res.json(cleanUser(req.user));
  } catch (error) {
    return next(error);
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (String(req.user._id) === req.params.id) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({ message: "User deleted." });
  } catch (error) {
    return next(error);
  }
}
