import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  role: { type: String, default: "admin", immutable: true },
}, { timestamps: true });

export default mongoose.models.Admin || mongoose.model("Admin", adminSchema);
