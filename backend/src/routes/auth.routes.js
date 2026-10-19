
import express from "express";
import mongoose from "mongoose";

import Traveller from "../models/Traveller.js";

import {
  clearSessionCookie,
  hashTravellerPassword,
  issueSession,
  limitAuthAttempts,
  protectSessionRequest,
  readSession,
  revokeSession,
  verifyTravellerPassword
} from "../services/session.service.js";

// ---------------------------------------
// Express Router
// ---------------------------------------

const router = express.Router();

// ---------------------------------------
// Session Protection
// ---------------------------------------

router.use(protectSessionRequest);

// ---------------------------------------
// MongoDB Connection Check
// ---------------------------------------

router.use((_req, res, next) => {
  if (
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === "ceylongo"
  ) {
    return next();
  }

  return res.status(503).json({
    success: false,
    message: "Authentication database unavailable."
  });
});

// ---------------------------------------
// Register and Login
// ---------------------------------------

router.post(
  ["/register", "/login"],
  limitAuthAttempts,
  async (req, res) => {

    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password =
      typeof req.body.password === "string"
        ? req.body.password
        : "";

    const registering = req.path === "/register";

    // -----------------------------------
    // Validate Account Details
    // -----------------------------------

    if (
      !/^\S+@\S+\.\S+$/.test(email) ||
      email.length > 254 ||
      !password ||
      password.length > 128 ||
      (
        registering &&
        (
          password.length < 12 ||
          typeof req.body.name !== "string" ||
          !req.body.name.trim() ||
          req.body.name.trim().length > 100
        )
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter valid account details. New passwords require 12–128 characters."
      });
    }

    let user;

    // -----------------------------------
    // User Registration
    // -----------------------------------

    if (registering) {
      try {

        user = await Traveller.create({
          name: req.body.name.trim(),
          email,
          ...await hashTravellerPassword(password)
        });

      } catch (error) {

        if (error.code === 11000) {
          return res.status(409).json({
            success: false,
            message:
              "Unable to register these account details. Try signing in."
          });
        }

        throw error;
      }

    } else {

      // ---------------------------------
      // User Login
      // ---------------------------------

      user = await Traveller.findOne({
        email
      }).select(
        "+passwordHash +passwordSalt"
      );

      const validPassword =
        await verifyTravellerPassword(
          password,
          user
        );

      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password."
        });
      }
    }

    // -----------------------------------
    // Create Secure Session
    // -----------------------------------

    const session = await issueSession(
      req,
      res,
      user,
      "traveller"
    );

    return res
      .status(registering ? 201 : 200)
      .json({
        success: true,
        ...session
      });
  }
);

// ---------------------------------------
// Get Current User Session
// ---------------------------------------

router.get("/session", async (req, res) => {

  const session = await readSession(req);

  if (!session) {

    clearSessionCookie(res);

    return res.status(401).json({
      success: false,
      message: "Sign in required."
    });
  }

  return res.json({
    success: true,
    ...session
  });
});

// ---------------------------------------
// User Logout
// ---------------------------------------

router.post("/logout", async (req, res) => {

  await revokeSession(req);

  clearSessionCookie(res);

  return res.json({
    success: true
  });
});

// ---------------------------------------
// Export Router
// ---------------------------------------

export default router;
