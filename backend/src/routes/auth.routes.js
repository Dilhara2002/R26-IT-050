import express from "express";
import mongoose from "mongoose";
import {
  createUserToken,
  registerUser,
  validateUserCredentials,
} from "../services/userAuth.service.js";

const router = express.Router();

router.use((_req, res, next) => mongoose.connection.readyState === 1
  ? next()
  : res.status(503).json({ success: false, message: "User accounts require an active MongoDB connection." }));

const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: "user",
});

router.post("/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    return res.status(400).json({ success: false, message: "Enter a name, valid email, and password of at least 6 characters." });
  }
  const user = await registerUser({ name, email, password });
  if (!user) {
    return res.status(409).json({ success: false, message: "An account with that email already exists." });
  }
  return res.status(201).json({ success: true, token: createUserToken(user), user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const user = await validateUserCredentials(req.body.email, req.body.password);
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }
  return res.json({ success: true, token: createUserToken(user), user: publicUser(user) });
});

export default router;
