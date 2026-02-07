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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend locations (monorepo: /frontend)
const frontendDist = path.join(__dirname, "../../frontend/dist");
const indexHtml = path.join(frontendDist, "index.html");
const templatesDir = path.join(__dirname, "../../frontend/public/templates");
const hasFrontendBuild = fs.existsSync(indexHtml);

// Middleware
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS (safe defaults)
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
if (process.env.NODE_ENV !== "production") {
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
}

// Rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

// Health endpoints
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/health", (req, res) =>
  res.json({
    status: "OK",
    service: "NBSC Backend",
    time: new Date().toISOString(),
  })
);

// Serve templates always (even if frontend not built)
if (fs.existsSync(templatesDir)) {
  app.use("/templates", express.static(templatesDir));
}

// API routes
app.use("/api", apiRouter);

// Serve frontend if built; otherwise give a simple root message
if (hasFrontendBuild) {
  app.use(express.static(frontendDist));

  // SPA fallback (ONLY when build exists)
  app.get(/^\/(?!api\/|templates\/).*/, (req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  // No frontend build on server yet
  app.get("/", (req, res) => {
    res
      .status(200)
      .send("NBSC Backend API is working 🚀 (frontend build not found on this server)");
  });
}

// 404 + error handler LAST
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`NBSC Kaduna API listening on http://localhost:${PORT}`);
});
