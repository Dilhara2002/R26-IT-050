import express from "express";

import {
  getSavedItineraries,
  optimizeItinerary,
  removeSavedItinerary,
} from "../controllers/itinerary.controller.js";
import {
  protectSessionRequest,
  readSession,
} from "../services/session.service.js";


const router = express.Router();

router.use(protectSessionRequest);
router.use(async (req, res, next) => {
  let session;
  try {
    session = await readSession(req);
  } catch {
    return res.status(503).json({ success: false, message: "Authentication is temporarily unavailable. Please try again." });
  }
  if (!session || session.user.role !== "traveller") {
    return res.status(401).json({ success: false, message: "Please sign in to use Smart Itinerary." });
  }
  req.user = { _id: session.user.id, role: session.user.role };
  next();
});


router.post(
  "/optimize",
  optimizeItinerary
);

router.get("/", getSavedItineraries);
router.delete("/:id", removeSavedItinerary);


export default router;
