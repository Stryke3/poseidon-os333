import rateLimit from "express-rate-limit";

/** 30 requests per minute per IP on integration endpoints */
export const integrationRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — try again later" },
});
