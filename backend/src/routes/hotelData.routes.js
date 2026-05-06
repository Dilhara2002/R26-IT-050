import express from "express";
import { buildGraphFromDataset } from "../controllers/hotelData.controller.js";

const router = express.Router();

router.post("/build-graph", buildGraphFromDataset);

export default router;