// backend/src/routes/index.js
import { Router } from "express";
import { authRouter } from "./auth.js";
import { memberRouter } from "./members.js";
import { recordsRouter } from "./records.js";
import { adminRouter } from "./admin.js";
import { statementsRouter } from "./statements.js";
import { statementRouter } from "./statement.js";
import { apiRouter } from "./routes/index.js";

app.use("/api", apiRouter);

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/members", memberRouter);
apiRouter.use("/records", recordsRouter);
apiRouter.use("/admin", adminRouter);

// existing endpoints (plural)
apiRouter.use("/statements", statementsRouter);

// new pdf endpoint (singular)
apiRouter.use("/statement", statementRouter);
