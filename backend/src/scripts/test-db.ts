import mongoose from "mongoose";
import { env, sanitizeMongoUri } from "../config/env.js";

async function runTest() {
  console.log("\n==========================================");
  console.log("   TrackSeo MongoDB Atlas Verification");
  console.log("==========================================\n");

  if (!env.MONGODB_URI) {
    console.log("Status: ⚠️  MONGODB_URI is NOT set in backend/.env");
    console.log("Action: Create backend/.env by copying backend/.env.example and setting MONGODB_URI.");
    console.log("Note:   The application continues to function without it (in-memory/no persistence).\n");
    process.exit(0);
  }

  console.log(`Connecting to: ${sanitizeMongoUri(env.MONGODB_URI)}`);
  console.log(`Database name: ${env.MONGODB_DB_NAME}`);
  console.log("Connecting (5s timeout)...\n");

  const startTime = Date.now();

  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    const duration = Date.now() - startTime;
    console.log("✅ Successfully connected to MongoDB Atlas!");
    console.log(`⏱️  Latency: ${duration}ms`);
    console.log(`🏢 Host: ${mongoose.connection.host}`);
    console.log(`📁 Database: ${mongoose.connection.name}`);

    // Ping the admin database
    const adminDb = mongoose.connection.db?.admin();
    if (adminDb) {
      await adminDb.ping();
      console.log("📡 Database ping: OK (Cluster is responsive)");
    }

    await mongoose.disconnect();
    console.log("\nVerification complete. Ready for Stage C.\n");
    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Connection failed after ${duration}ms\n`);

    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
      // Strip any sensitive credentials
      message = message.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "<redacted-uri>");
    }

    console.log("Diagnostic details:");
    console.log(`  Error: ${message}\n`);

    if (message.includes("ETIMEOUT") || message.includes("Server selection timed out")) {
      console.log("💡 Common cause: Network IP Whitelist.");
      console.log("   Go to MongoDB Atlas -> Network Access -> Add IP Address -> 'Allow Access From Anywhere' (0.0.0.0/0) or your current IP.\n");
    } else if (message.includes("bad auth") || message.includes("Authentication failed")) {
      console.log("💡 Common cause: Database User Credentials.");
      console.log("   Check the username and password in MONGODB_URI. If password contains special characters, ensure they are URL-encoded.\n");
    }

    await mongoose.disconnect();
    process.exit(1);
  }
}

void runTest();
