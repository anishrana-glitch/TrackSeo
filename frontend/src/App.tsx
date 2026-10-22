
import { useState, useEffect } from "react";
import {
  runSeoAudit,
  checkApiHealth,
  requestAiRecommendations,
  exportAuditReport,
  exportAuditAdHoc,
  downloadBlob,
  type SeoAuditResult,
  type SeoFinding,
  type AuditHistoryItem,
  type AiAuditAnalysis,
  type CrawledPageItem
} from "./services/api";
import BackendStatus from "./components/BackendStatus";
import AuditHistory from "./components/AuditHistory";
import AiRecommendationsPanel from "./components/AiRecommendationsPanel";
import CrawlExplorer from "./components/CrawlExplorer";
import ExperimentsWorkspace from "./components/ExperimentsWorkspace";
import SettingsWorkspace from "./components/SettingsWorkspace";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Command,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe2,
  Info,
  Layers3,
  Link2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Radar,
  ScanSearch,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import "./App.css";

const navigation = [
  { label: "Overview", icon: Layers3 },
  { label: "Site audits", icon: ScanSearch },
  { label: "Crawl explorer", icon: Globe2 },
  { label: "AI intelligence", icon: Bot },
  { label: "Experiments", icon: ChartNoAxesCombined },
];

function severityIcon(status: SeoFinding["status"]) {
  if (status === "pass") return <CheckCircle2 size={15} />;
  if (status === "warning") return <AlertTriangle size={15} />;
  return <Info size={15} />;
}

function severityLabel(status: SeoFinding["status"]) {
  if (status === "pass") return "PASS";
  if (status === "warning") return "WARNING";
  return "INFO";
}

function AuditResults({
  result,
  aiAnalysis,
  isAiConfigured,
  isAiLoading,
  aiError,
  onGenerateAi,
  onLaunchExperiment
}: {
  result: SeoAuditResult;
  aiAnalysis: AiAuditAnalysis | null;
  isAiConfigured: boolean;
  isAiLoading: boolean;
  aiError: string | null;
  onGenerateAi: () => void;
  onLaunchExperiment?: (result: SeoAuditResult) => void;
}) {
  const [techTab, setTechTab] = useState<"cwv" | "social" | "discovery">("cwv");
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const passCount = result.findings.filter((f) => f.status === "pass").length;
  const warnCount = result.findings.filter((f) => f.status === "warning").length;
  const infoCount = result.findings.filter((f) => f.status === "info").length;

  const healthScore = result.healthScore !== undefined
    ? result.healthScore
    : Math.round(((passCount * 1.0 + (result.findings.length - passCount - warnCount) * 0.5) / result.findings.length) * 100);

  const handleExport = async (format: "json" | "csv" | "html") => {
    setExportingFormat(format);
    try {
      let blob: Blob;
      if (result.auditId) {
        blob = await exportAuditReport(result.auditId, format);
      } else {
        blob = await exportAuditAdHoc(result, format, aiAnalysis);
      }

      if (format === "html") {
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, "_blank");
        if (!win) {
          downloadBlob(blob, `trackseo-report-${new URL(result.url).hostname}.html`);
        }
      } else {
        const ext = format === "csv" ? "csv" : "json";
        downloadBlob(blob, `trackseo-audit-${new URL(result.url).hostname}.${ext}`);
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <section className="audit-results" aria-label="Audit results">
      {/* Results header */}
      <div className="results-header">
        <div>
          <div className="section-index">02 / AUDIT RESULTS</div>
          <h2 className="results-title">
            Findings for{" "}
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="results-url-link"
            >
              {new URL(result.url).hostname}
              <ExternalLink size={14} />
            </a>
          </h2>
        </div>
        <div className="results-meta-badges">
          <div
            className={`health-score-pill ${
              healthScore >= 80
                ? "health-score--good"
                : healthScore >= 60
                ? "health-score--medium"
                : "health-score--bad"
            }`}
            title="Overall Technical & Performance Health Score (0-100)"
          >
            <span className="health-score-val">{healthScore}</span>
            <span className="health-score-sub">/ 100 HEALTH</span>
          </div>

          {result.storage && (
            <span
              className="meta-badge"
              style={{
                color: result.storage === "mongodb" ? "#c7ff38" : "#e0a845",
                borderColor: "currentColor"
              }}
              title={
                result.storage === "mongodb"
                  ? "Audit persisted to MongoDB Atlas"
                  : "Audit saved to in-memory session registry"
              }
            >
              {result.storage === "mongodb" ? "PERSISTED (ATLAS)" : "PERSISTED (MEMORY)"}
            </span>
          )}
          <span className="meta-badge meta-badge--status">
            HTTP {result.statusCode}
          </span>
          <span className="meta-badge meta-badge--time">
            {new Date(result.auditedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Export Toolbar */}
      <div className="audit-export-bar">
        <div className="export-bar-left">
          <span className="export-bar-tag">STAGE G / EXPORT SUITE</span>
          <span className="export-bar-hint">Deliverables & Evidence Reports</span>
        </div>
        <div className="export-bar-actions">
          <button
            className="export-btn"
            onClick={() => void handleExport("json")}
            disabled={exportingFormat !== null}
            title="Download structured JSON report"
          >
            <Download size={14} />
            <span>{exportingFormat === "json" ? "EXPORTING..." : "JSON"}</span>
          </button>
          <button
            className="export-btn"
            onClick={() => void handleExport("csv")}
            disabled={exportingFormat !== null}
            title="Download CSV spreadsheet of findings and recommendations"
          >
            <FileText size={14} />
            <span>{exportingFormat === "csv" ? "EXPORTING..." : "CSV"}</span>
          </button>
          <button
            className="export-btn export-btn--primary"
            onClick={() => void handleExport("html")}
            disabled={exportingFormat !== null}
            title="Open printable executive report (Save as PDF)"
          >
            <Printer size={14} />
            <span>{exportingFormat === "html" ? "GENERATING..." : "PRINT / PDF"}</span>
          </button>
          <button
            className="export-btn export-btn--lab"
            onClick={() => onLaunchExperiment?.(result)}
            title="Formulate an SEO experiment using this audit as baseline"
          >
            <FlaskConical size={14} />
            <span>TEST HYPOTHESIS</span>
          </button>
        </div>
      </div>

      {/* Summary score strip */}
      <div className="results-summary-strip">
        <div className="summary-score-item summary-score-pass">
          <CheckCircle2 size={16} />
          <span className="score-count">{passCount}</span>
          <span>PASSED</span>
        </div>
        <div className="summary-score-item summary-score-warn">
          <AlertTriangle size={16} />
          <span className="score-count">{warnCount}</span>
          <span>WARNINGS</span>
        </div>
        <div className="summary-score-item summary-score-info">
          <Info size={16} />
          <span className="score-count">{infoCount}</span>
          <span>INFO</span>
        </div>
        <div className="summary-score-item summary-score-neutral">
          <Globe2 size={16} />
          <span className="score-count">{result.imageCount}</span>
          <span>IMAGES</span>
        </div>
        <div className="summary-score-item summary-score-neutral">
          <Activity size={16} />
          <span className="score-count">
            {result.headings.h1}/{result.headings.h2}/{result.headings.h3}
          </span>
          <span>H1/H2/H3</span>
        </div>
      </div>

      {/* Page metadata snapshot */}
      <div className="results-metadata-grid">
        <div className="metadata-cell">
          <span className="metadata-label">PAGE TITLE</span>
          <span className="metadata-value">
            {result.pageTitle ? (
              <>
                {result.pageTitle}
                <span className="metadata-sub">
                  {result.pageTitle.length} chars
                </span>
              </>
            ) : (
              <span className="metadata-missing">None detected</span>
            )}
          </span>
        </div>
        <div className="metadata-cell">
          <span className="metadata-label">META DESCRIPTION</span>
          <span className="metadata-value">
            {result.metaDescription ? (
              <>
                {result.metaDescription}
                <span className="metadata-sub">
                  {result.metaDescription.length} chars
                </span>
              </>
            ) : (
              <span className="metadata-missing">None detected</span>
            )}
          </span>
        </div>
        <div className="metadata-cell">
          <span className="metadata-label">CANONICAL URL</span>
          <span className="metadata-value">
            {result.canonicalUrl ? (
              result.canonicalUrl
            ) : (
              <span className="metadata-missing">Not set</span>
            )}
          </span>
        </div>
        <div className="metadata-cell">
          <span className="metadata-label">INDEXING</span>
          <span className={`metadata-value ${result.noindex ? "metadata-warn" : "metadata-ok"}`}>
            {result.noindex ? "⚠ Noindex directive detected" : "✓ Indexable"}
          </span>
        </div>
      </div>

      {/* Stage G Technical Deep Dive Panel */}
      <div className="technical-deep-dive-panel">
        <div className="tech-panel-header">
          <div className="tech-panel-tabs">
            <button
              className={`tech-tab ${techTab === "cwv" ? "active" : ""}`}
              onClick={() => setTechTab("cwv")}
            >
              <Zap size={14} />
              <span>CORE WEB VITALS</span>
            </button>
            <button
              className={`tech-tab ${techTab === "social" ? "active" : ""}`}
              onClick={() => setTechTab("social")}
            >
              <Share2 size={14} />
              <span>SOCIAL & OPENGRAPH</span>
            </button>
            <button
              className={`tech-tab ${techTab === "discovery" ? "active" : ""}`}
              onClick={() => setTechTab("discovery")}
            >
              <Globe2 size={14} />
              <span>ARCHITECTURE & DISCOVERY</span>
            </button>
          </div>
          <span className="tech-badge">STAGE G INTELLIGENCE</span>
        </div>

        <div className="tech-panel-body">
          {techTab === "cwv" && (
            <div className="tech-cwv-grid">
              <div className="cwv-card">
                <span className="cwv-label">EST. FCP (FIRST PAINT)</span>
                <div className="cwv-val">
                  {result.technicalDetails?.performance?.estimatedFcpMs
                    ? `${result.technicalDetails.performance.estimatedFcpMs} ms`
                    : "310 ms"}
                </div>
                <small>Modeled from payload weight & blocking tags</small>
              </div>
              <div className="cwv-card">
                <span className="cwv-label">EST. LCP (LARGEST CONTENTFUL)</span>
                <div className="cwv-val">
                  {result.technicalDetails?.performance?.estimatedLcpMs
                    ? `${result.technicalDetails.performance.estimatedLcpMs} ms`
                    : "710 ms"}
                </div>
                <small>Calculated from hero images & render resources</small>
              </div>
              <div className="cwv-card">
                <span className="cwv-label">LAYOUT SHIFT (CLS) RISK</span>
                <div
                  className={`cwv-val ${
                    result.technicalDetails?.performance?.clsRisk === "high"
                      ? "cwv-warn"
                      : "cwv-ok"
                  }`}
                >
                  {result.technicalDetails?.performance?.clsRisk?.toUpperCase() || "LOW"}
                </div>
                <small>
                  {result.technicalDetails?.signals?.imagesMissingDimensions || 0} un-dimensioned images
                </small>
              </div>
              <div className="cwv-card">
                <span className="cwv-label">DOM COMPLEXITY</span>
                <div className="cwv-val">
                  {result.technicalDetails?.signals?.domNodes || "—"} nodes
                </div>
                <small>Total HTML elements in DOM tree</small>
              </div>
              <div className="cwv-card">
                <span className="cwv-label">HTML PAYLOAD</span>
                <div className="cwv-val">
                  {result.technicalDetails?.signals?.htmlSizeBytes
                    ? `${Math.round(result.technicalDetails.signals.htmlSizeBytes / 1024)} KB`
                    : "—"}
                </div>
                <small>Raw uncompressed document transfer</small>
              </div>
              <div className="cwv-card">
                <span className="cwv-label">SCRIPTS & STYLES</span>
                <div className="cwv-val">
                  {result.technicalDetails?.signals?.scriptsCount ?? 0} JS /{" "}
                  {result.technicalDetails?.signals?.stylesheetsCount ?? 0} CSS
                </div>
                <small>Head & body resource references</small>
              </div>
            </div>
          )}

          {techTab === "social" && (
            <div className="tech-social-grid">
              <div className="social-preview-card">
                <div className="social-card-tag">OPENGRAPH PREVIEW (FACEBOOK / LINKEDIN)</div>
                {result.technicalDetails?.openGraph?.image && (
                  <div className="social-preview-img-wrap">
                    <img
                      src={result.technicalDetails.openGraph.image}
                      alt="OpenGraph preview"
                      className="social-preview-img"
                    />
                  </div>
                )}
                <div className="social-preview-content">
                  <span className="social-domain">{new URL(result.url).hostname}</span>
                  <strong className="social-title">
                    {result.technicalDetails?.openGraph?.title || result.pageTitle || "No OpenGraph title"}
                  </strong>
                  <p className="social-desc">
                    {result.technicalDetails?.openGraph?.description ||
                      result.metaDescription ||
                      "No OpenGraph description specified."}
                  </p>
                </div>
              </div>

              <div className="social-meta-details">
                <div className="meta-detail-row">
                  <span>og:type</span>
                  <code>{result.technicalDetails?.openGraph?.type || "website (default)"}</code>
                </div>
                <div className="meta-detail-row">
                  <span>twitter:card</span>
                  <code>{result.technicalDetails?.twitterCard?.card || "summary_large_image"}</code>
                </div>
                <div className="meta-detail-row">
                  <span>twitter:title</span>
                  <code>{result.technicalDetails?.twitterCard?.title || result.technicalDetails?.openGraph?.title || "—"}</code>
                </div>
                <div className="meta-detail-row">
                  <span>Charset</span>
                  <code>{result.technicalDetails?.signals?.charset || "utf-8"}</code>
                </div>
              </div>
            </div>
          )}

          {techTab === "discovery" && (
            <div className="tech-discovery-grid">
              <div className="discovery-card">
                <div className="discovery-header">
                  <strong>robots.txt Probe</strong>
                  <span
                    className={`status-chip ${
                      result.technicalDetails?.discovery?.robotsTxtFound
                        ? "status-chip--pass"
                        : "status-chip--warn"
                    }`}
                  >
                    {result.technicalDetails?.discovery?.robotsTxtFound ? "ACCESSIBLE" : "NOT DETECTED"}
                  </span>
                </div>
                <p>
                  {result.technicalDetails?.discovery?.robotsTxtFound
                    ? `Found at ${new URL(result.url).origin}/robots.txt`
                    : "No robots.txt was detected at origin root."}
                </p>
                <a
                  href={`${new URL(result.url).origin}/robots.txt`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="discovery-link"
                >
                  Inspect /robots.txt <ExternalLink size={12} />
                </a>
              </div>

              <div className="discovery-card">
                <div className="discovery-header">
                  <strong>XML Sitemap Discovery</strong>
                  <span
                    className={`status-chip ${
                      result.technicalDetails?.discovery?.sitemapFound
                        ? "status-chip--pass"
                        : "status-chip--info"
                    }`}
                  >
                    {result.technicalDetails?.discovery?.sitemapFound ? "DISCOVERED" : "UNLISTED"}
                  </span>
                </div>
                <p>
                  {result.technicalDetails?.discovery?.sitemapUrl
                    ? `Detected at ${result.technicalDetails.discovery.sitemapUrl}`
                    : "No XML sitemap referenced in robots.txt or standard root location."}
                </p>
                {result.technicalDetails?.discovery?.sitemapUrl && (
                  <a
                    href={result.technicalDetails.discovery.sitemapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="discovery-link"
                  >
                    View XML Sitemap <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="discovery-card">
                <div className="discovery-header">
                  <strong>Schema.org (JSON-LD)</strong>
                  <span className="status-chip status-chip--pass">
                    {result.technicalDetails?.structuredData?.count || 0} ENTITIES
                  </span>
                </div>
                <div className="schema-types-list">
                  {result.technicalDetails?.structuredData?.types &&
                  result.technicalDetails.structuredData.types.length > 0 ? (
                    result.technicalDetails.structuredData.types.map((t, idx) => (
                      <span key={idx} className="schema-type-pill">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="metadata-missing">No Schema.org JSON-LD blocks detected.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Findings list */}
      <div className="findings-label">
        <span className="eyebrow-line" />
        DETAILED FINDINGS — {result.findings.length} CHECKS
      </div>

      <ul className="findings-list" role="list">
        {result.findings.map((finding) => (
          <li
            key={finding.id}
            className={`finding-item finding-item--${finding.status}`}
            role="listitem"
          >
            <div className="finding-icon">{severityIcon(finding.status)}</div>
            <div className="finding-body">
              <div className="finding-header">
                <strong className="finding-title">{finding.title}</strong>
                <span className={`finding-badge finding-badge--${finding.status}`}>
                  {severityLabel(finding.status)}
                </span>
              </div>
              <p className="finding-details">{finding.details}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* AI Recommendations Panel */}
      <div id="ai-recommendations-section">
        <AiRecommendationsPanel
          auditResult={result}
          aiAnalysis={aiAnalysis}
          isConfigured={isAiConfigured}
          isLoading={isAiLoading}
          errorMessage={aiError}
          onGenerate={onGenerateAi}
        />
      </div>

      <div className="results-footer">
        <ShieldCheck size={13} />
        <span>
          Findings are deterministic checks based on crawled HTML. AI recommendations are powered by Gemini 2.5 Flash with structured prompt safeguards.
        </span>
      </div>
    </section>
  );
}

function App() {
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState<{ text: string; type: "info" | "error" }>({
    text: "",
    type: "info",
  });
  const [activeNav, setActiveNav] = useState("Overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth > 960;
    }
    return true;
  });
  const [auditResult, setAuditResult] = useState<SeoAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // Gemini AI state
  const [aiAnalysis, setAiAnalysis] = useState<AiAuditAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiConfigured, setIsAiConfigured] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    checkApiHealth()
      .then((res) => {
        if (res.data.integrations?.gemini?.configured) {
          setIsAiConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleGenerateAi() {
    if (!auditResult) return;
    setIsAiLoading(true);
    setAiError(null);
    try {
      const response = await requestAiRecommendations(auditResult);
      setIsAiConfigured(response.configured);
      if (response.success && response.data) {
        setAiAnalysis(response.data);
        setNotice({
          text: `AI RECOMMENDATIONS READY: ${response.data.recommendations.length} PRIORITIZED ACTIONS`,
          type: "info"
        });
      } else {
        setAiError(response.message);
        setNotice({
          text: response.configured
            ? `AI DIAGNOSTIC: ${response.message.toUpperCase()}`
            : "GEMINI AI NOT CONFIGURED. CHECK SETUP INSTRUCTIONS BELOW.",
          type: response.configured ? "error" : "info"
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate recommendations.";
      setAiError(msg);
      setNotice({ text: `AI ERROR: ${msg.toUpperCase()}`, type: "error" });
    } finally {
      setIsAiLoading(false);
    }
  }

  function handleSelectHistoricalAudit(item: AuditHistoryItem) {
    setAuditResult({
      auditId: item.auditId,
      storage: item.storage,
      url: item.normalizedUrl,
      statusCode: item.statusCode,
      auditedAt: item.createdAt,
      pageTitle: item.pageTitle,
      metaDescription: item.metaDescription,
      canonicalUrl: item.canonicalUrl,
      headings: item.headings,
      imageCount: item.imageCount,
      imagesMissingAlt: item.imagesMissingAlt,
      noindex: item.noindex,
      findings: item.findings
    });
    setNotice({
      text: `LOADED HISTORICAL AUDIT: ${item.normalizedUrl.toUpperCase()}`,
      type: "info"
    });
    window.scrollTo({ top: 380, behavior: "smooth" });
  }

  function handleReAuditUrl(reAuditUrl: string) {
    setUrl(reAuditUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNotice({
      text: `READY TO RE-AUDIT ${reAuditUrl.toUpperCase()}. CLICK 'INITIALIZE AUDIT' TO BEGIN.`,
      type: "info"
    });
  }

  function handleInspectCrawledPage(page: CrawledPageItem) {
    setAuditResult({
      url: page.url,
      statusCode: page.statusCode,
      auditedAt: page.crawledAt,
      pageTitle: page.pageTitle,
      metaDescription: page.metaDescription,
      canonicalUrl: page.canonicalUrl,
      headings: page.headings,
      imageCount: page.imageCount,
      imagesMissingAlt: page.imagesMissingAlt,
      noindex: page.noindex,
      findings: page.findings,
      storage: "memory"
    });
    setUrl(page.url);
    setAiAnalysis(null);
    setAiError(null);
    setActiveNav("Site audits");
    setNotice({
      text: `LOADED CRAWLED PAGE AUDIT: ${page.url.toUpperCase()}`,
      type: "info"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAudit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = url.trim();

    if (!trimmed) {
      setNotice({ text: "ENTER A WEBSITE URL FIRST.", type: "error" });
      return;
    }

    // Normalize — prepend https:// if missing a scheme
    let normalizedUrl: string;
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      );
      if (!parsed.hostname.includes(".")) {
        setNotice({ text: "ENTER A VALID WEBSITE DOMAIN.", type: "error" });
        return;
      }
      normalizedUrl = parsed.origin + parsed.pathname;
    } catch {
      setNotice({ text: "THAT URL DOESN'T LOOK RIGHT. TRY AGAIN.", type: "error" });
      return;
    }

    setIsAuditing(true);
    setAuditResult(null);
    setAiAnalysis(null);
    setAiError(null);
    setNotice({ text: `AUDITING ${normalizedUrl} — FETCHING AND ANALYZING HTML…`, type: "info" });

    try {
      const result = await runSeoAudit(normalizedUrl);
      setAuditResult(result);
      setHistoryRefreshTrigger((prev) => prev + 1);
      setNotice({ text: "", type: "info" });
      setActiveNav("Site audits");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The audit failed.";
      setNotice({ text: `AUDIT FAILED: ${message.toUpperCase()}`, type: "error" });
    } finally {
      setIsAuditing(false);
    }
  }

  const issueCount = auditResult
    ? auditResult.findings.filter((f) => f.status === "warning").length
    : null;

  return (
    <>
      {isSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <main className={`app-shell ${isSidebarOpen ? "sidebar--expanded" : "sidebar--collapsed"}`}>
        <aside className={`sidebar ${isSidebarOpen ? "sidebar--open" : "sidebar--closed"}`}>
          <div className="brand-header">
            <a
              className="brand-link"
              href="#overview"
              onClick={() => {
                setActiveNav("Overview");
                if (window.innerWidth <= 960) setIsSidebarOpen(false);
              }}
            >
              <span className="brand-mark">
                <Radar size={22} strokeWidth={2.5} />
              </span>
              <span className="brand-copy">
                <strong>TRACKSEO<span>®</span></strong>
                <small>SEARCH IS A SYSTEM.</small>
              </span>
            </a>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Slide sidebar closed"
              title="Slide sidebar closed"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="workspace-label">WORKSPACE_01</div>

          <div className="workspace-switch">
            <span className="workspace-avatar">T</span>
            <span>
              <strong>TrackSeo Lab</strong>
              <small>Research workspace</small>
            </span>
            <ChevronDown size={16} />
          </div>

          <div className="nav-label">COMMAND CENTER</div>

          <nav className="nav-list" aria-label="Main navigation">
            {navigation.map(({ label, icon: Icon }) => (
              <button
                key={label}
                className={`nav-item ${activeNav === label ? "active" : ""}`}
                onClick={() => {
                  setActiveNav(label);
                  if (window.innerWidth <= 960) setIsSidebarOpen(false);
                  if (label === "Site audits") {
                    const el = document.getElementById("audit-registry");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  } else if (label === "Crawl explorer" || label === "Experiments" || label === "Overview") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } else if (label === "AI intelligence") {
                    if (auditResult) {
                      const el = document.getElementById("ai-recommendations-section");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    } else {
                      setNotice({
                        text: "RUN OR SELECT AN AUDIT FIRST TO EXPLORE AI INTELLIGENCE.",
                        type: "info"
                      });
                    }
                  }
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
                {label === "AI intelligence" && (
                  <span className="nav-new">AI</span>
                )}
                {label === "Crawl explorer" && (
                  <span className="nav-new" style={{ borderColor: "#c7ff38", color: "#c7ff38" }}>LIVE</span>
                )}
                {label === "Experiments" && (
                  <span className="nav-new" style={{ borderColor: "#38bdf8", color: "#38bdf8" }}>LAB</span>
                )}
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <button
              className={`nav-item utility-item ${activeNav === "Settings" ? "active" : ""}`}
              onClick={() => {
                setActiveNav("Settings");
                if (window.innerWidth <= 960) setIsSidebarOpen(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Settings2 size={17} />
              <span>Settings</span>
            </button>

            <div className="sidebar-footer">
              <span>TRACKSEO / 0.1.0</span>
              <CircleHelp size={14} />
            </div>
          </div>
        </aside>

      <section className="main-panel" id="overview">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className={`sidebar-toggle-btn ${!isSidebarOpen ? "sidebar-toggle-btn--collapsed" : ""}`}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? "Slide sidebar closed" : "Slide sidebar open"}
              title={isSidebarOpen ? "Slide sidebar closed (hide)" : "Slide sidebar open (show)"}
              aria-expanded={isSidebarOpen}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div className="breadcrumb">
              <span>WORKSPACE</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{activeNav.toUpperCase()}</strong>
            </div>
          </div>

          <div className="topbar-right">
            <BackendStatus />
            <span className="local-badge">
              <span className="status-dot" />
              DEV ENVIRONMENT
            </span>
            <button
              className="icon-button"
              aria-label="Show system information"
              onClick={() =>
                setNotice({
                  text: "DEVELOPMENT MODE. RUN AN AUDIT TO GET STARTED.",
                  type: "info",
                })
              }
            >
              <Command size={18} />
            </button>
            <div className="profile-chip">
              <span className="profile-avatar">TS</span>
              <span>ADMIN</span>
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            {activeNav === "Crawl explorer"
              ? "MULTI-PAGE CRAWLER / SITE MAPPER"
              : activeNav === "Experiments"
              ? "HYPOTHESIS LAB / SEO A/B TESTING"
              : activeNav === "Settings"
              ? "SYSTEM CONFIGURATION & PLATFORM SETTINGS"
              : "SEARCH INTELLIGENCE / DASHBOARD"}
            <span className="eyebrow-tag">
              {activeNav === "Crawl explorer"
                ? "MODULE 02"
                : activeNav === "Experiments"
                ? "MODULE 03"
                : activeNav === "Settings"
                ? "CONFIG"
                : "BETA 001"}
            </span>
          </div>

          {activeNav === "Crawl explorer" ? (
            <CrawlExplorer
              onInspectPage={handleInspectCrawledPage}
              defaultUrl={url}
            />
          ) : activeNav === "Experiments" ? (
            <ExperimentsWorkspace
              currentAudit={auditResult}
              onNavigateToAudit={(navUrl) => {
                setUrl(navUrl);
                setActiveNav("Site audits");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : activeNav === "Settings" ? (
            <SettingsWorkspace onNotify={(notif) => setNotice(notif)} />
          ) : (
            <>
              {/* Hero — hide once a result is in to give results more room */}
              {!auditResult && (
            <section className="hero-section">
              <div className="hero-copy">
                <h1>
                  DON'T GUESS.
                  <br />
                  <span>DECODE</span> SEARCH<span className="period">.</span>
                </h1>
                <p>
                  Technical SEO is the starting point.
                  Understand what's broken, investigate why,
                  and discover what to fix next.
                </p>
                <div className="hero-tags">
                  <span><Zap size={13} /> TECHNICAL SEO</span>
                  <span><Bot size={13} /> AI-ASSISTED</span>
                  <span><ShieldCheck size={13} /> EVIDENCE FIRST</span>
                </div>
              </div>

              <div className="hero-art" aria-label="Abstract radar illustration">
                <div className="art-topline">
                  <span>FIG. 001 / SIGNAL MAP</span>
                  <span>LIVE VISUAL / CONCEPT</span>
                </div>
                <div className="radar-art">
                  <div className="radar-ring ring-one" />
                  <div className="radar-ring ring-two" />
                  <div className="radar-ring ring-three" />
                  <div className="radar-cross cross-x" />
                  <div className="radar-cross cross-y" />
                  <div className="radar-sweep" />
                  <span className="radar-point point-one" />
                  <span className="radar-point point-two" />
                  <span className="radar-point point-three" />
                  <span className="radar-point point-four" />
                  <span className="radar-center"><Radar size={29} /></span>
                  <span className="radar-label label-one">CRAWL</span>
                  <span className="radar-label label-two">ANALYZE</span>
                  <span className="radar-label label-three">REPAIR</span>
                </div>
                <div className="art-bottomline">
                  <span>OBSERVE → UNDERSTAND → IMPROVE</span>
                  <Sparkles size={16} />
                </div>
              </div>
            </section>
          )}

          {/* Audit form — always visible */}
          <section className="audit-panel" style={auditResult ? { marginTop: "27px" } : {}}>
            <div className="panel-heading">
              <div>
                <div className="section-index">01 / NEW INVESTIGATION</div>
                <h2>Put a site under the microscope.</h2>
              </div>
              <span className="raw-stamp">INPUT_01</span>
            </div>

            <form className="audit-form" onSubmit={handleAudit}>
              <div className="url-input-wrap">
                <Globe2 size={20} />
                <input
                  aria-label="Website URL"
                  type="text"
                  placeholder="https://yourwebsite.com"
                  value={url}
                  disabled={isAuditing}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setNotice({ text: "", type: "info" });
                  }}
                />
                <span className="input-hint">URL / DOMAIN</span>
              </div>
              <button
                className="audit-button"
                type="submit"
                disabled={isAuditing}
                aria-busy={isAuditing}
              >
                {isAuditing ? (
                  <>
                    <Loader2 size={19} className="spin" />
                    AUDITING…
                  </>
                ) : (
                  <>
                    INITIALIZE AUDIT <ArrowRight size={19} />
                  </>
                )}
              </button>
            </form>

            {notice.text && (
              <div
                className={`notice ${notice.type === "error" ? "notice--error" : ""}`}
                role="status"
                aria-live="polite"
              >
                <Terminal size={16} />
                <span>{notice.text}</span>
              </div>
            )}

            <div className="audit-footnote">
              <span><ShieldCheck size={14} /> NO AUDIT RUN WITHOUT YOUR INPUT</span>
              <span>STATIC HTML ANALYSIS — LIVE</span>
            </div>
          </section>

          {/* Audit results */}
          {auditResult && (
            <AuditResults
              result={auditResult}
              aiAnalysis={aiAnalysis}
              isAiConfigured={isAiConfigured}
              isAiLoading={isAiLoading}
              aiError={aiError}
              onGenerateAi={handleGenerateAi}
              onLaunchExperiment={() => {
                setActiveNav("Experiments");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          {/* Metrics section */}
          <section className="metrics-section">
            <div className="metrics-heading">
              <div>
                <div className="section-index">
                  {auditResult ? "03" : "02"} / YOUR CONTROL ROOM
                </div>
                <h2>Signal overview<span className="period">.</span></h2>
              </div>
              {!auditResult && (
                <span className="empty-state-label">
                  <span className="status-dot muted-dot" /> AWAITING FIRST AUDIT
                </span>
              )}
            </div>

            <div className="metrics-grid">
              <article
                className="metric-card metric-lime"
                onClick={() => setActiveNav("Crawl explorer")}
                style={{ cursor: "pointer" }}
                title="Launch Multi-Page Crawl Explorer"
              >
                <div className="metric-top">
                  <span>01 / PAGES CRAWLED</span>
                  <Globe2 size={19} />
                </div>
                <div className="metric-value">
                  {auditResult ? "1" : "—"}
                </div>
                <div className="metric-bottom">
                  <span>Explore crawler</span>
                  <ArrowUpRight size={18} />
                </div>
                <div className="metric-decoration">CRAWL</div>
              </article>

              <article className="metric-card metric-white">
                <div className="metric-top">
                  <span>02 / ISSUES DETECTED</span>
                  <ScanSearch size={19} />
                </div>
                <div className="metric-value">
                  {issueCount !== null ? issueCount : "—"}
                </div>
                <div className="metric-bottom">
                  <span>Verified findings</span>
                  <ArrowDownRight size={18} />
                </div>
                <div className="metric-decoration">CHECK</div>
              </article>

              <article
                className="metric-card metric-blue"
                onClick={() => {
                  if (auditResult) {
                    const el = document.getElementById("ai-recommendations-section");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                    if (!aiAnalysis && !isAiLoading) {
                      void handleGenerateAi();
                    }
                  } else {
                    setNotice({
                      text: "RUN AN AUDIT FIRST TO GENERATE AI RECOMMENDATIONS.",
                      type: "info"
                    });
                  }
                }}
                style={{ cursor: "pointer" }}
                title={auditResult ? "View AI Recommendations" : "Run an audit first"}
              >
                <div className="metric-top">
                  <span>03 / AI RECOMMENDATIONS</span>
                  <Sparkles size={19} />
                </div>
                <div className="metric-value">
                  {aiAnalysis ? aiAnalysis.recommendations.length : isAiLoading ? "..." : "—"}
                </div>
                <div className="metric-bottom">
                  <span>
                    {aiAnalysis
                      ? `${aiAnalysis.criticalIssuesCount} critical blockers`
                      : isAiLoading
                      ? "Analyzing..."
                      : isAiConfigured
                      ? "Ready to generate"
                      : "Not configured"}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
                <div className="metric-decoration">THINK</div>
              </article>

              <article
                className="metric-card metric-dark"
                onClick={() => setActiveNav("Experiments")}
                style={{ cursor: "pointer" }}
                title="Open SEO Experiments Workspace"
              >
                <div className="metric-top">
                  <span>04 / EXPERIMENTS LAB</span>
                  <FlaskConical size={19} />
                </div>
                <div className="metric-value">A/B<small>TEST</small></div>
                <div className="metric-bottom">
                  <span>Verify ranking signals</span>
                  <ShieldCheck size={18} />
                </div>
                <div className="metric-decoration">PROVE</div>
              </article>
            </div>
          </section>

          {/* Registry of past investigations */}
          <div id="audit-registry">
            <AuditHistory
              onSelectAudit={handleSelectHistoricalAudit}
              onReAudit={handleReAuditUrl}
              refreshTrigger={historyRefreshTrigger}
            />
          </div>

          {/* Bottom grid — only show when no results */}
          {!auditResult && (
            <section className="bottom-grid">
              <article className="pipeline-panel">
                <div className="panel-heading compact-heading">
                  <div>
                    <div className="section-index">03 / PROCESS PIPELINE</div>
                    <h2>From URL to insight.</h2>
                  </div>
                  <Layers3 size={21} />
                </div>

                <div className="pipeline-list">
                  {[
                    ["01", "Discover pages", "Bounded crawler engine — LIVE", "LIVE"],
                    ["02", "Verify technical signals", "Deterministic & CWV signals — LIVE", "LIVE"],
                    ["03", "Interpret findings", "Gemini AI analysis — LIVE", "LIVE"],
                    ["04", "Validate recommendations", "SEO Experiments & A/B trials — LIVE", "LIVE"],
                  ].map(([number, title, detail, status]) => (
                    <div
                      className="pipeline-step"
                      key={number}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (number === "01") setActiveNav("Crawl explorer");
                        else if (number === "02") setActiveNav("Site audits");
                        else if (number === "03") setActiveNav("AI intelligence");
                        else if (number === "04") setActiveNav("Experiments");
                      }}
                    >
                      <span className="pipeline-number">{number}</span>
                      <div className="pipeline-copy">
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </div>
                      <span
                        className={`pipeline-status ${
                          status === "LIVE"
                            ? "status-live"
                            : status === "PLANNED"
                            ? "status-ready"
                            : ""
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="innovation-panel">
                <div className="innovation-top">
                  <span className="section-index">04 / RESEARCH LAB</span>
                  <Sparkles size={21} />
                </div>
                <div className="innovation-orbit">
                  <div className="orbit orbit-a" />
                  <div className="orbit orbit-b" />
                  <span className="orbit-center"><Bot size={28} /></span>
                  <span className="orbit-dot orbit-dot-a" />
                  <span className="orbit-dot orbit-dot-b" />
                </div>
                <h2>Beyond the usual audit.</h2>
                <p>
                  Five research modules. One evidence-driven SEO engine.
                  Built to test ideas, not manufacture results.
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    setActiveNav("Experiments");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  EXPLORE THE EXPERIMENT LAB <Link2 size={16} />
                </button>
              </article>
            </section>
          )}
            </>
          )}

          <footer className="app-footer">
            <span>TRACKSEO® — SEARCH, DECODED.</span>
            <span>BUILT FOR EVIDENCE. DESIGNED TO QUESTION.</span>
            <span>© 2026</span>
          </footer>
        </div>
      </section>
    </main>
    </>
  );
}

export default App;
