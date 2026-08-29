import mongoose from "mongoose";

const vehiclePricingSchema = new mongoose.Schema({
  vehicleName: { type: String, required: true, unique: true, trim: true },
  baseHireCharge: { type: Number, required: true, min: 1 },
  rentalPricePerKm: { type: Number, required: true, min: 1 },
  source: { type: String, required: true, trim: true },
  effectiveDate: { type: Date, required: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
}, { timestamps: true });

export default mongoose.models.VehiclePricing || mongoose.model("VehiclePricing", vehiclePricingSchema);
