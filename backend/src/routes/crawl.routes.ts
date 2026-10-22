import { Router } from "express";
import { crawlerService } from "../services/crawler.service.js";

const router = Router();

// GET /api/crawl/browserbase/status — Check Browserbase integration status
router.get("/browserbase/status", (_req, res) => {
  const status = crawlerService.getBrowserbaseStatus();
  res.status(200).json({
    success: true,
    data: status
  });
});

// GET /api/crawl — List recent crawl jobs
router.get("/", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const jobs = await crawlerService.listCrawlJobs(limit);
    res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to load crawl jobs."
    });
  }
});

// POST /api/crawl — Start a bounded crawl job
router.post("/", async (req, res) => {
  try {
    const { url, maxPages, maxDepth, timeoutSeconds, useBrowserbase } = req.body || {};

    if (typeof url !== "string" || !url.trim()) {
      res.status(400).json({
        success: false,
        message: "A target website URL is required."
      });
      return;
    }

    const job = await crawlerService.startCrawlJob(url.trim(), {
      maxPages: Number(maxPages) || undefined,
      maxDepth: Number(maxDepth) || undefined,
      timeoutSeconds: Number(timeoutSeconds) || undefined,
      useBrowserbase: Boolean(useBrowserbase)
    });

    res.status(202).json({
      success: true,
      message: "Crawl job initialized and started.",
      data: job
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate crawl.";
    const isClientError = /valid absolute|only HTTP|credentials|not allowed|private or reserved|hostname could not be resolved/i.test(message);

    res.status(isClientError ? 400 : 500).json({
      success: false,
      message
    });
  }
});

// GET /api/crawl/:jobId — Get crawl job status and progress
router.get("/:jobId", async (req, res) => {
  try {
    const job = await crawlerService.getCrawlJob(req.params.jobId);
    if (!job) {
      res.status(404).json({
        success: false,
        message: "Crawl job not found."
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch crawl job."
    });
  }
});

// POST /api/crawl/:jobId/cancel — Cancel a running crawl job
router.post("/:jobId/cancel", (req, res) => {
  const cancelled = crawlerService.cancelCrawlJob(req.params.jobId);
  if (!cancelled) {
    res.status(404).json({
      success: false,
      message: "Crawl job not found or not in a cancellable state."
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: "Crawl job cancelled successfully."
  });
});

export default router;
