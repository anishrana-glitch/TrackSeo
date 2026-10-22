import { useState, useEffect } from "react";
import {
  checkApiHealth,
  fetchBrowserbaseStatus,
  type ApiHealthResponse,
  type BrowserbaseStatus
} from "../services/api";
import {
  Settings2,
  Database,
  Bot,
  Globe2,
  Sliders,
  FileText,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Save,
  Trash2,
  Download,
  Terminal,
  Server
} from "lucide-react";
import "./SettingsWorkspace.css";

export interface PlatformSettings {
  agencyName: string;
  defaultExportFormat: "html" | "json" | "csv";
  includeAiInExport: boolean;
  defaultMaxPages: number;
  defaultMaxDepth: number;
  defaultTimeoutSeconds: number;
  defaultCrawlEngine: "auto" | "cheerio" | "browserbase";
  minTitleLength: number;
  maxTitleLength: number;
  minDescLength: number;
  maxDescLength: number;
  enableCwvSignals: boolean;
  enforceMobileViewport: boolean;
}

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  agencyName: "TrackSeo Intelligence Lab",
  defaultExportFormat: "html",
  includeAiInExport: true,
  defaultMaxPages: 20,
  defaultMaxDepth: 2,
  defaultTimeoutSeconds: 30,
  defaultCrawlEngine: "auto",
  minTitleLength: 30,
  maxTitleLength: 60,
  minDescLength: 120,
  maxDescLength: 160,
  enableCwvSignals: true,
  enforceMobileViewport: true
};

const STORAGE_KEY = "trackseo_platform_settings";

function loadSavedSettings(): PlatformSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLATFORM_SETTINGS;
    return { ...DEFAULT_PLATFORM_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
}

function saveSettingsToStorage(settings: PlatformSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to persist settings:", err);
  }
}

interface SettingsWorkspaceProps {
  onNotify?: (notice: { text: string; type: "info" | "error" }) => void;
}

export default function SettingsWorkspace({ onNotify }: SettingsWorkspaceProps) {
  const [settings, setSettings] = useState<PlatformSettings>(loadSavedSettings);
  const [activeTab, setActiveTab] = useState<"integrations" | "crawler" | "auditing" | "branding" | "storage">("integrations");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live Diagnostics State
  const [isPinging, setIsPinging] = useState(false);
  const [healthData, setHealthData] = useState<ApiHealthResponse["data"] | null>(null);
  const [browserbaseData, setBrowserbaseData] = useState<BrowserbaseStatus | null>(null);
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setIsPinging(true);
    setPingError(null);
    const start = Date.now();
    try {
      const [healthRes, bbRes] = await Promise.all([
        checkApiHealth(),
        fetchBrowserbaseStatus().catch(() => ({ configured: false, projectId: null }))
      ]);
      setPingLatencyMs(Date.now() - start);
      setHealthData(healthRes.data);
      setBrowserbaseData(bbRes);
    } catch (err) {
      setPingError(err instanceof Error ? err.message : "Failed to connect to backend");
      setPingLatencyMs(null);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const handleSave = () => {
    saveSettingsToStorage(settings);
    setSaveSuccess(true);
    if (onNotify) {
      onNotify({
        text: "SETTINGS PERSISTED TO LOCAL STORAGE SUCCESSFULLY.",
        type: "info"
      });
    }
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleResetDefaults = () => {
    if (window.confirm("Reset all settings to platform defaults?")) {
      setSettings(DEFAULT_PLATFORM_SETTINGS);
      saveSettingsToStorage(DEFAULT_PLATFORM_SETTINGS);
      if (onNotify) {
        onNotify({ text: "ALL SETTINGS RESET TO SYSTEM DEFAULTS.", type: "info" });
      }
    }
  };

  const handleClearCache = () => {
    if (window.confirm("Clear local application caches and reset stored preferences?")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("trackseo_experiments_filters");
      setSettings(DEFAULT_PLATFORM_SETTINGS);
      if (onNotify) {
        onNotify({ text: "LOCAL APPLICATION CACHES CLEARED.", type: "info" });
      }
    }
  };

  const handleExportDiagnostics = () => {
    const diag = {
      app: "TrackSeo",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      diagnostics: {
        apiStatus: healthData ? "online" : "offline",
        apiLatencyMs: pingLatencyMs,
        database: healthData?.database || "not_detected",
        geminiAi: healthData?.integrations?.gemini || "not_detected",
        browserbase: browserbaseData || "not_detected"
      },
      clientSettings: settings,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    };

    const blob = new Blob([JSON.stringify(diag, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trackseo-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dbStatus = healthData?.database?.status || "disconnected";
  const geminiConfigured = Boolean(healthData?.integrations?.gemini?.configured);
  const bbConfigured = Boolean(browserbaseData?.configured);

  return (
    <div className="settings-workspace">
      {/* Header */}
      <div className="settings-header">
        <div className="settings-header-left">
          <div className="settings-badge">
            <Settings2 size={13} />
            <span>PLATFORM SETTINGS & DIAGNOSTICS</span>
          </div>
          <h2>Control Room & System Configuration<span className="period">.</span></h2>
          <p className="settings-subtitle">
            Manage external integrations, crawler presets, technical audit thresholds, and report branding.
          </p>
        </div>

        <div className="settings-header-actions">
          <button
            className="settings-ping-btn"
            onClick={runDiagnostics}
            disabled={isPinging}
            title="Ping backend API and database"
          >
            <RotateCw size={14} className={isPinging ? "spin" : ""} />
            <span>{isPinging ? "PINGING…" : "REFRESH STATUS"}</span>
          </button>

          <button
            className={`settings-save-btn ${saveSuccess ? "saved" : ""}`}
            onClick={handleSave}
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 size={15} />
                <span>SAVED!</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>SAVE CONFIG</span>
              </>
            )}
          </button>
        </div>
      </div>

      {pingError && (
        <div
          className="ping-error-banner"
          style={{
            background: "rgba(255, 85, 85, 0.15)",
            border: "1px solid #ff5555",
            color: "#ff5555",
            padding: "10px 14px",
            fontFamily: "var(--mono)",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <AlertTriangle size={15} />
          <span>BACKEND DIAGNOSTIC ERROR: {pingError.toUpperCase()}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="settings-tabs-bar">
        <button
          className={`settings-tab ${activeTab === "integrations" ? "active" : ""}`}
          onClick={() => setActiveTab("integrations")}
        >
          <Server size={14} />
          <span>INTEGRATIONS & INFRA</span>
        </button>

        <button
          className={`settings-tab ${activeTab === "crawler" ? "active" : ""}`}
          onClick={() => setActiveTab("crawler")}
        >
          <Globe2 size={14} />
          <span>CRAWLER DEFAULTS</span>
        </button>

        <button
          className={`settings-tab ${activeTab === "auditing" ? "active" : ""}`}
          onClick={() => setActiveTab("auditing")}
        >
          <Sliders size={14} />
          <span>AUDIT THRESHOLDS</span>
        </button>

        <button
          className={`settings-tab ${activeTab === "branding" ? "active" : ""}`}
          onClick={() => setActiveTab("branding")}
        >
          <FileText size={14} />
          <span>REPORT BRANDING</span>
        </button>

        <button
          className={`settings-tab ${activeTab === "storage" ? "active" : ""}`}
          onClick={() => setActiveTab("storage")}
        >
          <Database size={14} />
          <span>CACHE & SYSTEM</span>
        </button>
      </div>

      {/* Tab 1: Integrations & Infrastructure */}
      {activeTab === "integrations" && (
        <div className="settings-section">
          <div className="section-label">
            <span className="eyebrow-line" />
            LIVE SERVICE CONNECTIVITY & DIAGNOSTICS
          </div>

          <div className="integrations-grid">
            {/* MongoDB Atlas Card */}
            <div className={`integration-card ${dbStatus === "connected" ? "card-online" : "card-fallback"}`}>
              <div className="int-card-top">
                <div className="int-icon-wrap">
                  <Database size={20} />
                </div>
                <div className="int-title-wrap">
                  <strong>MongoDB Atlas Persistence</strong>
                  <small>Compound indexed audit history & experiment trials</small>
                </div>
                <span className={`status-pill pill-${dbStatus}`}>
                  {dbStatus === "connected"
                    ? "CONNECTED"
                    : dbStatus === "connecting"
                    ? "CONNECTING"
                    : dbStatus === "not_configured"
                    ? "IN-MEMORY FALLBACK"
                    : "DISCONNECTED"}
                </span>
              </div>

              <div className="int-card-body">
                <div className="int-stat-row">
                  <span>Persistence Mode:</span>
                  <strong>{dbStatus === "connected" ? "MongoDB Atlas (Permanent)" : "FIFO In-Memory Buffer (Graceful)"}</strong>
                </div>
                <div className="int-stat-row">
                  <span>Target Database:</span>
                  <code>{healthData?.database?.dbName || "trackseo"}</code>
                </div>
                {healthData?.database?.host && (
                  <div className="int-stat-row">
                    <span>Cluster Host:</span>
                    <code>{healthData.database.host}</code>
                  </div>
                )}
                {pingLatencyMs !== null && (
                  <div className="int-stat-row">
                    <span>Roundtrip Ping:</span>
                    <strong className="latency-val">{pingLatencyMs} ms</strong>
                  </div>
                )}
              </div>

              <div className="int-card-footer">
                <span className="cli-hint">
                  <Terminal size={12} />
                  CLI Diagnostic: <code>npm run test:db</code>
                </span>
              </div>
            </div>

            {/* Google Gemini AI Card */}
            <div className={`integration-card ${geminiConfigured ? "card-online" : "card-fallback"}`}>
              <div className="int-card-top">
                <div className="int-icon-wrap">
                  <Bot size={20} />
                </div>
                <div className="int-title-wrap">
                  <strong>Google Gemini AI Intelligence</strong>
                  <small>Structured technical audits & copyable code recommendations</small>
                </div>
                <span className={`status-pill ${geminiConfigured ? "pill-connected" : "pill-not_configured"}`}>
                  {geminiConfigured ? "ACTIVE" : "KEY REQUIRED"}
                </span>
              </div>

              <div className="int-card-body">
                <div className="int-stat-row">
                  <span>Active Model:</span>
                  <strong>gemini-2.5-flash</strong>
                </div>
                <div className="int-stat-row">
                  <span>Prompt Injection Shield:</span>
                  <strong className="text-lime">ENFORCED (Level 3)</strong>
                </div>
                <div className="int-stat-row">
                  <span>Environment Variable:</span>
                  <code>GEMINI_API_KEY</code>
                </div>
              </div>

              <div className="int-card-footer">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="int-action-link"
                >
                  Get API Key from Google AI Studio <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {/* Browserbase Cloud Browser Card */}
            <div className={`integration-card ${bbConfigured ? "card-online" : "card-fallback"}`}>
              <div className="int-card-top">
                <div className="int-icon-wrap">
                  <Globe2 size={20} />
                </div>
                <div className="int-title-wrap">
                  <strong>Browserbase Headless Crawler</strong>
                  <small>Dynamic JS rendering & multi-page site discovery</small>
                </div>
                <span className={`status-pill ${bbConfigured ? "pill-connected" : "pill-not_configured"}`}>
                  {bbConfigured ? "CONNECTED" : "STATIC CHEERIO FALLBACK"}
                </span>
              </div>

              <div className="int-card-body">
                <div className="int-stat-row">
                  <span>Active Engine:</span>
                  <strong>{bbConfigured ? "Browserbase Cloud Headless" : "Cheerio High-Speed Static Engine"}</strong>
                </div>
                <div className="int-stat-row">
                  <span>SSRF Hardening:</span>
                  <strong className="text-lime">DNS Verification & Subnet Blocking</strong>
                </div>
                {browserbaseData?.projectId && (
                  <div className="int-stat-row">
                    <span>Project ID:</span>
                    <code>{browserbaseData.projectId}</code>
                  </div>
                )}
              </div>

              <div className="int-card-footer">
                <span className="cli-hint">
                  <ShieldCheck size={12} />
                  Private/loopback IP requests are strictly rejected.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Crawler Defaults */}
      {activeTab === "crawler" && (
        <div className="settings-section">
          <div className="section-label">
            <span className="eyebrow-line" />
            DEFAULT SITE MAPPER & CRAWLER PARAMETERS
          </div>

          <div className="form-card">
            <div className="form-grid">
              <div className="form-field">
                <label>
                  <span>Default Max Pages:</span>
                  <small>Maximum distinct pages crawled per seed URL (Safety cap: 50)</small>
                </label>
                <select
                  value={settings.defaultMaxPages}
                  onChange={(e) => setSettings({ ...settings, defaultMaxPages: Number(e.target.value) })}
                >
                  <option value={5}>5 Pages (Quick Sample)</option>
                  <option value={10}>10 Pages (Standard)</option>
                  <option value={20}>20 Pages (Deep Audit — Recommended)</option>
                  <option value={50}>50 Pages (Full Structure)</option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  <span>Default Crawl Depth:</span>
                  <small>BFS link hops from root page</small>
                </label>
                <select
                  value={settings.defaultMaxDepth}
                  onChange={(e) => setSettings({ ...settings, defaultMaxDepth: Number(e.target.value) })}
                >
                  <option value={1}>Depth 1 (Direct links from homepage)</option>
                  <option value={2}>Depth 2 (Sub-pages & categories)</option>
                  <option value={3}>Depth 3 (Full site hierarchy)</option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  <span>Per-Job Timeout (seconds):</span>
                  <small>Hard cancellation cutoff for multi-page crawl jobs</small>
                </label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={settings.defaultTimeoutSeconds}
                  onChange={(e) => setSettings({ ...settings, defaultTimeoutSeconds: Number(e.target.value) })}
                />
              </div>

              <div className="form-field">
                <label>
                  <span>Preferred Crawler Engine:</span>
                  <small>Automatic falls back to Cheerio if Browserbase key is absent</small>
                </label>
                <select
                  value={settings.defaultCrawlEngine}
                  onChange={(e) => setSettings({ ...settings, defaultCrawlEngine: e.target.value as any })}
                >
                  <option value="auto">Auto (Browserbase if configured, Cheerio fallback)</option>
                  <option value="cheerio">Cheerio Static Only (Fastest, zero cost)</option>
                  <option value="browserbase">Browserbase Headless Preferred</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Technical Audit Thresholds */}
      {activeTab === "auditing" && (
        <div className="settings-section">
          <div className="section-label">
            <span className="eyebrow-line" />
            TECHNICAL SEO CHECKS & SIGNAL THRESHOLDS
          </div>

          <div className="form-card">
            <div className="form-grid">
              <div className="form-field">
                <label>
                  <span>Title Tag Length Range (characters):</span>
                  <small>Standard best-practice is 30 to 60 characters</small>
                </label>
                <div className="range-inputs">
                  <input
                    type="number"
                    min={10}
                    max={50}
                    value={settings.minTitleLength}
                    onChange={(e) => setSettings({ ...settings, minTitleLength: Number(e.target.value) })}
                  />
                  <span>to</span>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={settings.maxTitleLength}
                    onChange={(e) => setSettings({ ...settings, maxTitleLength: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-field">
                <label>
                  <span>Meta Description Length Range (characters):</span>
                  <small>Recommended SERP snippet length is 120 to 160 characters</small>
                </label>
                <div className="range-inputs">
                  <input
                    type="number"
                    min={50}
                    max={130}
                    value={settings.minDescLength}
                    onChange={(e) => setSettings({ ...settings, minDescLength: Number(e.target.value) })}
                  />
                  <span>to</span>
                  <input
                    type="number"
                    min={140}
                    max={300}
                    value={settings.maxDescLength}
                    onChange={(e) => setSettings({ ...settings, maxDescLength: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-field form-field-checkbox">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.enableCwvSignals}
                    onChange={(e) => setSettings({ ...settings, enableCwvSignals: e.target.checked })}
                  />
                  <div>
                    <strong>Core Web Vitals & Performance Heuristics</strong>
                    <small>Estimate FCP, LCP, and CLS image dimension shift risks</small>
                  </div>
                </label>
              </div>

              <div className="form-field form-field-checkbox">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.enforceMobileViewport}
                    onChange={(e) => setSettings({ ...settings, enforceMobileViewport: e.target.checked })}
                  />
                  <div>
                    <strong>Strict Mobile Viewport & Charset Verification</strong>
                    <small>Require width=device-width and UTF-8 charset declarations</small>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Report Branding & Exports */}
      {activeTab === "branding" && (
        <div className="settings-section">
          <div className="section-label">
            <span className="eyebrow-line" />
            EXPORT CUSTOMIZATION & PDF REPORT BRANDING
          </div>

          <div className="form-card">
            <div className="form-grid">
              <div className="form-field">
                <label>
                  <span>Organization / Agency Name:</span>
                  <small>Stamped on top of generated HTML and Print-PDF audit reports</small>
                </label>
                <input
                  type="text"
                  value={settings.agencyName}
                  placeholder="e.g. Acme SEO Consulting"
                  onChange={(e) => setSettings({ ...settings, agencyName: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>
                  <span>Default Report Export Format:</span>
                  <small>Selected format when triggering one-click exports</small>
                </label>
                <select
                  value={settings.defaultExportFormat}
                  onChange={(e) => setSettings({ ...settings, defaultExportFormat: e.target.value as any })}
                >
                  <option value="html">Print-Ready HTML / Standalone PDF</option>
                  <option value="json">Structured JSON (API standard)</option>
                  <option value="csv">Findings Table CSV (Spreadsheet)</option>
                </select>
              </div>

              <div className="form-field form-field-checkbox">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.includeAiInExport}
                    onChange={(e) => setSettings({ ...settings, includeAiInExport: e.target.checked })}
                  />
                  <div>
                    <strong>Include AI Recommendations in Exports</strong>
                    <small>Append executive summary and action items to exported reports</small>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Storage & Maintenance */}
      {activeTab === "storage" && (
        <div className="settings-section">
          <div className="section-label">
            <span className="eyebrow-line" />
            LOCAL DATA, CACHES & MAINTENANCE
          </div>

          <div className="storage-card">
            <div className="storage-row">
              <div className="storage-info">
                <strong>Export System Diagnostic Snapshot</strong>
                <p>Download a JSON payload containing live system ping, API state, and config tokens for troubleshooting.</p>
              </div>
              <button className="storage-btn storage-btn-export" onClick={handleExportDiagnostics}>
                <Download size={14} />
                <span>DOWNLOAD LOG</span>
              </button>
            </div>

            <div className="storage-row">
              <div className="storage-info">
                <strong>Clear Local Application Cache</strong>
                <p>Purges cached view preferences and stored filters from browser localStorage.</p>
              </div>
              <button className="storage-btn storage-btn-warn" onClick={handleClearCache}>
                <Trash2 size={14} />
                <span>CLEAR CACHE</span>
              </button>
            </div>

            <div className="storage-row">
              <div className="storage-info">
                <strong>Restore Platform Defaults</strong>
                <p>Resets all crawler settings, audit thresholds, and branding options to system baseline.</p>
              </div>
              <button className="storage-btn storage-btn-neutral" onClick={handleResetDefaults}>
                <RotateCw size={14} />
                <span>RESET DEFAULTS</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
