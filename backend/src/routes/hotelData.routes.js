import express from "express";
import {
  buildGraphFromDataset,
  buildActivityGraph,
} from "../controllers/hotelData.controller.js";

const router = express.Router();

router.post("/build-graph", buildGraphFromDataset);
router.post("/build-activity-graph", buildActivityGraph);

export default router;