// backend/src/routes/index.js
import { Router } from "express";

import { authRouter } from "./auth.js";
import { memberRouter } from "./members.js";
import { recordsRouter } from "./records.js";
import { adminRouter } from "./admin.js";

// Existing statements routes (plural)
import { statementsRouter } from "./statements.js";

// New PDFKit statement routes (singular)
import { statementRouter } from "./statement.js";

export const apiRouter = Router();

// Auth
apiRouter.use("/auth", authRouter);

// Core
apiRouter.use("/members", memberRouter);
apiRouter.use("/records", recordsRouter);
apiRouter.use("/admin", adminRouter);

// Statements
apiRouter.use("/statements", statementsRouter); // existing endpoints
apiRouter.use("/statement", statementRouter);   // new PDF endpoints (e.g. GET /api/statement/pdf)
