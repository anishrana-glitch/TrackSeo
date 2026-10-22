import "dotenv/config";

export interface AppConfig {
  PORT: number;
  NODE_ENV: string;
  FRONTEND_URL: string;
  MONGODB_URI?: string;
  MONGODB_DB_NAME: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  BROWSERBASE_API_KEY?: string;
  BROWSERBASE_PROJECT_ID?: string;
}

function cleanEnvString(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("<") ||
    trimmed.startsWith("YOUR_")
  ) {
    return undefined;
  }
  return trimmed;
}

export const env: AppConfig = {
  PORT: Number(process.env.PORT) || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  MONGODB_URI: cleanEnvString(process.env.MONGODB_URI),
  MONGODB_DB_NAME: cleanEnvString(process.env.MONGODB_DB_NAME) || "trackseo",
  GEMINI_API_KEY: cleanEnvString(process.env.GEMINI_API_KEY),
  GEMINI_MODEL: cleanEnvString(process.env.GEMINI_MODEL) || "gemini-2.5-flash",
  BROWSERBASE_API_KEY: cleanEnvString(process.env.BROWSERBASE_API_KEY),
  BROWSERBASE_PROJECT_ID: cleanEnvString(process.env.BROWSERBASE_PROJECT_ID)
};

/**
 * Strips password and sensitive auth parameters from a MongoDB connection string.
 * Returns a safe representation suitable for diagnostics and logging.
 */
export function sanitizeMongoUri(rawUri?: string): string {
  if (!rawUri) return "not_configured";
  try {
    if (rawUri.startsWith("mongodb://") || rawUri.startsWith("mongodb+srv://")) {
      const parsed = new URL(rawUri);
      if (parsed.password) {
        parsed.password = "******";
      }
      if (parsed.username) {
        parsed.username = "******";
      }
      return parsed.toString();
    }
    return "configured (custom format)";
  } catch {
    return rawUri.replace(/:\/\/.*@/, "://******:******@");
  }
}
