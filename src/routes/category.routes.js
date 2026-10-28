import { Router } from "express";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../controllers/category.controller.js";
import auth from "../middleware/auth.js";
import requireRole from "../middleware/requireRole.js";

const router = Router();
router.get("/", listCategories);
router.post("/", auth, requireRole("admin"), createCategory);
router.patch("/:id", auth, requireRole("admin"), updateCategory);
router.delete("/:id", auth, requireRole("admin"), deleteCategory);

export default router;
