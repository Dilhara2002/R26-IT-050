import express from "express";
import {
  generatePackageFromPrompt,
} from "../controllers/hotelData.controller.js";

const router = express.Router();

// Graph imports are intentionally not exposed as anonymous HTTP endpoints.
router.post("/recommendations/packages", generatePackageFromPrompt);
router.post("/generate-package", generatePackageFromPrompt);

export default router;
