import crypto from "crypto";
import { promisify } from "util";
import AuthSession from "../models/AuthSession.js";
import Traveller from "../models/Traveller.js";
import Admin from "../models/Admin.js";

const scrypt = promisify(crypto.scrypt);
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const production = () => process.env.NODE_ENV === "production";
const cookieName = () => production() ? "__Host-ceylongo_session" : "ceylongo_session";
const cookieOptions = () => ({ httpOnly: true, secure: production(), sameSite: "strict", path: "/" });
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

export const allowedOrigins = () => (process.env.AUTH_ALLOWED_ORIGINS ||
  (production() ? "" : "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"))
  .split(",").map(value => value.trim()).filter(Boolean);

export const authCorsOptions = {
  credentials: true,
  origin: (origin, callback) => callback(null, !origin || allowedOrigins().includes(origin)),
};

// JSON-only writes plus an origin allowlist block cross-site form and fetch requests.
// Native clients do not send Origin. Their JSON content type is still required.
export const protectSessionRequest = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if ((req.headers.origin && !allowedOrigins().includes(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site") {
    return res.status(403).json({ success: false, message: "Request origin is not allowed." });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.is("application/json")) {
    return res.status(415).json({ success: false, message: "JSON request required." });
  }
  next();
};

export const sessionToken = req => {
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (/^[a-f0-9]{64}$/.test(bearer)) return bearer;
  const entries = String(req.headers.cookie || "").split(";").map(value => value.trim());
  const value = entries.find(entry => entry.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
};

export const revokeSession = async req => {
  const token = sessionToken(req);
  if (token) await AuthSession.deleteOne({ tokenHash: hashToken(token) });
};

export const clearSessionCookie = res => res.clearCookie(cookieName(), cookieOptions());

export const issueSession = async (req, res, user, role) => {
  await revokeSession(req);
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await AuthSession.create({ tokenHash: hashToken(token), userId: user._id, role, expiresAt });
  res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: SESSION_DURATION_MS });
  return { user: { id: String(user._id), name: user.name, email: user.email, role }, expiresAt,
    ...(!req.headers.origin && req.headers["x-ceylongo-client"] === "native" ? { token } : {}) };
};

export const readSession = async req => {
  const token = sessionToken(req);
  if (!token) return null;
  const session = await AuthSession.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const Model = session.role === "admin" ? Admin : Traveller;
  const user = await Model.findById(session.userId).select("_id name email");
  if (!user) return null;
  return { user: { id: String(user._id), name: user.name, email: user.email, role: session.role }, expiresAt: session.expiresAt };
};

export const hashTravellerPassword = async password => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return { passwordSalt: salt, passwordHash: hash.toString("hex") };
};

export const verifyTravellerPassword = async (password, user) => {
  const actual = await scrypt(password, user?.passwordSalt || "invalid-account-dummy-salt", 64);
  const expected = Buffer.from(user?.passwordHash || "00".repeat(64), "hex");
  return Boolean(user) && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

// Bounded per-process limiter; no extra store or dependency. Deployments with multiple
// API instances should also limit requests at their shared ingress.
const attempts = new Map();
export const limitAuthAttempts = (req, res, next) => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 30 || (!attempts.has(key) && attempts.size >= 10000)) {
    return res.status(429).json({ success: false, message: "Too many sign-in attempts. Try again later." });
  }
  entry.count++;
  attempts.set(key, entry);
  next();
};
