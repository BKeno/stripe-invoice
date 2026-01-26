/**
 * Localhost-only admin endpoint middleware with API key authentication.
 *
 * Dual-layer security:
 * 1. IP check - only allows requests from localhost (127.0.0.1, ::1)
 * 2. API key check - validates Authorization: Bearer <ADMIN_API_KEY>
 *
 * Use case: Manual processing of old payments, retry failed invoices, etc.
 *
 * Usage on Railway:
 *   railway shell
 *   curl -H "Authorization: Bearer ${ADMIN_API_KEY}" \
 *        -X POST http://localhost:8080/admin/process-payment/pi_xxx
 */

import type { Request, Response, NextFunction } from "express";

export const localhostOnly = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Layer 1: IP check
  const ip = req.ip || req.socket.remoteAddress;

  if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
    res.status(403).json({ error: "Access denied - localhost only" });
    return;
  }

  // Layer 2: API key check
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!adminApiKey) {
    console.error("[ADMIN] ADMIN_API_KEY not configured in environment");
    res.status(500).json({ error: "Server configuration error" });
    return;
  }

  if (!token || token !== adminApiKey) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  next();
};
