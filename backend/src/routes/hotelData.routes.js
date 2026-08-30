import express from "express";
import {
  buildGraphFromDataset,
  buildActivityGraph,
  generatePackageFromPrompt,
  priceSelectedHotel,
} from "../controllers/hotelData.controller.js";

const router = express.Router();

router.post("/build-graph", buildGraphFromDataset);
router.post("/build-activity-graph", buildActivityGraph);
router.post("/generate-package", generatePackageFromPrompt);
router.post("/hotel-price", priceSelectedHotel);

export default router;
