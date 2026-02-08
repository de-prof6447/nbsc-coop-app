// backend/src/routes/index.js
import { Router } from "express";

import { authRouter } from "./auth.js";
import { memberRouter } from "./members.js";
import { recordsRouter } from "./records.js";
import { adminRouter } from "./admin.js";

// Existing statements routes (plural) - keep if your app already uses it
import { statementsRouter } from "./statements.js";

// New PDFKit statement route (singular) from my earlier message
import { statementRouter } from "./statement.js";

export const apiRouter = Router();

// Auth
apiRouter.use("/auth", authRouter);

// Core
apiRouter.use("/members", memberRouter);
apiRouter.use("/records", recordsRouter);
apiRouter.use("/admin", adminRouter);

// Statements:
// 1) Keep your old endpoints under /statements (plural)
apiRouter.use("/statements", statementsRouter);

// 2) New PDF endpoint under /statement (singular)
//    This will serve: GET /api/statement/pdf
apiRouter.use("/statement", statementRouter);
