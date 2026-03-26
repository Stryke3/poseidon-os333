import express from "express";
import availityRoutes from "./modules/availity/availity.routes.js";
import payerBehaviorRoutes from "./modules/payer-behavior/payerBehavior.routes.js";
import playbookRoutes from "./modules/playbook/playbook.routes.js";
import governanceRoutes from "./modules/governance/governance.routes.js";
import learningRoutes from "./modules/learning/learning.routes.js";
import validatorRoutes from "./modules/validation/validator.routes.js";
import denialRoutes from "./modules/denials/denial.routes.js";
import { errorHandler } from "./modules/availity/availity.error-handler.js";
import { integrationRateLimiter } from "./lib/rate-limit.js";

const app = express();

app.use(express.json());

app.get("/live", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.use(
  "/api/integrations/availity",
  integrationRateLimiter,
  availityRoutes,
);

app.use("/api/intelligence/payer", integrationRateLimiter, payerBehaviorRoutes);

app.use("/api/playbooks", integrationRateLimiter, playbookRoutes);

app.use(
  "/api/intelligence/governance",
  integrationRateLimiter,
  governanceRoutes,
);

// Learning UI (admin pages use `/api/learning/*`).
app.use("/api/learning", integrationRateLimiter, learningRoutes);

// Pre-submit packet validation before Availity submission.
app.use("/api/validation", validatorRoutes);

// Denial-to-appeal automation engine.
app.use("/api/denials", integrationRateLimiter, denialRoutes);

app.use(errorHandler);

export default app;
