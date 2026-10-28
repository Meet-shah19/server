import { Router } from "express";
import {
  grantAccess,
  listAccess,
  listPurchases,
  revokeAccess,
} from "../controllers/admin.controller.js";
import {
  publishCourse,
  reviewCourse,
  reviewQueue,
  unpublishCourse,
} from "../controllers/course.controller.js";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();
router.use(auth, requireRole("admin"));
router.get("/courses/review-queue", reviewQueue);
router.post("/courses/:id/review", reviewCourse);
router.post("/courses/:id/publish", publishCourse);
router.post("/courses/:id/unpublish", unpublishCourse);
router.get("/purchases", listPurchases);
router.get("/enrollments", listAccess);
// Manual grants are auditable access records, never payment/purchase records.
router.post("/enrollments", grantAccess);
router.delete("/enrollments/:id", revokeAccess);

export default router;
