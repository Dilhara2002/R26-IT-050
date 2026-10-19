import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, enum: ["traveller", "admin"], required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

export default mongoose.models.AuthSession || mongoose.model("AuthSession", schema);
