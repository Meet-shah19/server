import Certificate from "../models/Certificate.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Note from "../models/Note.js";
import Purchase from "../models/Purchase.js";
import QuizAttempt from "../models/QuizAttempt.js";
import { isStudentVisible, normalizeInrPrice, studentVisibleCourseData } from "../services/coursePolicy.js";

const visibleFilter = {
  $or: [
    { status: { $regex: "^published$", $options: "i" } },
    {
      status: { $not: /^draft$/i },
      hasPublishedVersion: true,
      publishedVersion: { $exists: true, $ne: null },
    },
  ],
};

export async function listEnrollments(req, res, next) {
  try {
    const enrollments = await Enrollment.find({ student: req.user._id, accessStatus: "active" })
      .populate({ path: "course", select: "title", match: visibleFilter })
      .sort({ enrolledAt: -1 });
    return res.json(enrollments.filter((item) => item.course));
  } catch (error) {
    return next(error);
  }
}

export async function enroll(req, res, next) {
  try {
    const courseId = req.body?.courseId;
    const course = await Course.findById(courseId);
    if (!course || !isStudentVisible(course)) return res.status(404).json({ error: "Published course not found." });
    const existing = await Enrollment.findOne({ student: req.user._id, course: course._id });
    if (existing?.accessStatus === "active") {
      return res.status(409).json({ error: "You are already enrolled in this course." });
    }
    const publicData = studentVisibleCourseData(course);
    const amount = normalizeInrPrice(publicData.price);
    if (amount > 0) {
      return res.status(402).json({ error: "Paid courses require Stripe Checkout; enrollment is confirmed by webhook." });
    }
    const purchase = await Purchase.create({
      student: req.user._id,
      course: course._id,
      courseTitle: publicData.title,
      amount: 0,
      currency: "inr",
      status: "free",
      provider: "free",
    });
    let enrollment;
    if (existing) {
      enrollment = existing;
      enrollment.accessStatus = "active";
      enrollment.accessSource = "free";
      enrollment.enrolledAt = new Date();
      enrollment.accessHistory.push({
        action: "granted",
        source: "free",
        at: new Date(),
        note: "Free course access activated.",
      });
      await enrollment.save();
    } else try {
      enrollment = await Enrollment.create({
        student: req.user._id,
        course: course._id,
        accessSource: "free",
        accessHistory: [{
          action: "granted",
          source: "free",
          at: new Date(),
          note: "Free course access activated.",
        }],
      });
    } catch (error) {
      await Purchase.deleteOne({ _id: purchase._id });
      if (error?.code === 11000) {
        return res.status(409).json({ error: "You are already enrolled in this course." });
      }
      throw error;
    }
    await enrollment.populate("course", "title");
    return res.status(201).json({ enrollment, purchase });
  } catch (error) {
    return next(error);
  }
}

export async function updateProgress(req, res, next) {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course || !isStudentVisible(course)) return res.status(404).json({ error: "Published course not found." });
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
      accessStatus: "active",
    });
    if (!enrollment) return res.status(404).json({ error: "Enroll in this course before updating progress." });

    const lessons = studentVisibleCourseData(course).lessons || [];
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    let completed;
    if (Array.isArray(req.body?.completedLessons)) {
      completed = req.body.completedLessons;
      if (completed.some((id) => typeof id !== "string" || !lessonIds.has(id))) {
        return res.status(400).json({ error: "Completed lessons must belong to this course." });
      }
    } else if (typeof req.body?.lessonId === "string" && typeof req.body.completed === "boolean") {
      if (!lessonIds.has(req.body.lessonId)) {
        return res.status(400).json({ error: "Lesson does not belong to this course." });
      }
      const values = new Set(enrollment.completedLessons);
      if (req.body.completed) values.add(req.body.lessonId);
      else values.delete(req.body.lessonId);
      completed = [...values];
    } else {
      return res.status(400).json({ error: "Provide completedLessons or a lessonId and completed value." });
    }

    enrollment.completedLessons = [...new Set(completed)];
    enrollment.progress = lessonIds.size
      ? Math.round((enrollment.completedLessons.length / lessonIds.size) * 100)
      : 0;
    await enrollment.save();

    if (lessonIds.size > 0 && enrollment.progress === 100) {
      await Certificate.updateOne(
        { student: req.user._id, course: course._id },
        { $setOnInsert: { student: req.user._id, course: course._id, issuedAt: new Date() } },
        { upsert: true }
      );
    } else {
      await Certificate.deleteOne({ student: req.user._id, course: course._id });
    }

    return res.json(enrollment);
  } catch (error) {
    return next(error);
  }
}

export async function listNotes(req, res, next) {
  try {
    const access = await Enrollment.find({ student: req.user._id, accessStatus: "active" }).distinct("course");
    const notes = await Note.find({ student: req.user._id, course: { $in: access } })
      .populate({ path: "course", select: "title", match: visibleFilter });
    return res.json(notes.filter((note) => note.course));
  } catch (error) {
    return next(error);
  }
}

export async function saveNote(req, res, next) {
  try {
    const { courseId, lessonId, content } = req.body || {};
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Note content must be text." });
    }
    const course = await Course.findById(courseId);
    if (!course || !isStudentVisible(course)) return res.status(404).json({ error: "Published course not found." });
    const lessons = studentVisibleCourseData(course).lessons || [];
    if (lessonId && !lessons.some((lesson) => lesson.id === lessonId)) {
      return res.status(400).json({ error: "Lesson does not belong to this course." });
    }
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
      accessStatus: "active",
    });
    if (!enrollment) return res.status(403).json({ error: "Enroll in this course before saving notes." });
    if (content.length > 10000) return res.status(400).json({ error: "Notes cannot exceed 10,000 characters." });
    if (!content.trim()) {
      await Note.deleteOne({ student: req.user._id, course: course._id, lessonId: lessonId || null });
      return res.json({ deleted: true });
    }
    const note = await Note.findOneAndUpdate(
      { student: req.user._id, course: course._id, lessonId: lessonId || null },
      { $set: { content: content.trim() } },
      { new: true, upsert: true, runValidators: true }
    ).populate("course", "title");
    return res.status(201).json(note);
  } catch (error) {
    return next(error);
  }
}

export async function deleteNote(req, res, next) {
  try {
    const note = await Note.findOneAndDelete({ _id: req.params.id, student: req.user._id });
    if (!note) return res.status(404).json({ error: "Note not found." });
    return res.json({ message: "Note deleted." });
  } catch (error) {
    return next(error);
  }
}

export async function listCertificates(req, res, next) {
  try {
    const access = await Enrollment.find({ student: req.user._id, accessStatus: "active" }).distinct("course");
    const certificates = await Certificate.find({ student: req.user._id, course: { $in: access } })
      .populate({ path: "course", select: "title", match: visibleFilter });
    return res.json(certificates.filter((certificate) => certificate.course));
  } catch (error) {
    return next(error);
  }
}

export async function submitQuizAttempt(req, res, next) {
  try {
    const { courseId, quizId, answers } = req.body || {};
    if (!Array.isArray(answers)) return res.status(400).json({ error: "Quiz answers are required." });
    const courseRecord = await Course.findById(courseId);
    if (!courseRecord || !isStudentVisible(courseRecord)) return res.status(404).json({ error: "Published course not found." });
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseRecord._id,
      accessStatus: "active",
    });
    if (!enrollment) return res.status(403).json({ error: "Enroll in this course before taking quizzes." });
    const course = studentVisibleCourseData(courseRecord);
    const quiz = course.quizzes.find((item) => item.id === quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    const questionIds = new Set(answers.map((answer) => answer?.questionId));
    if (answers.length !== quiz.questions.length ||
      questionIds.size !== quiz.questions.length ||
      quiz.questions.some((question) => !questionIds.has(question.id)) ||
      answers.some((answer) => {
        const question = quiz.questions.find((item) => item.id === answer?.questionId);
        return !question || (
          answer.answer !== null &&
          (!Number.isInteger(answer.answer) || answer.answer < 0 ||
            answer.answer >= question.options.length)
        );
      })) {
      return res.status(400).json({ error: "Submit one valid answer for every quiz question." });
    }

    const answerMap = new Map(answers.map((answer) => [String(answer.questionId), answer.answer]));
    const score = quiz.questions.reduce((total, question) =>
      total + (answerMap.get(question.id) === question.correctAnswer ? 1 : 0), 0);
    const attempt = await QuizAttempt.create({
      student: req.user._id,
      course: courseRecord._id,
      quizId: quiz.id,
      answers: quiz.questions.map((question) => ({
        questionId: question.id,
        answer: answerMap.get(question.id),
      })),
      score,
      total: quiz.questions.length,
    });
    return res.status(201).json({
      id: String(attempt._id),
      score: attempt.score,
      total: attempt.total,
      submittedAt: attempt.submittedAt,
    });
  } catch (error) {
    return next(error);
  }
}

export async function listQuizAttempts(req, res, next) {
  try {
    const access = await Enrollment.find({ student: req.user._id, accessStatus: "active" }).distinct("course");
    const attempts = await QuizAttempt.find({ student: req.user._id, course: { $in: access } })
      .populate({ path: "course", select: "title", match: visibleFilter }).sort({ submittedAt: -1 });
    return res.json(attempts.filter((attempt) => attempt.course));
  } catch (error) {
    return next(error);
  }
}
