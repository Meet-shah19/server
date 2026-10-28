export const COURSE_STATUSES = Object.freeze([
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
]);

export function normalizeInrPrice(value) {
  const price = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || !Number.isInteger(price)) {
    throw Object.assign(new Error("Course price must be a non-negative whole amount in INR."), { status: 400 });
  }
  return price;
}

export function validateCourseForReview(course) {
  if (!String(course.title || "").trim()) return "Course title is required before submission.";
  if (!String(course.description || "").trim()) return "Course description is required before submission.";
  if (!Array.isArray(course.lessons) || course.lessons.length === 0) {
    return "Add at least one lesson before submission.";
  }
  if (course.lessons.filter((lesson) => lesson.isFreeIntroduction === true).length !== 1) {
    return "A course must have exactly one free introduction lesson.";
  }
  if (course.lessons.some((lesson) => !String(lesson.title || "").trim() || !String(lesson.content || "").trim())) {
    return "Every lesson must have a title and content.";
  }
  for (const quiz of course.quizzes || []) {
    if (!String(quiz.title || "").trim() || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return "Every quiz must have a title and at least one question.";
    }
    for (const question of quiz.questions) {
      if (!String(question.question || "").trim() || !Array.isArray(question.options) || question.options.length < 2 ||
        question.options.some((option) => !String(option).trim()) ||
        !Number.isInteger(question.correctAnswer) || question.correctAnswer < 0 ||
        question.correctAnswer >= question.options.length) {
        return "Quiz questions require at least two options and a valid correct answer.";
      }
    }
  }
  return null;
}

export function isStudentVisible(course) {
  const status = String(course.status || "").toLowerCase();
  return status === "published" ||
    (course.hasPublishedVersion === true && Boolean(course.publishedVersion) && status !== "draft");
}

export function studentVisibleCourseData(course) {
  const data = course.toJSON ? course.toJSON() : { ...course };
  if (String(course.status || "").toLowerCase() !== "published" && course.publishedVersion) {
    Object.assign(data, course.publishedVersion);
  }
  return data;
}

export function makePublishedVersion(course) {
  const data = course.toObject ? course.toObject() : { ...course };
  const fields = ["title", "description", "thumbnail", "category", "level", "price", "modules", "lessons", "quizzes"];
  return Object.fromEntries(fields.map((field) => [field, data[field]]));
}
