import express from "express";
import {
  buildGraphFromDataset,
  buildActivityGraph,
  generatePackageFromPrompt,
} from "../controllers/hotelData.controller.js";

const router = express.Router();

router.post("/build-graph", buildGraphFromDataset);
router.post("/build-activity-graph", buildActivityGraph);
router.post("/generate-package", generatePackageFromPrompt);

export default router;