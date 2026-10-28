import Category from "../models/Category.js";

export async function listCategories(_req, res, next) {
  try {
    return res.json(await Category.find().sort({ name: 1 }));
  } catch (error) {
    return next(error);
  }
}

export async function createCategory(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name is required." });
    return res.status(201).json(await Category.create({ name }));
  } catch (error) {
    return next(error);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Category name is required." });
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ error: "Category not found." });
    return res.json(category);
  } catch (error) {
    return next(error);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: "Category not found." });
    return res.json({ message: "Category deleted." });
  } catch (error) {
    return next(error);
  }
}
