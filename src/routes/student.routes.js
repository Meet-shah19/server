import { Router } from "express";
import {
  deleteNote,
  enroll,
  listCertificates,
  listEnrollments,
  listNotes,
  listQuizAttempts,
  saveNote,
  submitQuizAttempt,
  updateProgress,
} from "../controllers/student.controller.js";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();
router.use(auth, requireRole("student"));
router.get("/enrollments/me", listEnrollments);
router.post("/enrollments", enroll);
router.patch("/enrollments/:courseId/progress", updateProgress);
router.get("/notes", listNotes);
router.post("/notes", saveNote);
router.delete("/notes/:id", deleteNote);
router.get("/certificates/me", listCertificates);
router.post("/quiz-attempts", submitQuizAttempt);
router.get("/quiz-attempts/me", listQuizAttempts);

export default router;
