import { useState, useEffect, useRef, useCallback } from "react";
import {
  startCrawl,
  getCrawlStatus,
  listCrawls,
  cancelCrawl,
  fetchBrowserbaseStatus,
  type CrawlJobItem,
  type CrawledPageItem,
  type BrowserbaseStatus
} from "../services/api";
import {
  Globe2,
  Play,
  RotateCw,
  XCircle,
  ExternalLink,
  Search,
  Layers,
  Link2,
  AlertTriangle,
  Clock,
  Compass,
  Cpu,
  Eye,
  SlidersHorizontal
} from "lucide-react";
import "./CrawlExplorer.css";

interface CrawlExplorerProps {
  onInspectPage: (page: CrawledPageItem) => void;
  defaultUrl?: string;
}

export default function CrawlExplorer({
  onInspectPage,
  defaultUrl = ""
}: CrawlExplorerProps) {
  const [targetUrl, setTargetUrl] = useState(defaultUrl || "");
  const [maxPages, setMaxPages] = useState(5);
  const [maxDepth, setMaxDepth] = useState(2);
  const [useBrowserbase, setUseBrowserbase] = useState(false);

  const [activeJob, setActiveJob] = useState<CrawlJobItem | null>(null);
  const [recentJobs, setRecentJobs] = useState<CrawlJobItem[]>([]);
  const [browserbaseStatus, setBrowserbaseStatus] = useState<BrowserbaseStatus | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [pageSearchFilter, setPageSearchFilter] = useState("");

  const pollIntervalRef = useRef<number | null>(null);

  // Load initial Browserbase status and recent jobs
  useEffect(() => {
    fetchBrowserbaseStatus()
      .then((st) => setBrowserbaseStatus(st))
      .catch(() => {});

    loadRecentJobs();
  }, []);

  const loadRecentJobs = async () => {
    try {
      const jobs = await listCrawls(8);
      setRecentJobs(jobs);
      if (!activeJob && jobs.length > 0) {
        setActiveJob(jobs[0]);
      }
    } catch {
      // Ignored if offline
    }
  };

  // Poll active crawl progress
  const pollActiveJob = useCallback(async (jobId: string) => {
    try {
      const updated = await getCrawlStatus(jobId);
      setActiveJob(updated);

      if (updated.status === "completed" || updated.status === "failed" || updated.status === "cancelled") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsLoading(false);
        void loadRecentJobs();
      }
    } catch {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeJob && (activeJob.status === "running" || activeJob.status === "queued")) {
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = window.setInterval(() => {
          void pollActiveJob(activeJob.jobId);
        }, 1500);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [activeJob, pollActiveJob]);

  const handleStartCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setErrorNotice("Enter a valid target website URL.");
      return;
    }

    setErrorNotice(null);
    setIsLoading(true);

    try {
      const job = await startCrawl(trimmed, {
        maxPages,
        maxDepth,
        useBrowserbase: useBrowserbase && Boolean(browserbaseStatus?.configured)
      });
      setActiveJob(job);
      void loadRecentJobs();
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Crawl failed to start.");
      setIsLoading(false);
    }
  };

  const handleCancelCrawl = async () => {
    if (!activeJob) return;
    try {
      await cancelCrawl(activeJob.jobId);
      setActiveJob((prev) => (prev ? { ...prev, status: "cancelled" } : null));
      void loadRecentJobs();
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Cancellation failed.");
    }
  };

  // Filter crawled pages
  const filteredPages = (activeJob?.pages || []).filter((p) => {
    if (!pageSearchFilter) return true;
    const q = pageSearchFilter.toLowerCase();
    return (
      p.url.toLowerCase().includes(q) ||
      (p.pageTitle && p.pageTitle.toLowerCase().includes(q))
    );
  });

  const totalInternalLinks = (activeJob?.pages || []).reduce(
    (acc, p) => acc + (p.internalLinks?.length || 0),
    0
  );
  const totalExternalLinks = (activeJob?.pages || []).reduce(
    (acc, p) => acc + (p.externalLinks?.length || 0),
    0
  );

  const calculateProgressPercent = () => {
    if (!activeJob) return 0;
    if (activeJob.status === "completed") return 100;
    const { pagesCrawled } = activeJob.progress;
    const { maxPages: maxP } = activeJob.options;
    return Math.min(100, Math.round((pagesCrawled / maxP) * 100));
  };

  return (
    <div className="crawl-explorer-container" aria-label="Crawl Explorer">
      {/* Header */}
      <div className="explorer-header">
        <div>
          <div className="section-index">01 / BOUNDED CRAWL ENGINE</div>
          <h2 className="explorer-title">
            <Compass size={22} className="title-icon" />
            Multi-Page Crawl Explorer
          </h2>
          <p className="explorer-subtitle">
            Map internal site architecture, inspect link graphs, and audit discovered pages across depths.
          </p>
        </div>

        <div className="explorer-header-badges">
          <span
            className={`engine-pill ${
              browserbaseStatus?.configured ? "engine-pill--active" : "engine-pill--static"
            }`}
            title={
              browserbaseStatus?.configured
                ? "Browserbase headless browser available"
                : "Browserbase API not configured — using fast deterministic static crawler"
            }
          >
            <Cpu size={12} />
            <span>
              {browserbaseStatus?.configured
                ? "BROWSERBASE AVAILABLE"
                : "STATIC CHEERIO CRAWLER"}
            </span>
          </span>
        </div>
      </div>

      {/* Crawl Launcher Form */}
      <form className="crawl-launch-card" onSubmit={handleStartCrawl}>
        <div className="launch-inputs-grid">
          <div className="url-field-wrap">
            <label className="field-label" htmlFor="crawl-target-url">
              TARGET SEED URL
            </label>
            <div className="input-group">
              <Globe2 size={18} />
              <input
                id="crawl-target-url"
                type="text"
                placeholder="https://example.com"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="param-field-wrap">
            <label className="field-label" htmlFor="crawl-max-pages">
              MAX PAGES ({maxPages})
            </label>
            <select
              id="crawl-max-pages"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              disabled={isLoading}
            >
              <option value={3}>3 pages (fast smoke test)</option>
              <option value={5}>5 pages (standard)</option>
              <option value={10}>10 pages (comprehensive)</option>
              <option value={20}>20 pages (maximum bound)</option>
            </select>
          </div>

          <div className="param-field-wrap">
            <label className="field-label" htmlFor="crawl-max-depth">
              MAX DEPTH ({maxDepth})
            </label>
            <select
              id="crawl-max-depth"
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
              disabled={isLoading}
            >
              <option value={1}>Depth 1 (Seed page only)</option>
              <option value={2}>Depth 2 (Direct internal links)</option>
              <option value={3}>Depth 3 (Sub-page traversal)</option>
            </select>
          </div>

          <div className="submit-btn-wrap">
            <button
              type="submit"
              className="launch-crawl-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <RotateCw size={15} className="spin" />
                  <span>CRAWLING...</span>
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" />
                  <span>START CRAWL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Browserbase Option Row */}
        <div className="browserbase-option-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useBrowserbase}
              disabled={!browserbaseStatus?.configured || isLoading}
              onChange={(e) => setUseBrowserbase(e.target.checked)}
            />
            <span>Render SPA via Browserbase Headless Browser</span>
          </label>
          {!browserbaseStatus?.configured && (
            <span className="unconfigured-hint">
              (BROWSERBASE_API_KEY unconfigured — using deterministic Cheerio crawler)
            </span>
          )}
        </div>
      </form>

      {errorNotice && (
        <div className="crawl-error-banner">
          <AlertTriangle size={16} />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Active Crawl Monitor */}
      {activeJob && (
        <section className="active-crawl-monitor" aria-label="Active crawl monitor">
          <div className="monitor-topline">
            <div className="monitor-target">
              <span className="domain-chip">{activeJob.domain}</span>
              <span className="job-id-mono">JOB: {activeJob.jobId}</span>
              <span className={`status-tag status-tag--${activeJob.status}`}>
                {activeJob.status.toUpperCase()}
              </span>
            </div>

            <div className="monitor-actions">
              {(activeJob.status === "running" || activeJob.status === "queued") && (
                <button
                  className="cancel-btn"
                  onClick={handleCancelCrawl}
                  title="Cancel running crawl job"
                >
                  <XCircle size={14} />
                  <span>CANCEL JOB</span>
                </button>
              )}
              <span className="time-mono">
                <Clock size={12} />
                {new Date(activeJob.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress-container">
            <div className="progress-bar-bg">
              <div
                className={`progress-bar-fill ${
                  activeJob.status === "running" ? "progress-bar-fill--animated" : ""
                }`}
                style={{ width: `${calculateProgressPercent()}%` }}
              />
            </div>
            <div className="progress-meta">
              <span>
                PROGRESS: <strong>{activeJob.progress.pagesCrawled}</strong> of{" "}
                <strong>{activeJob.options.maxPages}</strong> PAGES CRAWLED
              </span>
              <span>{calculateProgressPercent()}% COMPLETED</span>
            </div>
          </div>

          {/* Telemetry Metric Cards */}
          <div className="crawl-telemetry-grid">
            <div className="telemetry-card">
              <span className="telemetry-label">PAGES DISCOVERED</span>
              <strong className="telemetry-val">
                {activeJob.pages.length} / {activeJob.progress.pagesFound}
              </strong>
              <small>Bounded at {activeJob.options.maxPages} pages</small>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-label">INTERNAL LINKAGES</span>
              <strong className="telemetry-val">{totalInternalLinks}</strong>
              <small>Same-domain connections</small>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-label">EXTERNAL REFS</span>
              <strong className="telemetry-val">{totalExternalLinks}</strong>
              <small>Outbound third-party links</small>
            </div>
            <div className="telemetry-card">
              <span className="telemetry-label">ENGINE MODE</span>
              <strong className="telemetry-val">
                {activeJob.engine === "browserbase_render" ? "BROWSERBASE" : "CHEERIO STATIC"}
              </strong>
              <small>SSRF & Depth Protected</small>
            </div>
          </div>

          {/* Discovered Pages Explorer */}
          <div className="discovered-pages-section">
            <div className="pages-header">
              <div className="pages-header-title">
                <Layers size={16} />
                <span>DISCOVERED SITE PAGES ({activeJob.pages.length})</span>
              </div>

              <div className="pages-search-wrapper">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter pages by path or title..."
                  value={pageSearchFilter}
                  onChange={(e) => setPageSearchFilter(e.target.value)}
                />
              </div>
            </div>

            {activeJob.pages.length === 0 ? (
              <div className="pages-empty-state">
                {activeJob.status === "running" ? (
                  <>
                    <RotateCw size={24} className="spin" />
                    <span>TRAVERSING SEED URL & RESOLVING INTERNAL GRAPH...</span>
                  </>
                ) : (
                  <span>NO PAGES DISCOVERED IN THIS CRAWL SESSION.</span>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="pages-table">
                  <thead>
                    <tr>
                      <th>STATUS</th>
                      <th>DEPTH</th>
                      <th>PAGE URL & TITLE</th>
                      <th>HEADINGS</th>
                      <th>IMAGES</th>
                      <th>LINKS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPages.map((page, idx) => (
                      <tr key={idx} className="page-row">
                        <td>
                          <span
                            className={`http-badge ${
                              page.statusCode === 200 ? "http-badge--200" : "http-badge--warn"
                            }`}
                          >
                            {page.statusCode}
                          </span>
                        </td>
                        <td>
                          <span className="depth-badge">D:{page.depth}</span>
                        </td>
                        <td className="url-cell">
                          <div className="page-url" title={page.url}>
                            {page.url}
                          </div>
                          {page.pageTitle && (
                            <div className="page-title-sub">"{page.pageTitle}"</div>
                          )}
                        </td>
                        <td className="mono-cell">
                          H1: {page.headings.h1} | H2: {page.headings.h2}
                        </td>
                        <td className="mono-cell">
                          {page.imageCount} imgs ({page.imagesMissingAlt} no alt)
                        </td>
                        <td className="mono-cell">
                          <span className="link-counts">
                            <Link2 size={12} /> {page.internalLinks.length} int /{" "}
                            {page.externalLinks.length} ext
                          </span>
                        </td>
                        <td>
                          <div className="action-cell">
                            <button
                              className="inspect-page-btn"
                              onClick={() => onInspectPage(page)}
                              title="Inspect technical SEO findings for this page"
                            >
                              <Eye size={12} />
                              <span>INSPECT</span>
                            </button>
                            <a
                              href={page.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ext-icon-btn"
                              title="Open external page"
                            >
                              <ExternalLink size={13} />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Crawl Jobs History Drawer */}
      {recentJobs.length > 0 && (
        <section className="recent-crawls-section">
          <div className="recent-crawls-title">
            <SlidersHorizontal size={14} />
            <span>RECENT CRAWL SESSIONS ({recentJobs.length})</span>
          </div>
          <div className="recent-jobs-grid">
            {recentJobs.map((j) => (
              <div
                key={j.jobId}
                className={`recent-job-card ${
                  activeJob?.jobId === j.jobId ? "recent-job-card--active" : ""
                }`}
                onClick={() => setActiveJob(j)}
              >
                <div className="recent-job-top">
                  <strong>{j.domain}</strong>
                  <span className={`status-pill status-pill--${j.status}`}>
                    {j.status.toUpperCase()}
                  </span>
                </div>
                <div className="recent-job-meta">
                  <span>{j.pages.length} pages crawled</span>
                  <span>{new Date(j.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
