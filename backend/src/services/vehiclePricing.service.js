import VehiclePricing from "../models/VehiclePricing.js";
import mongoose from "mongoose";

export const getPricingOverrides = async () => {
  if (mongoose.connection.readyState !== 1) return new Map();
  try {
    const rows = await VehiclePricing.find({ active: true }).lean();
    return new Map(rows.map((row) => [row.vehicleName, row]));
  } catch {
    return new Map();
  }
};

export const applyPricingOverride = (vehicle, overrides) => {
  const vehicleName = vehicle["Vehicle Name (Make & Model)"] || vehicle.vehicleName;
  const override = overrides.get(vehicleName);
  if (!override) return vehicle;
  return {
    ...vehicle,
    BaseHireCharge: override.baseHireCharge,
    RentalPricePerKM: override.rentalPricePerKm,
    _pricingSource: override.source,
    _pricingEffectiveDate: override.effectiveDate,
    _pricingVerified: true,
  };
};
