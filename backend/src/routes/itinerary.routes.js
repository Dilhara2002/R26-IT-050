import express from "express";

import {
  optimizeItinerary
} from "../controllers/itinerary.controller.js";


const router = express.Router();


router.post(
  "/optimize",
  optimizeItinerary
);


export default router;