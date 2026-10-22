import mongoose from "mongoose";
import { env, sanitizeMongoUri } from "../config/env.js";

export type DbStatus = "connected" | "disconnected" | "connecting" | "not_configured";

export interface DatabaseStatus {
  status: DbStatus;
  dbName?: string;
  host?: string;
  error?: string;
  connectedAt?: string;
}

let dbState: DatabaseStatus = {
  status: env.MONGODB_URI ? "disconnected" : "not_configured",
  dbName: env.MONGODB_DB_NAME
};

// Listen to Mongoose connection events
mongoose.connection.on("connected", () => {
  dbState = {
    status: "connected",
    dbName: mongoose.connection.name || env.MONGODB_DB_NAME,
    host: mongoose.connection.host || "atlas-cluster",
    connectedAt: new Date().toISOString()
  };
  console.log(
    `[Database] Connected successfully to MongoDB (DB: "${dbState.dbName}", Host: ${dbState.host})`
  );
});

mongoose.connection.on("disconnected", () => {
  if (dbState.status === "connected") {
    dbState = {
      ...dbState,
      status: "disconnected",
      error: "Connection to MongoDB lost"
    };
    console.warn("[Database] MongoDB connection lost.");
  }
});

mongoose.connection.on("error", (err) => {
  const safeMessage = err instanceof Error ? err.message : String(err);
  dbState = {
    ...dbState,
    status: "disconnected",
    error: safeMessage
  };
  console.error(`[Database] MongoDB connection event error: ${safeMessage}`);
});

/**
 * Initializes connection to MongoDB Atlas.
 * Resolves with boolean indicating whether connection succeeded.
 * Never throws — handles missing configuration or connection errors gracefully.
 */
export async function connectDatabase(): Promise<boolean> {
  if (!env.MONGODB_URI) {
    dbState = {
      status: "not_configured",
      dbName: env.MONGODB_DB_NAME
    };
    console.log(
      "[Database] MONGODB_URI is not set. Operating in database-free mode (local audits will run without persistence)."
    );
    return false;
  }

  dbState = {
    status: "connecting",
    dbName: env.MONGODB_DB_NAME
  };

  console.log(
    `[Database] Attempting connection to MongoDB (${sanitizeMongoUri(env.MONGODB_URI)})...`
  );

  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    dbState = {
      status: "connected",
      dbName: mongoose.connection.name || env.MONGODB_DB_NAME,
      host: mongoose.connection.host || "atlas-cluster",
      connectedAt: new Date().toISOString()
    };
    return true;
  } catch (error) {
    let safeMessage = "Unknown connection error";
    if (error instanceof Error) {
      safeMessage = error.message;
      // Safeguard: redact any accidental URI reflections
      safeMessage = safeMessage.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "<redacted-uri>");
    }

    dbState = {
      status: "disconnected",
      dbName: env.MONGODB_DB_NAME,
      error: safeMessage
    };

    console.warn(
      `[Database] MongoDB connection could not be established: ${safeMessage}`
    );
    console.warn(
      "[Database] Continuing in fallback mode — API remains fully operational without persistence."
    );
    return false;
  }
}

/**
 * Cleanly closes the database connection.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    dbState = {
      status: "disconnected",
      dbName: env.MONGODB_DB_NAME
    };
    console.log("[Database] MongoDB disconnected cleanly.");
  }
}

/**
 * Returns current database status suitable for health checks and status indicators.
 * Never returns credentials or sensitive connection strings.
 */
export function getDatabaseStatus(): DatabaseStatus {
  return { ...dbState };
}
