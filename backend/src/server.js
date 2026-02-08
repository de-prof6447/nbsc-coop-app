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
app.set("trust proxy", 1); // IMPORTANT on Render

const PORT = process.env.PORT || 4000;

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS must be BEFORE routes
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin or server-to-server calls with no Origin header
      if (!origin) return cb(null, true);
      if (origin === corsOrigin) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Ensure preflight always responds
app.options("*", cors());

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.join(__dirname, "../../frontend/dist");
const templatesDir = path.join(__dirname, "../../frontend/public/templates");

app.use(express.static(frontendDist));
app.use("/templates", express.static(templatesDir));

app.use("/api", apiRouter);

app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const indexPath = path.join(frontendDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) return next();
  });
});

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`NBSC Kaduna API listening on http://localhost:${PORT}`);
});
