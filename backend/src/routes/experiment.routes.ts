import { Router } from "express";
import { experimentService } from "../services/experiment.service.js";

const router = Router();

// GET /api/experiments — List experiments and overall stats
router.get("/", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = Number(req.query.limit) || 20;

    const data = await experimentService.listExperiments({ status, search, limit });
    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to list experiments."
    });
  }
});

// POST /api/experiments — Create a new hypothesis test
router.post("/", async (req, res) => {
  try {
    const { title, targetUrl, hypothesis, category, baseline, notes } = req.body || {};

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ success: false, message: "Provide a test title." });
      return;
    }
    if (!targetUrl || typeof targetUrl !== "string" || !targetUrl.trim()) {
      res.status(400).json({ success: false, message: "Provide a target URL." });
      return;
    }
    if (!hypothesis || typeof hypothesis !== "string" || !hypothesis.trim()) {
      res.status(400).json({ success: false, message: "Provide a hypothesis statement." });
      return;
    }
    if (!baseline || typeof baseline !== "object" || typeof baseline.healthScore !== "number") {
      res.status(400).json({
        success: false,
        message: "Provide a valid baseline snapshot with healthScore."
      });
      return;
    }

    const created = await experimentService.createExperiment({
      title: title.trim(),
      targetUrl: targetUrl.trim(),
      hypothesis: hypothesis.trim(),
      category: category || "title_tag",
      baseline,
      notes: typeof notes === "string" ? notes.trim() : ""
    });

    res.status(201).json({
      success: true,
      message: "SEO experiment initialized.",
      data: created
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to create experiment."
    });
  }
});

// GET /api/experiments/:id — Get details of a single experiment
router.get("/:id", async (req, res) => {
  try {
    const experiment = await experimentService.getExperimentById(req.params.id);
    if (!experiment) {
      res.status(404).json({ success: false, message: "Experiment not found." });
      return;
    }

    res.json({ success: true, data: experiment });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to retrieve experiment."
    });
  }
});

// PATCH /api/experiments/:id — Update experiment notes, status, or conclusion
router.patch("/:id", async (req, res) => {
  try {
    const { title, hypothesis, status, notes, conclusion } = req.body || {};
    const updated = await experimentService.updateExperiment(req.params.id, {
      title,
      hypothesis,
      status,
      notes,
      conclusion
    });

    if (!updated) {
      res.status(404).json({ success: false, message: "Experiment not found." });
      return;
    }

    res.json({
      success: true,
      message: "Experiment updated.",
      data: updated
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to update experiment."
    });
  }
});

// POST /api/experiments/:id/variant — Record variant audit snapshot and calculate delta
router.post("/:id/variant", async (req, res) => {
  try {
    const { variant } = req.body || {};
    if (!variant || typeof variant !== "object" || typeof variant.healthScore !== "number") {
      res.status(400).json({
        success: false,
        message: "Provide a valid variant snapshot with healthScore."
      });
      return;
    }

    const updated = await experimentService.recordVariant(req.params.id, variant);
    if (!updated) {
      res.status(404).json({ success: false, message: "Experiment not found." });
      return;
    }

    res.json({
      success: true,
      message: "Variant comparison snapshot recorded.",
      data: updated
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to record variant."
    });
  }
});

// DELETE /api/experiments/:id — Remove an experiment
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await experimentService.deleteExperiment(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Experiment not found." });
      return;
    }

    res.json({
      success: true,
      message: "Experiment removed."
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to delete experiment."
    });
  }
});

export default router;
