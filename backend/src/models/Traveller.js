import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  passwordSalt: { type: String, required: true, select: false },
}, { timestamps: true });

export default mongoose.models.Traveller || mongoose.model("Traveller", schema);
