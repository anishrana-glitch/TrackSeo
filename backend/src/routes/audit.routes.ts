import { Router } from "express";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { historyService } from "../services/history.service.js";
import { geminiService, type SeoAuditContext } from "../services/gemini.service.js";
import { exportService, type ExportAuditData } from "../services/export.service.js";

const router = Router();

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

type Finding = {
  id: string;
  status: "pass" | "warning" | "info";
  title: string;
  details: string;
};

function isPublicIp(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

async function validatePublicUrl(value: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid absolute website URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local and internal hosts are not allowed.");
  }

  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new Error("Private or reserved IP addresses are not allowed.");
    }
  } else {
    let addresses;

    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("The website hostname could not be resolved.");
    }

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicIp(address))
    ) {
      throw new Error("The hostname resolves to a private or reserved IP.");
    }
  }

  url.hash = "";
  return url;
}

async function fetchPublicHtml(input: string): Promise<{
  html: string;
  finalUrl: string;
  statusCode: number;
  robotsHeader: string | null;
}> {
  let currentUrl = input;

  for (let redirectCount = 0; ; redirectCount++) {
    const safeUrl = await validatePublicUrl(currentUrl);

    let response: Response;

    try {
      response = await fetch(safeUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "TrackSeoAudit/0.1 (+user-initiated SEO audit)"
        }
      });
    } catch {
      throw new Error(
        "The website could not be fetched. It may be unavailable or too slow."
      );
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();

      if (!location) {
        throw new Error("The website returned an invalid redirect.");
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error("Too many redirects.");
      }

      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Website returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel();
      throw new Error("The URL did not return an HTML page.");
    }

    const declaredLength = Number(response.headers.get("content-length"));

    if (declaredLength > MAX_HTML_BYTES) {
      await response.body?.cancel();
      throw new Error("The HTML page exceeds the 1 MB audit limit.");
    }

    if (!response.body) {
      throw new Error("The website returned an empty response.");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        totalBytes += value.byteLength;

        if (totalBytes > MAX_HTML_BYTES) {
          await reader.cancel();
          throw new Error("The HTML page exceeds the 1 MB audit limit.");
        }

        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      html: new TextDecoder().decode(combined),
      finalUrl: safeUrl.toString(),
      statusCode: response.status,
      robotsHeader: response.headers.get("x-robots-tag")
    };
  }
}

async function probeOriginDiscovery(origin: string): Promise<{
  robotsTxtFound: boolean;
  robotsTxtUrl: string | null;
  sitemapFound: boolean;
  sitemapUrl: string | null;
}> {
  let robotsTxtFound = false;
  let robotsTxtUrl: string | null = null;
  let sitemapFound = false;
  let sitemapUrl: string | null = null;

  try {
    const robotsTarget = `${origin}/robots.txt`;
    const safeUrl = await validatePublicUrl(robotsTarget);
    const resp = await fetch(safeUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "TrackSeoAudit/0.1 (+robots probe)" }
    });

    if (resp.ok && resp.status === 200) {
      robotsTxtFound = true;
      robotsTxtUrl = safeUrl.toString();
      const txt = await resp.text();
      const sitemapMatch = txt.match(/^sitemap:\s*(https?:\/\/[^\s]+)/im);
      if (sitemapMatch && sitemapMatch[1]) {
        sitemapFound = true;
        sitemapUrl = sitemapMatch[1].trim();
      }
    }
  } catch {
    // Graceful fallback on network or DNS failure
  }

  if (!sitemapFound) {
    try {
      const sitemapTarget = `${origin}/sitemap.xml`;
      const safeSitemapUrl = await validatePublicUrl(sitemapTarget);
      const sitemapResp = await fetch(safeSitemapUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(2500),
        headers: { "User-Agent": "TrackSeoAudit/0.1 (+sitemap probe)" }
      });
      if (sitemapResp.ok && sitemapResp.status === 200) {
        sitemapFound = true;
        sitemapUrl = safeSitemapUrl.toString();
      }
    } catch {
      // Graceful fallback
    }
  }

  return { robotsTxtFound, robotsTxtUrl, sitemapFound, sitemapUrl };
}

router.post("/", async (req, res) => {
  const submittedUrl = req.body?.url;

  if (typeof submittedUrl !== "string" || submittedUrl.length > 2048) {
    res.status(400).json({
      success: false,
      message: "Provide a website URL of up to 2048 characters."
    });
    return;
  }

  try {
    const initialUrl = await validatePublicUrl(submittedUrl);
    const page = await fetchPublicHtml(initialUrl.toString());
    const $ = load(page.html);

    const title = $("title").first().text().trim();
    const description =
      $('meta[name="description" i]').attr("content")?.trim() || "";
    const canonicalHref = $('link[rel~="canonical" i]').first().attr("href");
    const canonical = canonicalHref
      ? new URL(canonicalHref, page.finalUrl).toString()
      : null;

    const headings = {
      h1: $("h1").length,
      h2: $("h2").length,
      h3: $("h3").length
    };

    const images = $("img").toArray();
    const imagesMissingAlt = images.filter(
      (image) => $(image).attr("alt") === undefined
    ).length;

    const robotsMeta = $('meta[name="robots" i]')
      .attr("content")
      ?.toLowerCase() || "";

    const noindex =
      /\bnoindex\b/i.test(robotsMeta) ||
      /\bnoindex\b/i.test(page.robotsHeader || "");

    const findings: Finding[] = [];

    findings.push({
      id: "title",
      status: !title ? "warning" : title.length > 60 ? "info" : "pass",
      title: "Page title",
      details: !title
        ? "No title tag was found."
        : `${title.length} characters: "${title}"`
    });

    findings.push({
      id: "description",
      status: !description
        ? "warning"
        : description.length > 160
          ? "info"
          : "pass",
      title: "Meta description",
      details: !description
        ? "No meta description was found."
        : `${description.length} characters.`
    });

    findings.push({
      id: "canonical",
      status: canonical ? "pass" : "warning",
      title: "Canonical URL",
      details: canonical || "No canonical link was found."
    });

    findings.push({
      id: "headings",
      status: headings.h1 === 1 ? "pass" : "warning",
      title: "H1 heading",
      details:
        headings.h1 === 0
          ? "No H1 heading was found."
          : headings.h1 > 1
            ? `Found ${headings.h1} H1 headings. Review the page structure.`
            : "Exactly one H1 heading was found."
    });

    findings.push({
      id: "images",
      status: imagesMissingAlt > 0 ? "warning" : "pass",
      title: "Image alt attributes",
      details: `${imagesMissingAlt} of ${images.length} images lack an alt attribute.`
    });

    findings.push({
      id: "robots",
      status: noindex ? "warning" : "pass",
      title: "Robots indexing directive",
      details: noindex
        ? "A noindex directive was detected. Search engines may exclude this page."
        : "No noindex directive was detected in the inspected headers or meta tag."
    });

    // Technical Extraction: OpenGraph
    const openGraph = {
      title: $('meta[property="og:title" i]').attr("content")?.trim() || null,
      description: $('meta[property="og:description" i]').attr("content")?.trim() || null,
      image: $('meta[property="og:image" i]').attr("content")?.trim() || null,
      url: $('meta[property="og:url" i]').attr("content")?.trim() || null,
      type: $('meta[property="og:type" i]').attr("content")?.trim() || null
    };

    // Technical Extraction: Twitter Card
    const twitterCard = {
      card: $('meta[name="twitter:card" i], meta[property="twitter:card" i]').attr("content")?.trim() || null,
      title: $('meta[name="twitter:title" i], meta[property="twitter:title" i]').attr("content")?.trim() || null,
      description: $('meta[name="twitter:description" i], meta[property="twitter:description" i]').attr("content")?.trim() || null,
      image: $('meta[name="twitter:image" i], meta[property="twitter:image" i]').attr("content")?.trim() || null
    };

    // Mobile Viewport & Charset
    const viewportContent = $('meta[name="viewport" i]').attr("content")?.trim() || null;
    const isViewportValid = viewportContent ? /width=device-width/i.test(viewportContent) : false;
    const charset = $('meta[charset]').attr("charset") || $('meta[http-equiv="Content-Type" i]').attr("content") || "utf-8";

    // Structured Data (JSON-LD)
    const structuredTypes: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).text();
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (item?.["@type"]) structuredTypes.push(String(item["@type"]));
            });
          } else if (parsed?.["@type"]) {
            structuredTypes.push(String(parsed["@type"]));
          }
        }
      } catch {
        // Ignore malformed JSON-LD
      }
    });

    // Performance Signals & Layout Shift Modeling
    const domNodes = $("*").length;
    const scriptsCount = $("script").length;
    const stylesheetsCount = $('link[rel="stylesheet"]').length;
    const htmlSizeBytes = Buffer.byteLength(page.html, "utf8");
    const imagesMissingDimensions = $("img:not([width]):not([height])").length;

    // Simulated Core Web Vitals
    const estimatedFcpMs = Math.round(250 + (htmlSizeBytes / 1024) * 1.5 + scriptsCount * 25 + stylesheetsCount * 20);
    const estimatedLcpMs = Math.round(estimatedFcpMs + (images.length > 0 ? 400 : 100));
    const clsRisk: "low" | "medium" | "high" =
      imagesMissingDimensions > 3 ? "high" : imagesMissingDimensions > 0 ? "medium" : "low";

    let perfScore = 100;
    if (htmlSizeBytes > 500_000) perfScore -= 20;
    else if (htmlSizeBytes > 200_000) perfScore -= 10;
    if (domNodes > 1500) perfScore -= 15;
    else if (domNodes > 800) perfScore -= 8;
    if (scriptsCount > 15) perfScore -= 15;
    else if (scriptsCount > 8) perfScore -= 8;
    if (clsRisk === "high") perfScore -= 15;
    else if (clsRisk === "medium") perfScore -= 7;
    perfScore = Math.max(30, perfScore);

    // Origin discovery probe (robots.txt & sitemap.xml)
    const origin = new URL(page.finalUrl).origin;
    const discovery = await probeOriginDiscovery(origin);

    // Extended Technical Findings
    const hasFullOg = Boolean(openGraph.title && openGraph.image);
    findings.push({
      id: "opengraph",
      status: hasFullOg ? "pass" : openGraph.title ? "info" : "warning",
      title: "OpenGraph social metadata",
      details: hasFullOg
        ? `OpenGraph configured (og:title: "${openGraph.title}")`
        : openGraph.title
        ? `Partial OpenGraph: og:title detected, but missing og:image`
        : "No OpenGraph tags found for social preview rich cards."
    });

    findings.push({
      id: "twitter",
      status: twitterCard.card ? "pass" : "info",
      title: "Twitter card metadata",
      details: twitterCard.card
        ? `Twitter card type: "${twitterCard.card}"`
        : "No twitter:card tag found. Platforms will fall back to OpenGraph."
    });

    findings.push({
      id: "viewport",
      status: isViewportValid ? "pass" : "warning",
      title: "Mobile viewport configuration",
      details: isViewportValid
        ? "Mobile-friendly viewport configured (width=device-width)."
        : viewportContent
        ? `Non-standard viewport content: "${viewportContent}"`
        : "No viewport meta tag found. The site may render improperly on mobile."
    });

    findings.push({
      id: "charset",
      status: /utf-8/i.test(charset) ? "pass" : "warning",
      title: "Character encoding",
      details: `Declared character set: ${charset}.`
    });

    findings.push({
      id: "schema",
      status: structuredTypes.length > 0 ? "pass" : "info",
      title: "Structured data (JSON-LD)",
      details: structuredTypes.length > 0
        ? `Detected ${structuredTypes.length} schema entities (${Array.from(new Set(structuredTypes)).join(", ")}).`
        : "No Schema.org JSON-LD structured data detected."
    });

    findings.push({
      id: "robots_txt",
      status: discovery.robotsTxtFound ? "pass" : "info",
      title: "robots.txt discovery",
      details: discovery.robotsTxtFound
        ? `robots.txt is present and accessible at ${origin}/robots.txt.`
        : `No robots.txt detected at ${origin}/robots.txt.`
    });

    findings.push({
      id: "sitemap",
      status: discovery.sitemapFound ? "pass" : "info",
      title: "XML Sitemap discovery",
      details: discovery.sitemapFound
        ? `XML sitemap detected at ${discovery.sitemapUrl || `${origin}/sitemap.xml`}.`
        : `No XML sitemap was referenced in robots.txt or found at standard location.`
    });

    findings.push({
      id: "cwv_cls",
      status: clsRisk === "low" ? "pass" : clsRisk === "medium" ? "info" : "warning",
      title: "Cumulative Layout Shift (CLS) risk",
      details: clsRisk === "low"
        ? "All or most images declare width/height attributes (low CLS risk)."
        : `${imagesMissingDimensions} images lack explicit width/height attributes, risking layout shifts.`
    });

    // Composite Overall Health Score (0-100)
    const passCount = findings.filter((f) => f.status === "pass").length;
    const warnCount = findings.filter((f) => f.status === "warning").length;
    const seoScore = Math.round(((passCount * 1.0 + (findings.length - passCount - warnCount) * 0.5) / findings.length) * 100);
    const healthScore = Math.round(seoScore * 0.65 + perfScore * 0.35);

    const technicalDetails = {
      openGraph,
      twitterCard,
      structuredData: {
        count: structuredTypes.length,
        types: Array.from(new Set(structuredTypes))
      },
      signals: {
        viewport: isViewportValid,
        charset,
        domNodes,
        htmlSizeBytes,
        scriptsCount,
        stylesheetsCount,
        imagesMissingDimensions
      },
      performance: {
        score: perfScore,
        estimatedFcpMs,
        estimatedLcpMs,
        clsRisk
      },
      discovery,
      healthScore
    };

    const auditedAt = new Date().toISOString();

    const saveResult = await historyService.saveAudit({
      submittedUrl,
      normalizedUrl: page.finalUrl,
      statusCode: page.statusCode,
      pageTitle: title || null,
      metaDescription: description || null,
      canonicalUrl: canonical,
      headings,
      imageCount: images.length,
      imagesMissingAlt,
      noindex,
      findings,
      healthScore,
      technicalDetails
    });

    res.json({
      success: true,
      message: "SEO audit completed.",
      data: {
        auditId: saveResult.auditId,
        storage: saveResult.storage,
        url: page.finalUrl,
        statusCode: page.statusCode,
        auditedAt,
        pageTitle: title || null,
        metaDescription: description || null,
        canonicalUrl: canonical,
        headings,
        imageCount: images.length,
        imagesMissingAlt,
        noindex,
        healthScore,
        technicalDetails,
        findings
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The audit failed.";

    const clientError =
      /valid absolute|only HTTP|credentials|not allowed|private or reserved|hostname could not be resolved|too many redirects|HTML page|2048 characters/i.test(
        message
      );

    res.status(clientError ? 400 : 502).json({
      success: false,
      message
    });
  }
});

// GET /api/audit/history — Paginated audit history with optional search
router.get("/history", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const result = await historyService.getAuditHistory({ page, limit, search });
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to load audit history."
    });
  }
});

// GET /api/audit/history/:id — Get a single audit by auditId
router.get("/history/:id", async (req, res) => {
  try {
    const audit = await historyService.getAuditById(req.params.id);
    if (!audit) {
      res.status(404).json({
        success: false,
        message: "Audit report not found."
      });
      return;
    }

    res.json({
      success: true,
      data: audit
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to retrieve audit."
    });
  }
});

// DELETE /api/audit/history/:id — Remove an audit by auditId
router.delete("/history/:id", async (req, res) => {
  try {
    const deleted = await historyService.deleteAuditById(req.params.id);
    if (!deleted) {
      res.status(404).json({
        success: false,
        message: "Audit report not found or already deleted."
      });
      return;
    }

    res.json({
      success: true,
      message: "Audit report deleted successfully."
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete audit."
    });
  }
});

// POST /api/audit/ai-recommendations — Generate AI-powered technical recommendations
router.post("/ai-recommendations", async (req, res) => {
  try {
    const { auditId, auditResult } = req.body || {};

    let context: SeoAuditContext | null = null;

    if (auditId && typeof auditId === "string") {
      const stored = await historyService.getAuditById(auditId);
      if (stored) {
        context = {
          url: stored.normalizedUrl,
          statusCode: stored.statusCode,
          pageTitle: stored.pageTitle,
          metaDescription: stored.metaDescription,
          canonicalUrl: stored.canonicalUrl,
          headings: stored.headings,
          imageCount: stored.imageCount,
          imagesMissingAlt: stored.imagesMissingAlt,
          noindex: stored.noindex,
          findings: stored.findings
        };
      }
    }

    if (!context && auditResult && typeof auditResult === "object" && auditResult.url) {
      context = {
        url: auditResult.url,
        statusCode: auditResult.statusCode || 200,
        pageTitle: auditResult.pageTitle || null,
        metaDescription: auditResult.metaDescription || null,
        canonicalUrl: auditResult.canonicalUrl || null,
        headings: auditResult.headings || { h1: 0, h2: 0, h3: 0 },
        imageCount: Number(auditResult.imageCount) || 0,
        imagesMissingAlt: Number(auditResult.imagesMissingAlt) || 0,
        noindex: Boolean(auditResult.noindex),
        findings: Array.isArray(auditResult.findings) ? auditResult.findings : []
      };
    }

    if (!context) {
      res.status(400).json({
        success: false,
        configured: geminiService.isConfigured(),
        message: "Provide a valid auditId or auditResult to generate AI recommendations.",
        data: null
      });
      return;
    }

    const aiResponse = await geminiService.generateRecommendations(context);

    // If auditId was provided and AI analysis succeeded, attach it to history
    if (auditId && aiResponse.success && aiResponse.data) {
      await historyService.attachAiAnalysis(auditId, aiResponse.data);
    }

    res.status(200).json(aiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      configured: geminiService.isConfigured(),
      message: error instanceof Error ? error.message : "AI recommendation generation failed.",
      data: null
    });
  }
});

// GET /api/audit/:id/export — Multi-format report export (json, csv, html)
router.get("/:id/export", async (req, res) => {
  try {
    const auditId = req.params.id;
    const format = String(req.query.format || "json").toLowerCase();

    const audit = await historyService.getAuditById(auditId);
    if (!audit) {
      res.status(404).json({ success: false, message: "Audit report not found." });
      return;
    }

    const exportData: ExportAuditData = {
      auditId: audit.auditId,
      url: audit.normalizedUrl,
      statusCode: audit.statusCode,
      auditedAt: audit.createdAt,
      pageTitle: audit.pageTitle,
      metaDescription: audit.metaDescription,
      canonicalUrl: audit.canonicalUrl,
      headings: audit.headings,
      imageCount: audit.imageCount,
      imagesMissingAlt: audit.imagesMissingAlt,
      noindex: audit.noindex,
      findings: audit.findings,
      healthScore: audit.healthScore,
      technicalDetails: audit.technicalDetails as any,
      aiAnalysis: audit.aiAnalysis as any
    };

    if (format === "csv") {
      const csv = exportService.generateCsv(exportData);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="trackseo-audit-${auditId}.csv"`);
      res.send(csv);
    } else if (format === "html") {
      const html = exportService.generateHtml(exportData);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } else {
      const json = exportService.generateJson(exportData);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="trackseo-audit-${auditId}.json"`);
      res.send(json);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Export failed."
    });
  }
});

// POST /api/audit/export — Ad-hoc export for active in-memory audit results
router.post("/export", async (req, res) => {
  try {
    const { auditResult, format = "json", aiAnalysis } = req.body || {};
    if (!auditResult || !auditResult.url) {
      res.status(400).json({ success: false, message: "Provide a valid auditResult." });
      return;
    }

    const exportData: ExportAuditData = {
      auditId: auditResult.auditId,
      url: auditResult.url,
      statusCode: auditResult.statusCode || 200,
      auditedAt: auditResult.auditedAt || new Date().toISOString(),
      pageTitle: auditResult.pageTitle || null,
      metaDescription: auditResult.metaDescription || null,
      canonicalUrl: auditResult.canonicalUrl || null,
      headings: auditResult.headings || { h1: 0, h2: 0, h3: 0 },
      imageCount: Number(auditResult.imageCount) || 0,
      imagesMissingAlt: Number(auditResult.imagesMissingAlt) || 0,
      noindex: Boolean(auditResult.noindex),
      findings: auditResult.findings || [],
      healthScore: auditResult.healthScore,
      technicalDetails: auditResult.technicalDetails,
      aiAnalysis: aiAnalysis || null
    };

    const fmt = String(format).toLowerCase();
    if (fmt === "csv") {
      const csv = exportService.generateCsv(exportData);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="trackseo-audit.csv"');
      res.send(csv);
    } else if (fmt === "html") {
      const html = exportService.generateHtml(exportData);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } else {
      const json = exportService.generateJson(exportData);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="trackseo-audit.json"');
      res.send(json);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Export failed."
    });
  }
});

export default router;