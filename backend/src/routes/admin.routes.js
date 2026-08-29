import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Admin from "../models/Admin.js";
import VehiclePricing from "../models/VehiclePricing.js";
import mongoose from "mongoose";
import { authenticateAdmin, createAdminToken, verifyPassword } from "../services/adminAuth.service.js";

const router = express.Router();
const dataFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "../ai-engine/data/processed_vehicles.csv");
const split = (line) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((v) => v.replace(/^\"|\"$/g, "").trim());
const requireDatabase = (_req, res, next) => mongoose.connection.readyState === 1
  ? next()
  : res.status(503).json({ success: false, message: "Admin pricing requires an active MongoDB connection." });

router.use(requireDatabase);

const datasetVehicles = async () => {
  const lines = (await fs.readFile(dataFile, "utf8")).split(/\r?\n/).filter(Boolean);
  const headers = split(lines.shift());
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, split(line)[index] || ""])));
};

router.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const admin = await Admin.findOne({ email });
  if (!admin || !verifyPassword(String(req.body.password || ""), admin.passwordSalt, admin.passwordHash)) {
    return res.status(401).json({ success: false, message: "Invalid administrator email or password." });
  }
  return res.json({ success: true, token: createAdminToken(admin), user: { name: admin.name, email: admin.email, role: "admin" } });
});

router.get("/vehicle-pricing", authenticateAdmin, async (_req, res) => {
  const [vehicles, overrides] = await Promise.all([datasetVehicles(), VehiclePricing.find().lean()]);
  const overrideMap = new Map(overrides.map((row) => [row.vehicleName, row]));
  res.json({ success: true, vehicles: vehicles.map((vehicle) => {
    const vehicleName = vehicle["Vehicle Name (Make & Model)"];
    const saved = overrideMap.get(vehicleName);
    return {
      vehicleName,
      category: vehicle["Vehicle Category"],
      baseHireCharge: saved?.baseHireCharge ?? Number(vehicle.BaseHireCharge),
      rentalPricePerKm: saved?.rentalPricePerKm ?? Number(vehicle.RentalPricePerKM),
      source: saved?.source || "Vehicle research dataset",
      effectiveDate: saved?.effectiveDate || null,
      active: saved?.active ?? true,
      verified: Boolean(saved),
      updatedAt: saved?.updatedAt || null,
    };
  }) });
});

router.put("/vehicle-pricing/:vehicleName", authenticateAdmin, async (req, res) => {
  const vehicleName = decodeURIComponent(req.params.vehicleName);
  const baseHireCharge = Number(req.body.baseHireCharge);
  const rentalPricePerKm = Number(req.body.rentalPricePerKm);
  const source = String(req.body.source || "").trim();
  const effectiveDate = new Date(req.body.effectiveDate);
  if (baseHireCharge <= 0 || rentalPricePerKm <= 0 || !source || Number.isNaN(effectiveDate.getTime())) {
    return res.status(400).json({ success: false, message: "Enter positive rates, a source, and a valid effective date." });
  }
  const exists = (await datasetVehicles()).some((v) => v["Vehicle Name (Make & Model)"] === vehicleName);
  if (!exists) return res.status(404).json({ success: false, message: "Vehicle model was not found." });
  const pricing = await VehiclePricing.findOneAndUpdate(
    { vehicleName },
    { vehicleName, baseHireCharge, rentalPricePerKm, source, effectiveDate, active: req.body.active !== false, updatedBy: req.admin._id },
    { upsert: true, new: true, runValidators: true }
  );
  res.json({ success: true, pricing });
});

export default router;
