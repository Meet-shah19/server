import mongoose from "mongoose";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Purchase from "../models/Purchase.js";
import User from "../models/User.js";
import { isStudentVisible } from "../services/coursePolicy.js";

export async function listPurchases(_req, res, next) {
  try {
    const purchases = await Purchase.find().populate("student", "name email")
      .populate("course", "title status price").sort({ createdAt: -1 });
    return res.json(purchases);
  } catch (error) {
    return next(error);
  }
}

export async function listAccess(_req, res, next) {
  try {
    const enrollments = await Enrollment.find().populate("student", "name email")
      .populate("course", "title status price").sort({ enrolledAt: -1 });
    return res.json(enrollments);
  } catch (error) {
    return next(error);
  }
}

export async function grantAccess(req, res, next) {
  try {
    const { studentId, courseId } = req.body || {};
    if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ error: "Valid studentId and courseId are required." });
    }
    const [student, course] = await Promise.all([
      User.findOne({ _id: studentId, role: "student" }),
      Course.findById(courseId),
    ]);
    if (!student) return res.status(404).json({ error: "Student not found." });
    if (!course || !isStudentVisible(course)) {
      return res.status(404).json({ error: "Published course not found." });
    }

    let enrollment = await Enrollment.findOne({ student: student._id, course: course._id });
    const now = new Date();
    if (enrollment?.accessStatus === "active") {
      return res.status(409).json({ error: "Student already has access to this course." });
    }
    if (enrollment) {
      enrollment.accessStatus = "active";
      enrollment.accessSource = "manual";
      enrollment.grantedBy = req.user._id;
      enrollment.enrolledAt = now;
      enrollment.accessHistory.push({
        action: "granted",
        source: "manual",
        actor: req.user._id,
        at: now,
        note: "Manual access granted by an administrator.",
      });
      await enrollment.save();
    } else {
      enrollment = await Enrollment.create({
        student: student._id,
        course: course._id,
        accessStatus: "active",
        accessSource: "manual",
        grantedBy: req.user._id,
        enrolledAt: now,
        accessHistory: [{
          action: "granted",
          source: "manual",
          actor: req.user._id,
          at: now,
          note: "Manual access granted by an administrator.",
        }],
      });
    }
    await enrollment.populate([
      { path: "student", select: "name email" },
      { path: "course", select: "title status price" },
      { path: "grantedBy", select: "name" },
      { path: "accessHistory.actor", select: "name role" },
    ]);
    return res.status(201).json(enrollment);
  } catch (error) {
    return next(error);
  }
}

export async function revokeAccess(req, res, next) {
  try {
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found." });
    if (enrollment.accessStatus === "revoked") {
      return res.status(409).json({ error: "Course access is already revoked." });
    }
    const now = new Date();
    enrollment.accessStatus = "revoked";
    enrollment.accessHistory.push({
      action: "revoked",
      source: enrollment.accessSource,
      actor: req.user._id,
      at: now,
      note: "Course access revoked by an administrator.",
    });
    await enrollment.save();
    return res.json({ message: "Course access revoked.", enrollmentId: String(enrollment._id) });
  } catch (error) {
    return next(error);
  }
}
