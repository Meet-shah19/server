import { Router } from "express";
import { createUser, deleteUser, listUsers, updateMe, updateUser } from "../controllers/user.controller.js";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();
router.patch("/me", auth, updateMe);
router.use(auth, requireRole("admin"));
router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
