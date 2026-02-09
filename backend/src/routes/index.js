// backend/src/routes/index.js
import { Router } from "express";
import { authRouter } from "./auth.js";
import { memberRouter } from "./members.js";
import { recordsRouter } from "./records.js";
import { adminRouter } from "./admin.js";
import { statementsRouter } from "./statements.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/members", memberRouter);
apiRouter.use("/records", recordsRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/statements", statementsRouter); // => /api/statements/pdf
