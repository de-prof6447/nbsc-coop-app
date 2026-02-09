// backend/src/server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errors.js";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing. Create backend/.env and set JWT_SECRET.");
}

const app = express();
const PORT = process.env.PORT || 4000;

/**
 * Render runs behind a proxy.
 * This is required so secure cookies + req.ip work correctly.
 */
app.set("trust proxy", 1);

/**
 * CORS
 * Set env on Render backend:
 *   CORS_ORIGIN=https://nbsc-coop-app.onrender.com
 * (You can add multiple origins separated by commas)
 */
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // allow same-origin / server-to-server requests (no Origin header)
    if (!origin) return cb(null, true);

    if (corsOrigins.includes(origin)) return cb(null, true);

    // return false instead of throwing to avoid noisy crashes
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Security + logs
app.use(helmet());
app.use(morgan("dev"));

// Body sizes: increase to support uploads/large payloads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// CORS must be before routes
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Health
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", service: "NBSC Backend", time: new Date().toISOString() });
});

/**
 * Serve React build if present (optional).
 * If you host frontend separately on Render Static Site, it's okay if dist is missing here.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDist = path.join(__dirname, "../../frontend/dist");
const templatesDir = path.join(__dirname, "../../frontend/public/templates");

const indexPath = path.join(frontendDist, "index.html");
const hasFrontendBuild = fs.existsSync(indexPath);

if (hasFrontendBuild) {
  app.use(express.static(frontendDist));
  app.use("/templates", express.static(templatesDir));
}

// API routes
app.use("/api", apiRouter);

// SPA fallback only when frontend build exists on backend service
if (hasFrontendBuild) {
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(indexPath);
  });
} else {
  app.get("/", (req, res) => {
    res.send("NBSC Backend API is working 🚀");
  });
}

// 404 + error handler must be last
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`NBSC Kaduna API listening on http://localhost:${PORT}`);
});
