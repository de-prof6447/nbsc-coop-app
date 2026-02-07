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
const PORT = process.env.PORT || 4000;

// If you serve frontend from the same backend (recommended), you don't need CORS in production.
// Keep it enabled for dev only (when frontend runs on :5173).
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// ✅ Health checks (put BEFORE notFound/errorHandler)
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) =>
  res.json({ status: "OK", service: "NBSC Backend", time: new Date().toISOString() })
);

/**
 * Serve React build (frontend/dist)
 * IMPORTANT:
 * - This must be BEFORE notFound/errorHandler
 * - Do NOT define app.get("/") JSON route, or it will block the frontend
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.join(__dirname, "../../frontend/dist");
const templatesDir = path.join(__dirname, "../../frontend/public/templates");

// Only serve static if the build exists (helps in dev)
app.use(express.static(frontendDist));
// Serve downloadable import templates even if you haven't rebuilt the frontend.
app.use("/templates", express.static(templatesDir));

// API routes
app.use("/api", apiRouter);

// If frontend build exists, serve SPA for all non-API routes (/, /login, /change-password, etc.)
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const indexPath = path.join(frontendDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) return next(); // if build not present, fall through to notFound
  });
});

// ✅ keep these LAST
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`NBSC Kaduna API listening on http://localhost:${PORT}`);
});
