import crypto from "crypto";
import Admin from "../models/Admin.js";
import { readSession } from "./session.service.js";

const iterations = 120000;
const digest = "sha256";
const keyLength = 32;

const derivePassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("hex");

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: derivePassword(password, salt) };
};

export const verifyPassword = (password, salt, expectedHash) => {
  const actual = Buffer.from(derivePassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const ephemeralSecret = crypto.randomBytes(32).toString("hex");
const tokenSecret = () => process.env.ADMIN_TOKEN_SECRET || ephemeralSecret;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

export const createAdminToken = (admin) => {
  const payload = encode({ sub: String(admin._id), role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 });
  const signature = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

export const authenticateAdmin = async (req, res, next) => {
  try {
    if (!req.headers.authorization || /^Bearer [a-f0-9]{64}$/i.test(req.headers.authorization)) {
      const session = await readSession(req);
      if (session?.user?.role !== "admin") throw new Error("Admin session required");
      req.admin = { ...session.user, _id: session.user.id };
      return next();
    }
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature) throw new Error("Missing token");
    const expected = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Bad signature");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.role !== "admin" || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) throw new Error("Expired token");
    const admin = await Admin.findById(claims.sub).select("_id name email role");
    if (!admin) throw new Error("Admin not found");
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Admin authentication required." });
  }
};

export const seedAdmin = async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) return;
  if (await Admin.exists({ email })) return;
  const { salt, hash } = hashPassword(password);
  await Admin.create({ name: "CeylonGo Administrator", email, passwordSalt: salt, passwordHash: hash });
  console.warn("Configured administrator initialized.");
};
