import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  role: { type: String, default: "user", immutable: true },
}, { timestamps: true });

export default mongoose.models.User || mongoose.model("User", userSchema);
