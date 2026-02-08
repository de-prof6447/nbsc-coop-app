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
 * IMPORTANT for Render/Proxy:
 * Needed so secure cookies work correctly behind the proxy.
 */
app.set("trust proxy", 1);

const corsOriginsEnv = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Allow same-origin / server-to-server calls (no Origin header)
    if (!origin) return cb(null, true);

    if (corsOriginsEnv.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS must be BEFORE routes
app.use(cors(corsOptions));
// Ensure preflight requests succeed
app.options("*", cors(corsOptions));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Health checks
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", service: "NBSC Backend", time: new Date() });
});

// Serve frontend build if present
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

// SPA fallback (ONLY if frontend exists)
if (hasFrontendBuild) {
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(indexPath);
  });
} else {
  // If no frontend build on backend service, show a simple message at /
  app.get("/", (req, res) => {
    res.send("NBSC Backend API is working 🚀 (frontend build not found on this server)");
  });
}

// 404 + error handler must be last
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`NBSC Kaduna API listening on http://localhost:${PORT}`);
});
