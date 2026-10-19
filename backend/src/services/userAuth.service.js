import crypto from "crypto";
import User from "../models/User.js";
import { hashPassword, verifyPassword } from "./adminAuth.service.js";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const ephemeralTokenSecret = crypto.randomBytes(32).toString("hex");
const tokenSecret = () =>
  process.env.USER_TOKEN_SECRET ||
  process.env.ADMIN_TOKEN_SECRET ||
  ephemeralTokenSecret;

const sign = (payload) =>
  crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");

export const createUserToken = (user) => {
  const payload = encode({
    sub: String(user._id),
    role: "user",
    exp: Date.now() + 8 * 60 * 60 * 1000,
  });
  return `${payload}.${sign(payload)}`;
};

export const verifyUserToken = (token) => {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) throw new Error("Missing token");
  const expected = sign(payload);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) throw new Error("Bad signature");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.role !== "user" || claims.exp < Date.now() || !claims.sub) {
    throw new Error("Expired token");
  }
  return claims;
};

const bearerToken = (req) =>
  String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();

export const authenticateUser = (req, res, next) => {
  try {
    const claims = verifyUserToken(bearerToken(req));
    req.user = { _id: claims.sub, role: claims.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: "User authentication required." });
  }
};

export const optionalAuthenticateUser = (req, res, next) => {
  const token = bearerToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
  return authenticateUser(req, res, next);
};

export const registerUser = async ({ name, email, password }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail })) return null;
  const { salt, hash } = hashPassword(password);
  return User.create({
    name: String(name || "").trim(),
    email: normalizedEmail,
    passwordSalt: salt,
    passwordHash: hash,
  });
};

export const validateUserCredentials = async (email, password) => {
  const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
  if (!user || !verifyPassword(String(password || ""), user.passwordSalt, user.passwordHash)) {
    return null;
  }
  return user;
};
