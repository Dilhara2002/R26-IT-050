import express from "express";
import {
  recommendItinerarySafety,
  recommendRouteSafety,
} from "../controllers/itinerarySafety.controller.js";

const router = express.Router();

router.post("/recommend-route", recommendRouteSafety);
router.post("/recommend-itinerary", recommendItinerarySafety);

export default router;
