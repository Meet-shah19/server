import mongoose from "mongoose";
import Certificate from "../models/Certificate.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Note from "../models/Note.js";
import QuizAttempt from "../models/QuizAttempt.js";
import User from "../models/User.js";
import {
  isStudentVisible,
  makePublishedVersion,
  normalizeInrPrice,
  studentVisibleCourseData,
  validateCourseForReview,
} from "../services/coursePolicy.js";

const editableFields = ["title", "description", "thumbnail", "category", "level", "price", "modules", "lessons", "quizzes"];

function courseData(body) {
  body ||= {};
  const data = {};
  for (const field of editableFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (data.price !== undefined) data.price = normalizeInrPrice(data.price);
  if (data.lessons !== undefined && (!Array.isArray(data.lessons) ||
      data.lessons.some((lesson) => typeof lesson.isFreeIntroduction !== "boolean"))) {
    throw Object.assign(new Error("Each lesson must set isFreeIntroduction to true or false."), { status: 400 });
  }
  return data;
}

async function assignInstructor(input, user) {
  if (user.role === "instructor") return user._id;
  const instructor = String(input || "").trim();
  if (!instructor || instructor === "Not assigned") return null;
  const match = mongoose.isValidObjectId(instructor)
    ? await User.findOne({ _id: instructor, role: "instructor" })
    : await User.findOne({ name: new RegExp(`^${instructor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), role: "instructor" });
  if (!match) throw Object.assign(new Error("Select a valid instructor."), { status: 400 });
  return match._id;
}

function serializeCourse(course, { student = false, enrolled = false } = {}) {
  const data = student ? studentVisibleCourseData(course) : course.toJSON();
  const instructor = course.instructor;
  data.instructor = instructor?.name || "Not assigned";
  data.instructorId = instructor?._id ? String(instructor._id) : null;
  if (student) {
    data.reviewHistory = undefined;
    data.reviewFeedback = undefined;
    data.publishedVersion = undefined;
    data.hasPublishedVersion = undefined;
    data.status = "published";
    data.lessons = (data.lessons || []).map((lesson) => {
      if (enrolled || lesson.isFreeIntroduction) return lesson;
      const { content: _content, ...preview } = lesson;
      return preview;
    });
    data.quizzes = enrolled ? (data.quizzes || []).map((quiz) => ({
      ...quiz,
      questions: (quiz.questions || []).map(({ correctAnswer: _answer, ...question }) => question),
    })) : [];
    data.enrolled = enrolled;
    data.access = enrolled ? "full" : "preview";
  } else {
    data.quizzes = (data.quizzes || []).map((quiz) => ({
      ...quiz,
      questions: (quiz.questions || []).map((question) => ({ ...question })),
    }));
  }
  return data;
}

function appendHistory(course, action, actor, note = "") {
  course.reviewHistory.push({ action, actor: actor._id, at: new Date(), note });
}

async function loadForAdmin(id) {
  return Course.findById(id).populate("instructor", "name").populate("reviewHistory.actor", "name role");
}

function ownerCheck(course, user) {
  return user.role !== "instructor" || String(course.instructor?._id || course.instructor) === String(user._id);
}

export async function listCourses(req, res, next) {
  try {
    const filter = req.user?.role === "admin"
      ? {}
      : req.user?.role === "instructor"
        ? { instructor: req.user._id }
        : {
          $or: [
            { status: { $regex: "^published$", $options: "i" } },
            { hasPublishedVersion: true },
          ],
        };
    if (req.query.status && req.user?.role === "admin") filter.status = req.query.status;
    const courses = await Course.find(filter).populate("instructor", "name").sort({ updatedAt: -1 });
    const visibleCourses = courses.filter((course) =>
      ["admin", "instructor"].includes(req.user?.role) || isStudentVisible(course));
    const enrolledCourseIds = req.user?.role === "student"
      ? new Set((await Enrollment.find({ student: req.user._id, accessStatus: "active" })
        .distinct("course")).map(String))
      : new Set();
    return res.json(visibleCourses.map((course) => {
      if (["admin", "instructor"].includes(req.user?.role)) return serializeCourse(course);
      const enrolled = enrolledCourseIds.has(String(course._id));
      const data = serializeCourse(course, { student: true, enrolled });
      data.lessons = data.lessons.map(({ content: _content, ...lesson }) => lesson);
      data.quizzes = [];
      return data;
    }));
  } catch (error) {
    return next(error);
  }
}

export async function getCourse(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required to view course details." });
    const course = await Course.findById(req.params.id).populate("instructor", "name");
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (req.user.role === "instructor" && !ownerCheck(course, req.user)) {
      return res.status(404).json({ error: "Course not found." });
    }
    if (req.user.role === "student" && !isStudentVisible(course)) {
      return res.status(404).json({ error: "Course not found." });
    }
    const enrolled = req.user.role === "student" &&
      Boolean(await Enrollment.exists({ student: req.user._id, course: course._id, accessStatus: "active" }));
    return res.json(serializeCourse(course, { student: req.user.role === "student", enrolled }));
  } catch (error) {
    return next(error);
  }
}

export async function getLesson(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: "Authentication required to view lessons." });
    const course = await Course.findById(req.params.id).populate("instructor", "name");
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (req.user.role === "student" && !isStudentVisible(course)) {
      return res.status(404).json({ error: "Course not found." });
    }
    if (req.user.role === "instructor" && !ownerCheck(course, req.user)) {
      return res.status(404).json({ error: "Course not found." });
    }
    const data = req.user.role === "student" ? studentVisibleCourseData(course) : course.toJSON();
    const lesson = (data.lessons || []).find((item) => item.id === req.params.lessonId);
    if (!lesson) return res.status(404).json({ error: "Lesson not found." });
    const enrolled = req.user.role === "student" &&
      Boolean(await Enrollment.exists({ student: req.user._id, course: course._id, accessStatus: "active" }));
    if (req.user.role === "student" && !enrolled && !lesson.isFreeIntroduction) {
      return res.status(403).json({ error: "Enroll in this course to access this lesson." });
    }
    return res.json({
      courseId: String(course._id),
      lesson: { ...lesson },
      access: req.user.role !== "student" || enrolled ? "full" : "preview",
    });
  } catch (error) {
    return next(error);
  }
}

export async function createCourse(req, res, next) {
  try {
    const data = courseData(req.body);
    if (typeof data.title !== "string" || !data.title.trim()) {
      return res.status(400).json({ error: "Course title is required." });
    }
    data.instructor = await assignInstructor(req.body?.instructor, req.user);
    data.status = "draft";
    const course = await Course.create(data);
    await course.populate("instructor", "name");
    return res.status(201).json(serializeCourse(course));
  } catch (error) {
    return next(error);
  }
}

export async function updateCourse(req, res, next) {
  try {
    const course = await Course.findById(req.params.id).populate("instructor", "name");
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (!ownerCheck(course, req.user)) return res.status(403).json({ error: "You can only edit your own courses." });
    const status = String(course.status || "").toLowerCase();
    if (req.user.role === "instructor" && status === "pending_review") {
      return res.status(409).json({ error: "Course edits are locked while review is pending." });
    }
    const data = courseData(req.body);
    if (data.title !== undefined && (typeof data.title !== "string" || !data.title.trim())) {
      return res.status(400).json({ error: "Course title is required." });
    }
    if (req.user.role === "admin" && req.body?.instructor !== undefined) {
      data.instructor = await assignInstructor(req.body.instructor, req.user);
    }
    const wasLive = ["published", "approved"].includes(status) || course.hasPublishedVersion;
    const instructorEditingLiveCourse = req.user.role === "instructor" &&
      wasLive && Object.keys(data).length > 0;
    if (instructorEditingLiveCourse) {
      if (status === "published" && !course.publishedVersion) {
        course.publishedVersion = makePublishedVersion(course);
        course.hasPublishedVersion = true;
      }
      Object.assign(course, data);
      course.status = "pending_review";
      course.reviewFeedback = "";
      appendHistory(course, "resubmitted", req.user, "Course edit submitted for review.");
    } else {
      Object.assign(course, data);
      if (req.user.role === "admin" && status === "published" && Object.keys(data).length > 0) {
        course.publishedVersion = makePublishedVersion(course);
        course.hasPublishedVersion = true;
      }
    }
    await course.save();
    await course.populate("instructor", "name");
    return res.json(serializeCourse(course));
  } catch (error) {
    return next(error);
  }
}

export async function submitCourse(req, res, next) {
  try {
    const course = await Course.findById(req.params.id).populate("instructor", "name");
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (!ownerCheck(course, req.user)) return res.status(403).json({ error: "You can only submit your own courses." });
    if (!["draft", "changes_requested", "rejected"].includes(course.status)) {
      return res.status(409).json({ error: "Only draft, changes-requested, or rejected courses can be submitted." });
    }
    const validationError = validateCourseForReview(course);
    if (validationError) return res.status(400).json({ error: validationError });
    const action = course.reviewHistory.some((item) => item.action !== "submitted") ? "resubmitted" : "submitted";
    course.status = "pending_review";
    course.reviewFeedback = "";
    appendHistory(course, action, req.user, String(req.body?.note || "").trim());
    await course.save();
    await course.populate("reviewHistory.actor", "name role");
    return res.json(serializeCourse(course));
  } catch (error) {
    return next(error);
  }
}

export async function reviewQueue(_req, res, next) {
  try {
    const courses = await Course.find({ status: "pending_review" }).populate("instructor", "name")
      .populate("reviewHistory.actor", "name role").sort({ updatedAt: 1 });
    return res.json(courses.map((course) => serializeCourse(course)));
  } catch (error) {
    return next(error);
  }
}

export async function reviewCourse(req, res, next) {
  try {
    const course = await loadForAdmin(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (course.status !== "pending_review") {
      return res.status(409).json({ error: "Only courses pending review can receive a review decision." });
    }
    const action = String(req.body?.action || "");
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (!["approve", "request_changes", "reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be approve, request_changes, or reject." });
    }
    if (action !== "approve" && !note) {
      return res.status(400).json({ error: "A note is required when requesting changes or rejecting a course." });
    }
    const statusByAction = { approve: "approved", request_changes: "changes_requested", reject: "rejected" };
    const historyAction = { approve: "approved", request_changes: "changes_requested", reject: "rejected" };
    course.status = statusByAction[action];
    course.reviewFeedback = action === "approve" ? "" : note;
    appendHistory(course, historyAction[action], req.user, note);
    await course.save();
    return res.json(serializeCourse(course));
  } catch (error) {
    return next(error);
  }
}

export async function publishCourse(req, res, next) {
  try {
    const course = await loadForAdmin(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (course.status !== "approved") return res.status(409).json({ error: "Only approved courses can be published." });
    const validationError = validateCourseForReview(course);
    if (validationError) return res.status(400).json({ error: validationError });
    course.publishedVersion = makePublishedVersion(course);
    course.hasPublishedVersion = true;
    course.status = "published";
    appendHistory(course, "published", req.user, String(req.body?.note || "").trim());
    await course.save();
    return res.json(serializeCourse(course));
  } catch (error) {
    return next(error);
  }
}

export async function unpublishCourse(req, res, next) {
  try {
    const course = await loadForAdmin(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (course.status !== "published") return res.status(409).json({ error: "Only published courses can be unpublished." });
    course.status = "approved";
    course.hasPublishedVersion = false;
    appendHistory(course, "unpublished", req.user, String(req.body?.note || "").trim());
    await course.save();
    return res.json(serializeCourse(course));
  } catch (error) {
    return next(error);
  }
}

export async function deleteCourse(req, res, next) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found." });
    if (!ownerCheck(course, req.user)) return res.status(403).json({ error: "You can only delete your own courses." });
    if (req.user.role === "instructor" && course.status === "pending_review") {
      return res.status(409).json({ error: "Courses cannot be deleted while review is pending." });
    }
    await Promise.all([
      Enrollment.deleteMany({ course: course._id }),
      Note.deleteMany({ course: course._id }),
      Certificate.deleteMany({ course: course._id }),
      QuizAttempt.deleteMany({ course: course._id }),
      Course.deleteOne({ _id: course._id }),
    ]);
    return res.json({ message: "Course deleted." });
  } catch (error) {
    return next(error);
  }
}
