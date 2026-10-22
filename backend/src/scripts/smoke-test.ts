/**
 * TrackSeo Comprehensive System Smoke Test
 * Tests all core subsystems against a running backend instance.
 * Run via: npm run test:smoke (or tsx src/scripts/smoke-test.ts)
 */

const BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

interface TestResult {
  step: string;
  endpoint: string;
  status: "PASS" | "FAIL";
  details?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function assertStep(
  name: string,
  endpoint: string,
  fn: () => Promise<{ ok: boolean; message: string }>
) {
  const start = Date.now();
  try {
    const res = await fn();
    const durationMs = Date.now() - start;
    if (res.ok) {
      results.push({ step: name, endpoint, status: "PASS", details: res.message, durationMs });
      console.log(`  [PASS] ${name} (${durationMs}ms): ${res.message}`);
    } else {
      results.push({ step: name, endpoint, status: "FAIL", details: res.message, durationMs });
      console.error(`  [FAIL] ${name} (${durationMs}ms): ${res.message}`);
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ step: name, endpoint, status: "FAIL", details: err.message, durationMs });
    console.error(`  [ERROR] ${name} (${durationMs}ms): ${err.message}`);
  }
}

async function run() {
  console.log("\n========================================================");
  console.log("       TrackSeo System-Wide End-to-End Smoke Test");
  console.log(`       Target Server: ${BASE_URL}`);
  console.log("========================================================\n");

  let auditId: string | null = null;
  let experimentId: string | null = null;

  // 1. Health & Infrastructure
  console.log("--- 1. Infrastructure & Diagnostics ---");
  await assertStep("Core Health Check", "GET /api/health", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json() as any;
    const ok = res.status === 200 && data.success === true && data.data?.status === "healthy";
    return {
      ok,
      message: `Status: ${data.data?.status}, DB: ${data.data?.database?.status}, Timestamp: ${data.data?.timestamp}`
    };
  });

  await assertStep("Database Diagnostic", "GET /api/health/db", async () => {
    const res = await fetch(`${BASE_URL}/api/health/db`);
    const data = await res.json() as any;
    const ok = res.status === 200 && data.success === true && !!data.data?.status;
    return {
      ok,
      message: `DB Status: ${data.data?.status}, DB Name: ${data.data?.dbName}`
    };
  });

  await assertStep("Crawler Service Diagnostic", "GET /api/crawl/browserbase/status", async () => {
    const res = await fetch(`${BASE_URL}/api/crawl/browserbase/status`);
    const data = await res.json() as any;
    const ok = res.status === 200 && data.success === true && typeof data.data?.configured === "boolean";
    return {
      ok,
      message: `Engine: ${data.data?.engine}, Browserbase configured: ${data.data?.configured}`
    };
  });

  // 2. Live SEO Auditing & Technical Signals
  console.log("\n--- 2. Live SEO Auditing & Technical Signals ---");
  await assertStep("Execute SEO Audit (example.com)", "POST /api/audit", async () => {
    const res = await fetch(`${BASE_URL}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" })
    });
    const data = await res.json() as any;
    if (res.status === 200 && data.data && data.data.auditId) {
      auditId = data.data.auditId;
      const score = data.data.healthScore ?? "N/A";
      const findingsCount = data.data.findings?.length ?? 0;
      return {
        ok: true,
        message: `Audit ID: ${auditId}, HealthScore: ${score}/100, Findings: ${findingsCount}`
      };
    }
    return { ok: false, message: data.message || `HTTP ${res.status}` };
  });

  // 3. Audit Registry
  console.log("\n--- 3. Audit History Registry ---");
  await assertStep("List Audit History", "GET /api/audit/history", async () => {
    const res = await fetch(`${BASE_URL}/api/audit/history?page=1&limit=10`);
    const data = await res.json() as any;
    const items = data.data?.items ?? [];
    return {
      ok: res.status === 200 && Array.isArray(items),
      message: `Total audits listed: ${data.data?.pagination?.total ?? items.length}`
    };
  });

  // 4. Report Exports (JSON, CSV, HTML)
  if (auditId) {
    console.log("\n--- 4. Multi-Format Report Exports ---");
    await assertStep("Export Audit as JSON", `GET /api/audit/${auditId}/export?format=json`, async () => {
      const res = await fetch(`${BASE_URL}/api/audit/${auditId}/export?format=json`);
      const text = await res.text();
      const parsed = JSON.parse(text);
      return {
        ok: res.status === 200 && parsed.audit && parsed.audit.url.includes("example.com"),
        message: `Content-Type: ${res.headers.get("content-type")}, Size: ${text.length} bytes`
      };
    });

    await assertStep("Export Audit as CSV", `GET /api/audit/${auditId}/export?format=csv`, async () => {
      const res = await fetch(`${BASE_URL}/api/audit/${auditId}/export?format=csv`);
      const text = await res.text();
      return {
        ok: res.status === 200 && text.includes("TRACKSEO AUDIT REPORT") && text.includes("Finding ID"),
        message: `Content-Type: ${res.headers.get("content-type")}, Lines: ${text.split("\n").length}`
      };
    });

    await assertStep("Export Audit as Standalone HTML/PDF", `GET /api/audit/${auditId}/export?format=html`, async () => {
      const res = await fetch(`${BASE_URL}/api/audit/${auditId}/export?format=html`);
      const text = await res.text();
      return {
        ok: res.status === 200 && text.includes("<!DOCTYPE html>") && text.includes("PRINT / SAVE PDF"),
        message: `Content-Type: ${res.headers.get("content-type")}, HTML Size: ${text.length} bytes`
      };
    });
  }

  // 5. SEO Experiments & A/B Testing Workspace
  console.log("\n--- 5. SEO Experiments & A/B Hypothesis Testing ---");
  await assertStep("Create Experiment Hypothesis", "POST /api/experiments", async () => {
    const res = await fetch(`${BASE_URL}/api/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Title Length Optimization",
        targetUrl: "https://example.com",
        hypothesis: "Adding targeted brand keywords to title will improve crawl relevance.",
        category: "title_tag",
        baseline: {
          healthScore: 85,
          capturedAt: new Date().toISOString(),
          findingsSummary: { pass: 5, warning: 1, info: 1 },
          titleLength: 45,
          metaDescriptionLength: 130,
          h1Count: 1,
          estimatedFcpMs: 400
        }
      })
    });
    const data = await res.json() as any;
    if (res.status === 201 && data.data?.experimentId) {
      experimentId = data.data.experimentId;
      return {
        ok: true,
        message: `Experiment ID: ${experimentId}, Status: ${data.data.status}`
      };
    }
    return { ok: false, message: data.message || `HTTP ${res.status}` };
  });

  if (experimentId) {
    await assertStep("Record Variant Audit & Compute Delta", `POST /api/experiments/${experimentId}/variant`, async () => {
      const res = await fetch(`${BASE_URL}/api/experiments/${experimentId}/variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: {
            healthScore: 94,
            capturedAt: new Date().toISOString(),
            findingsSummary: { pass: 7, warning: 0, info: 1 },
            titleLength: 55,
            metaDescriptionLength: 145,
            h1Count: 1,
            estimatedFcpMs: 370,
            notes: "Variant optimized title tag and description"
          }
        })
      });
      const data = await res.json() as any;
      const verdict = data.data?.delta?.verdict ?? "unknown";
      return {
        ok: res.status === 200 && data.data?.variant,
        message: `Variant recorded! Verdict: ${verdict}, Score Delta: ${data.data?.delta?.scoreDelta ?? 0}`
      };
    });

    await assertStep("Fetch Experiment Stats & List", "GET /api/experiments", async () => {
      const res = await fetch(`${BASE_URL}/api/experiments`);
      const data = await res.json() as any;
      const stats = data.data?.stats;
      return {
        ok: res.status === 200 && stats && typeof stats.total === "number",
        message: `Total: ${stats?.total}, Completed: ${stats?.completed}, WinRate: ${stats?.winRate ?? 0}%`
      };
    });

    await assertStep("Cleanup Test Experiment", `DELETE /api/experiments/${experimentId}`, async () => {
      const res = await fetch(`${BASE_URL}/api/experiments/${experimentId}`, {
        method: "DELETE"
      });
      return {
        ok: res.status === 200,
        message: "Deleted smoke test experiment successfully"
      };
    });
  }

  // 6. Bounded Crawling Engine
  console.log("\n--- 6. Bounded Crawling Engine ---");
  await assertStep("Initiate Bounded Crawl", "POST /api/crawl", async () => {
    const res = await fetch(`${BASE_URL}/api/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        maxPages: 3,
        maxDepth: 1
      })
    });
    const data = await res.json() as any;
    const jobId = data.data?.jobId;
    if (res.status === 202 && jobId) {
      // Brief poll
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const pollRes = await fetch(`${BASE_URL}/api/crawl/${jobId}`);
      const pollData = await pollRes.json() as any;
      return {
        ok: true,
        message: `Job ID: ${jobId}, Status: ${pollData.data?.status}, Crawled Pages: ${pollData.data?.pages?.length ?? 0}`
      };
    }
    return { ok: false, message: data.message || `HTTP ${res.status}` };
  });

  // Summary
  console.log("\n========================================================");
  console.log("                     SMOKE TEST SUMMARY");
  console.log("========================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`Total Steps Tested: ${total}`);
  console.log(`Passed:             ${passed} / ${total}`);
  console.log(`Failed:             ${failed} / ${total}`);

  if (failed > 0) {
    console.error("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All smoke tests passed flawlessly! System is production-ready.\n");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
