import express from "express";

import {
  getSavedItineraries,
  optimizeItinerary,
  removeSavedItinerary,
} from "../controllers/itinerary.controller.js";
import {
  authenticateUser,
  optionalAuthenticateUser,
} from "../services/userAuth.service.js";


const router = express.Router();


router.post(
  "/optimize",
  optionalAuthenticateUser,
  optimizeItinerary
);

router.get("/", authenticateUser, getSavedItineraries);
router.delete("/:id", authenticateUser, removeSavedItinerary);


export default router;
