
import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import crawlRoutes from "./routes/crawl.routes.js";
import experimentRoutes from "./routes/experiment.routes.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "TrackSeo API",
    message: "Welcome to the TrackSeo backend"
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/crawl", crawlRoutes);
app.use("/api/experiments", experimentRoutes);

export default app;
