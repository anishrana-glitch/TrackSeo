import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./db/connection.js";

async function startServer() {
  // Connect to database (gracefully falls back if MONGODB_URI is absent or unreachable)
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`TrackSeo API running at http://localhost:${env.PORT}`);
    console.log(`Health check: http://localhost:${env.PORT}/api/health`);
    console.log(`Database health: http://localhost:${env.PORT}/api/health/db`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      console.log("TrackSeo server shut down cleanly.");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void startServer();
