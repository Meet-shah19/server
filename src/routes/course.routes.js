import { Router } from "express";
import {
  createCourse,
  deleteCourse,
  getCourse,
  getLesson,
  listCourses,
  submitCourse,
  updateCourse,
} from "../controllers/course.controller.js";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();
function optionalAuth(req, res, next) {
  if (!req.get("authorization")) return next();
  return auth(req, res, next);
}

router.get("/", optionalAuth, listCourses);
router.get("/:id/lessons/:lessonId", optionalAuth, getLesson);
router.get("/:id", optionalAuth, getCourse);
router.post("/", auth, requireRole("instructor", "admin"), createCourse);
router.post("/:id/submit", auth, requireRole("instructor"), submitCourse);
router.put("/:id", auth, requireRole("instructor", "admin"), updateCourse);
router.delete("/:id", auth, requireRole("instructor", "admin"), deleteCourse);

export default router;
