import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { apiRouter } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errors.js";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing. Create backend/.env and set JWT_SECRET.");
}

const app = express();
app.set("trust proxy", 1); // important on Render (proxy)

const PORT = process.env.PORT || 4000;

/**
 * CORS
 * - Allow multiple origins using comma-separated env var:
 *   CORS_ORIGIN="https://nbsc-coop-app.onrender.com,http://localhost:5173"
 */
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // allow non-browser tools (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Must be BEFORE routes
app.use(cors(corsOptions));
// ✅ Explicitly handle preflight for all routes
app.options("*", cors(corsOptions));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) => res.json({ status: "OK", service: "NBSC Backend", time: new Date() }));

// API routes
app.use("/api", apiRouter);

// Root (for quick check)
app.get("/", (req, res) => {
  res.send("NBSC Backend API is working 🚀");
});

// Errors LAST
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`NBSC Kaduna API listening on http://localhost:${PORT}`);
});
