// backend/src/routes/index.js
import { Router } from "express";

import { authRouter } from "./auth.js";
import { memberRouter } from "./members.js";
import { recordsRouter } from "./records.js";
import { adminRouter } from "./admin.js";
import { statementsRouter } from "./statements.js";
import { statementRouter } from "./statement.js"; // <-- singular PDF route

export const apiRouter = Router();

// auth
apiRouter.use("/auth", authRouter);

// core
apiRouter.use("/members", memberRouter);
apiRouter.use("/records", recordsRouter);
apiRouter.use("/admin", adminRouter);

// existing endpoints
apiRouter.use("/statements", statementsRouter);

// new pdf endpoint
apiRouter.use("/statement", statementRouter);
