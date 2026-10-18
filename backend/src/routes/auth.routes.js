import express from "express";
import mongoose from "mongoose";
import Traveller from "../models/Traveller.js";
import { clearSessionCookie, hashTravellerPassword, issueSession, limitAuthAttempts,
  protectSessionRequest, readSession, revokeSession, verifyTravellerPassword } from "../services/session.service.js";

const router = express.Router();
router.use(protectSessionRequest);
router.use((_req, res, next) => mongoose.connection.readyState === 1 && mongoose.connection.name === "ceylongo"
  ? next() : res.status(503).json({ success: false, message: "Authentication database unavailable." }));

router.post(["/register", "/login"], limitAuthAttempts, async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const registering = req.path === "/register";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !password || password.length > 128 ||
      (registering && (password.length < 12 || typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.trim().length > 100))) {
    return res.status(400).json({ success: false, message: "Enter valid account details. New passwords require 12–128 characters." });
  }
  let user;
  if (registering) {
    try {
      user = await Traveller.create({ name: req.body.name.trim(), email, ...await hashTravellerPassword(password) });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ success: false, message: "Unable to register these account details. Try signing in." });
      throw error;
    }
  } else {
    user = await Traveller.findOne({ email }).select("+passwordHash +passwordSalt");
    if (!await verifyTravellerPassword(password, user)) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }
  }
  const session = await issueSession(req, res, user, "traveller");
  res.status(registering ? 201 : 200).json({ success: true, ...session });
});

router.get("/session", async (req, res) => {
  const session = await readSession(req);
  if (!session) {
    clearSessionCookie(res);
    return res.status(401).json({ success: false, message: "Sign in required." });
  }
  res.json({ success: true, ...session });
});

router.post("/logout", async (req, res) => {
  await revokeSession(req);
  clearSessionCookie(res);
  res.json({ success: true });
});

export default router;
