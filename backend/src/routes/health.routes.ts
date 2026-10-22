import { Router } from "express";
import { getDatabaseStatus } from "../db/connection.js";
import { geminiService } from "../services/gemini.service.js";
import { crawlerService } from "../services/crawler.service.js";

const router = Router();

router.get("/", (_req, res) => {
  const dbStatus = getDatabaseStatus();

  res.status(200).json({
    success: true,
    message: "TrackSeo API is running",
    data: {
      service: "TrackSeo Backend",
      status: "healthy",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus.status,
        dbName: dbStatus.dbName,
        ...(dbStatus.host ? { host: dbStatus.host } : {}),
        ...(dbStatus.connectedAt ? { connectedAt: dbStatus.connectedAt } : {}),
        ...(dbStatus.error ? { error: dbStatus.error } : {})
      },
      integrations: {
        gemini: {
          configured: geminiService.isConfigured()
        },
        browserbase: crawlerService.getBrowserbaseStatus()
      }
    }
  });
});

router.get("/db", (_req, res) => {
  const dbStatus = getDatabaseStatus();

  res.status(200).json({
    success: true,
    data: {
      status: dbStatus.status,
      dbName: dbStatus.dbName,
      ...(dbStatus.host ? { host: dbStatus.host } : {}),
      ...(dbStatus.connectedAt ? { connectedAt: dbStatus.connectedAt } : {}),
      ...(dbStatus.error ? { error: dbStatus.error } : {})
    }
  });
});

export default router;
