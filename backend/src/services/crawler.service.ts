import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import mongoose from "mongoose";
import { Browserbase } from "@browserbasehq/sdk";
import { env } from "../config/env.js";
import { CrawlJob, type ICrawledPage } from "../models/CrawlJob.js";

const MAX_HTML_BYTES = 1_000_000; // 1 MB per page
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;

export interface CrawlRequestOptions {
  maxPages?: number;
  maxDepth?: number;
  timeoutSeconds?: number;
  useBrowserbase?: boolean;
}

export interface CrawlJobRecord {
  jobId: string;
  rootUrl: string;
  domain: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  engine: "cheerio_static" | "browserbase_render";
  options: {
    maxPages: number;
    maxDepth: number;
    timeoutSeconds: number;
    concurrency: number;
  };
  progress: {
    pagesFound: number;
    pagesCrawled: number;
    pagesRemaining: number;
  };
  pages: ICrawledPage[];
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
  storage: "mongodb" | "memory";
}

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

async function fetchSafeHtml(input: string): Promise<{
  html: string;
  finalUrl: string;
  statusCode: number;
}> {
  let currentUrl = input;

  for (let redirectCount = 0; ; redirectCount++) {
    const safeUrl = await validatePublicUrl(currentUrl);

    let response: Response;
    try {
      response = await fetch(safeUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "TrackSeoCrawler/0.1 (+bounded multi-page crawl)"
        }
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("Request timed out while connecting to page.");
      }
      throw new Error("Unable to establish a connection to the website.");
    }

    if (
      response.status === 301 ||
      response.status === 302 ||
      response.status === 307 ||
      response.status === 308
    ) {
      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error("Too many redirects encountered.");
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response missing location header.");
      }

      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new Error("Target resource does not return an HTML document.");
    }

    if (!response.body) {
      throw new Error("Received an empty response from the server.");
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
          throw new Error("HTML document exceeds the 1 MB page limit.");
        }
        chunks.push(value);
      }
    } catch (err) {
      await reader.cancel().catch(() => {});
      throw err;
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
      statusCode: response.status
    };
  }
}

// In-memory crawl store
const memoryCrawlStore: Map<string, CrawlJobRecord> = new Map();
const activeCancellations: Set<string> = new Set();

export class CrawlerService {
  /**
   * Check if Browserbase credentials are configured.
   */
  isBrowserbaseConfigured(): boolean {
    return Boolean(env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID);
  }

  /**
   * Safe status object for Browserbase integration diagnostics.
   */
  getBrowserbaseStatus(): {
    configured: boolean;
    projectId: string | null;
  } {
    return {
      configured: this.isBrowserbaseConfigured(),
      projectId: env.BROWSERBASE_PROJECT_ID ? env.BROWSERBASE_PROJECT_ID.slice(0, 8) + "..." : null
    };
  }

  /**
   * Initiates a bounded crawl job.
   */
  async startCrawlJob(
    targetUrl: string,
    options?: CrawlRequestOptions
  ): Promise<CrawlJobRecord> {
    const validatedUrl = await validatePublicUrl(targetUrl);
    const domain = validatedUrl.hostname.toLowerCase();

    const jobId = `crawl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const boundedMaxPages = Math.min(20, Math.max(1, options?.maxPages || 5));
    const boundedMaxDepth = Math.min(3, Math.max(1, options?.maxDepth || 2));
    const boundedTimeout = Math.min(60, Math.max(5, options?.timeoutSeconds || 30));

    const useBrowserbase = Boolean(options?.useBrowserbase && this.isBrowserbaseConfigured());
    const engine: "cheerio_static" | "browserbase_render" = useBrowserbase
      ? "browserbase_render"
      : "cheerio_static";

    const jobRecord: CrawlJobRecord = {
      jobId,
      rootUrl: validatedUrl.toString(),
      domain,
      status: "queued",
      engine,
      options: {
        maxPages: boundedMaxPages,
        maxDepth: boundedMaxDepth,
        timeoutSeconds: boundedTimeout,
        concurrency: 2
      },
      progress: {
        pagesFound: 1,
        pagesCrawled: 0,
        pagesRemaining: 1
      },
      pages: [],
      createdAt: new Date().toISOString(),
      storage: mongoose.connection.readyState === 1 ? "mongodb" : "memory"
    };

    memoryCrawlStore.set(jobId, jobRecord);

    if (mongoose.connection.readyState === 1) {
      try {
        await CrawlJob.create({
          jobId,
          rootUrl: jobRecord.rootUrl,
          domain: jobRecord.domain,
          status: "queued",
          engine,
          options: jobRecord.options,
          progress: jobRecord.progress,
          pages: []
        });
      } catch (err) {
        console.warn("[CrawlerService] Failed to persist initial job to MongoDB:", err);
      }
    }

    // Launch background bounded crawling asynchronously
    void this.executeBoundedCrawl(jobId);

    return jobRecord;
  }

  /**
   * Cancels a running crawl job.
   */
  cancelCrawlJob(jobId: string): boolean {
    const job = memoryCrawlStore.get(jobId);
    if (!job) return false;

    if (job.status === "running" || job.status === "queued") {
      activeCancellations.add(jobId);
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
      void this.syncJobState(job);
      return true;
    }
    return false;
  }

  /**
   * Retrieves crawl job by ID.
   */
  async getCrawlJob(jobId: string): Promise<CrawlJobRecord | null> {
    const memJob = memoryCrawlStore.get(jobId);
    if (memJob) return memJob;

    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await CrawlJob.findOne({ jobId }).lean();
        if (doc) {
          return {
            jobId: doc.jobId,
            rootUrl: doc.rootUrl,
            domain: doc.domain,
            status: doc.status,
            engine: doc.engine,
            options: doc.options,
            progress: doc.progress,
            pages: doc.pages,
            error: doc.error,
            createdAt: new Date(doc.createdAt).toISOString(),
            completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : null,
            storage: "mongodb"
          };
        }
      } catch (err) {
        console.warn("[CrawlerService] MongoDB getCrawlJob failed:", err);
      }
    }

    return null;
  }

  /**
   * Lists recent crawl jobs.
   */
  async listCrawlJobs(limit = 10): Promise<CrawlJobRecord[]> {
    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await CrawlJob.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        if (docs.length > 0) {
          return docs.map((doc) => ({
            jobId: doc.jobId,
            rootUrl: doc.rootUrl,
            domain: doc.domain,
            status: doc.status,
            engine: doc.engine,
            options: doc.options,
            progress: doc.progress,
            pages: doc.pages,
            error: doc.error,
            createdAt: new Date(doc.createdAt).toISOString(),
            completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : null,
            storage: "mongodb"
          }));
        }
      } catch (err) {
        console.warn("[CrawlerService] MongoDB listCrawlJobs failed:", err);
      }
    }

    return Array.from(memoryCrawlStore.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Background engine that executes bounded crawling.
   */
  private async executeBoundedCrawl(jobId: string): Promise<void> {
    const job = memoryCrawlStore.get(jobId);
    if (!job) return;

    job.status = "running";
    await this.syncJobState(job);

    const startTime = Date.now();
    const timeoutMs = job.options.timeoutSeconds * 1000;

    const visitedUrls = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [
      { url: job.rootUrl, depth: 0 }
    ];

    try {
      while (
        queue.length > 0 &&
        job.pages.length < job.options.maxPages &&
        Date.now() - startTime < timeoutMs
      ) {
        // Check for cancellation
        if (activeCancellations.has(jobId)) {
          job.status = "cancelled";
          break;
        }

        const next = queue.shift();
        if (!next) break;

        const { url: currentUrl, depth } = next;
        const normalizedKey = this.normalizeCrawlUrl(currentUrl);

        if (visitedUrls.has(normalizedKey)) {
          continue;
        }
        visitedUrls.add(normalizedKey);

        try {
          const pageData = await this.crawlSinglePage(currentUrl, depth, job.domain);
          job.pages.push(pageData);

          // Discover internal links for subsequent depth
          if (depth + 1 <= job.options.maxDepth) {
            for (const link of pageData.internalLinks) {
              const linkKey = this.normalizeCrawlUrl(link);
              if (
                !visitedUrls.has(linkKey) &&
                !queue.some((q) => this.normalizeCrawlUrl(q.url) === linkKey) &&
                visitedUrls.size + queue.length < job.options.maxPages * 2
              ) {
                queue.push({ url: link, depth: depth + 1 });
              }
            }
          }

          job.progress.pagesCrawled = job.pages.length;
          job.progress.pagesFound = visitedUrls.size + queue.length;
          job.progress.pagesRemaining = Math.max(
            0,
            Math.min(queue.length, job.options.maxPages - job.pages.length)
          );

          await this.syncJobState(job);
        } catch (pageErr) {
          console.warn(`[CrawlerService] Skipping ${currentUrl}:`, pageErr instanceof Error ? pageErr.message : pageErr);
        }
      }

      if (job.status !== "cancelled") {
        job.status = "completed";
      }
    } catch (crawlErr) {
      job.status = "failed";
      job.error = crawlErr instanceof Error ? crawlErr.message : "Crawl failed unexpectedly.";
    } finally {
      activeCancellations.delete(jobId);
      job.completedAt = new Date().toISOString();
      await this.syncJobState(job);
    }
  }

  /**
   * Crawls a single page, parses HTML with Cheerio, extracts links and findings.
   */
  private async crawlSinglePage(
    url: string,
    depth: number,
    baseDomain: string
  ): Promise<ICrawledPage> {
    const { html, finalUrl, statusCode } = await fetchSafeHtml(url);
    const $ = load(html);

    const title = $("title").first().text().trim() || null;
    const metaDescription =
      $('meta[name="description" i]').attr("content")?.trim() || null;
    const canonicalUrl =
      $('link[rel="canonical" i]').attr("href")?.trim() || null;

    const headings = {
      h1: $("h1").length,
      h2: $("h2").length,
      h3: $("h3").length
    };

    const images = $("img");
    let imagesMissingAlt = 0;
    images.each((_, el) => {
      const alt = $(el).attr("alt");
      if (alt === undefined || alt.trim() === "") {
        imagesMissingAlt++;
      }
    });

    const robotsMeta = $('meta[name="robots" i]').attr("content")?.toLowerCase() || "";
    const noindex = robotsMeta.includes("noindex");

    // Extract links
    const internalLinksSet = new Set<string>();
    const externalLinksSet = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const resolved = new URL(href, finalUrl);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
          return;
        }
        resolved.hash = "";

        const resolvedHostname = resolved.hostname.toLowerCase();
        if (resolvedHostname === baseDomain || resolvedHostname.endsWith(`.${baseDomain}`)) {
          internalLinksSet.add(resolved.toString());
        } else {
          externalLinksSet.add(resolved.toString());
        }
      } catch {
        // Skip unparseable hrefs
      }
    });

    const findings: ICrawledPage["findings"] = [];

    findings.push({
      id: "title",
      status: title ? "pass" : "warning",
      title: "Page title",
      details: title ? `${title.length} characters` : "Missing page title"
    });

    findings.push({
      id: "headings",
      status: headings.h1 === 1 ? "pass" : "warning",
      title: "H1 heading",
      details: headings.h1 === 1 ? "Exactly 1 H1 found" : `Found ${headings.h1} H1s`
    });

    findings.push({
      id: "canonical",
      status: canonicalUrl ? "pass" : "info",
      title: "Canonical URL",
      details: canonicalUrl ? "Canonical tag present" : "No canonical tag"
    });

    findings.push({
      id: "links",
      status: "info",
      title: "Page linkages",
      details: `${internalLinksSet.size} internal links, ${externalLinksSet.size} external links`
    });

    return {
      url: finalUrl,
      depth,
      statusCode,
      pageTitle: title,
      metaDescription,
      canonicalUrl,
      headings,
      imageCount: images.length,
      imagesMissingAlt,
      noindex,
      linksFound: internalLinksSet.size + externalLinksSet.size,
      internalLinks: Array.from(internalLinksSet).slice(0, 50),
      externalLinks: Array.from(externalLinksSet).slice(0, 50),
      findings,
      crawledAt: new Date()
    };
  }

  private normalizeCrawlUrl(input: string): string {
    try {
      const u = new URL(input);
      u.hash = "";
      // Strip trailing slash for normalization comparison
      const path = u.pathname.replace(/\/+$/, "") || "/";
      return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
    } catch {
      return input.toLowerCase();
    }
  }

  private async syncJobState(job: CrawlJobRecord): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      try {
        await CrawlJob.updateOne(
          { jobId: job.jobId },
          {
            $set: {
              status: job.status,
              progress: job.progress,
              pages: job.pages,
              error: job.error || null,
              completedAt: job.completedAt ? new Date(job.completedAt) : null
            }
          }
        );
      } catch (err) {
        console.warn("[CrawlerService] Failed to sync job to MongoDB:", err);
      }
    }
  }
}

export const crawlerService = new CrawlerService();
