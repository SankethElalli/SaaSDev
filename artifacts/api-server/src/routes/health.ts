import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Lightweight keep-alive endpoint — ping this every 14 min to prevent Render cold starts
router.get("/ping", (_req, res) => {
  res.json({ ok: true, t: Date.now() });
});

export default router;
