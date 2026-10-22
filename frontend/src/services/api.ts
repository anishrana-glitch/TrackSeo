export interface ApiHealthResponse {
  success: boolean;
  message: string;
  data: {
    service: string;
    status: string;
    version: string;
    timestamp: string;
    database?: {
      status: "connected" | "disconnected" | "connecting" | "not_configured";
      dbName?: string;
      host?: string;
      connectedAt?: string;
      error?: string;
    };
    integrations?: {
      gemini?: {
        configured: boolean;
      };
    };
  };
}

export async function checkApiHealth(): Promise<ApiHealthResponse> {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  return (await response.json()) as ApiHealthResponse;
}

export interface SeoFinding {
  id: string;
  status: "pass" | "warning" | "info";
  title: string;
  details: string;
}

export interface TechnicalDetails {
  openGraph?: {
    title?: string | null;
    description?: string | null;
    image?: string | null;
    url?: string | null;
    type?: string | null;
  };
  twitterCard?: {
    card?: string | null;
    title?: string | null;
    description?: string | null;
    image?: string | null;
  };
  structuredData?: {
    count: number;
    types: string[];
  };
  signals?: {
    viewport: boolean;
    charset: string | null;
    domNodes: number;
    htmlSizeBytes: number;
    scriptsCount: number;
    stylesheetsCount: number;
    imagesMissingDimensions: number;
  };
  performance?: {
    score: number;
    estimatedFcpMs: number;
    estimatedLcpMs: number;
    clsRisk: "low" | "medium" | "high";
  };
  discovery?: {
    robotsTxtFound: boolean;
    robotsTxtUrl?: string | null;
    sitemapFound: boolean;
    sitemapUrl?: string | null;
  };
  healthScore?: number;
}

export interface SeoAuditResult {
  auditId?: string;
  storage?: "mongodb" | "memory";
  url: string;
  statusCode: number;
  auditedAt: string;
  pageTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: {
    h1: number;
    h2: number;
    h3: number;
  };
  imageCount: number;
  imagesMissingAlt: number;
  noindex: boolean;
  findings: SeoFinding[];
  healthScore?: number;
  technicalDetails?: TechnicalDetails;
}

export interface SeoAuditResponse {
  success: boolean;
  message: string;
  data: SeoAuditResult;
}

export async function runSeoAudit(
  url: string
): Promise<SeoAuditResult> {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });

  const result = (await response.json()) as SeoAuditResponse;

  if (!response.ok || !result.success) {
    throw new Error(result.message || "SEO audit failed.");
  }

  return result.data;
}

export async function exportAuditReport(
  auditId: string,
  format: "json" | "csv" | "html"
): Promise<Blob> {
  const response = await fetch(`/api/audit/${auditId}/export?format=${format}`);
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status})`);
  }
  return await response.blob();
}

export async function exportAuditAdHoc(
  auditResult: SeoAuditResult,
  format: "json" | "csv" | "html",
  aiAnalysis?: unknown
): Promise<Blob> {
  const response = await fetch("/api/audit/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auditResult, format, aiAnalysis })
  });
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status})`);
  }
  return await response.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export interface AuditHistoryItem {
  auditId: string;
  submittedUrl: string;
  normalizedUrl: string;
  statusCode: number;
  pageTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: {
    h1: number;
    h2: number;
    h3: number;
  };
  imageCount: number;
  imagesMissingAlt: number;
  noindex: boolean;
  findings: SeoFinding[];
  healthScore?: number;
  technicalDetails?: TechnicalDetails;
  summary: {
    pass: number;
    warning: number;
    info: number;
  };
  processingStatus: "completed" | "failed";
  createdAt: string;
  storage: "mongodb" | "memory";
}

export interface AuditHistoryResult {
  items: AuditHistoryItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  source: "mongodb" | "memory";
}

interface AuditHistoryApiResponse {
  success: boolean;
  data: AuditHistoryResult;
}

export async function getAuditHistory(options?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<AuditHistoryResult> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.search) params.set("search", options.search);

  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/audit/history${query}`);

  if (!response.ok) {
    throw new Error(`Failed to load history (HTTP ${response.status})`);
  }

  const result = (await response.json()) as AuditHistoryApiResponse;
  return result.data;
}

export async function deleteAuditRecord(auditId: string): Promise<void> {
  const response = await fetch(`/api/audit/history/${auditId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(`Failed to delete audit (HTTP ${response.status})`);
  }
}

// Stage D — Gemini AI Recommendation Types & Functions
export interface AiRecommendationItem {
  id: string;
  findingId?: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  effort: "quick_win" | "moderate" | "extensive";
  summary: string;
  technicalSteps: string[];
  codeSnippet?: string | null;
}

export interface ContentSuggestions {
  suggestedTitle?: string | null;
  suggestedDescription?: string | null;
}

export interface AiAuditAnalysis {
  executiveSummary: string;
  overallScoreEstimate: number;
  criticalIssuesCount: number;
  recommendations: AiRecommendationItem[];
  contentSuggestions?: ContentSuggestions;
  generatedAt: string;
  modelUsed: string;
}

export interface AiRecommendationsResponse {
  success: boolean;
  configured: boolean;
  message: string;
  data: AiAuditAnalysis | null;
}

export async function requestAiRecommendations(
  audit: SeoAuditResult
): Promise<AiRecommendationsResponse> {
  const response = await fetch("/api/audit/ai-recommendations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      auditId: audit.auditId,
      auditResult: audit
    })
  });

  return (await response.json()) as AiRecommendationsResponse;
}

// Stage E — Crawler & Browserbase Types & Functions
export interface CrawledPageItem {
  url: string;
  depth: number;
  statusCode: number;
  pageTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: {
    h1: number;
    h2: number;
    h3: number;
  };
  imageCount: number;
  imagesMissingAlt: number;
  noindex: boolean;
  linksFound: number;
  internalLinks: string[];
  externalLinks: string[];
  findings: SeoFinding[];
  crawledAt: string;
}

export interface CrawlJobItem {
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
  pages: CrawledPageItem[];
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
  storage: "mongodb" | "memory";
}

export interface BrowserbaseStatus {
  configured: boolean;
  projectId: string | null;
}

export async function fetchBrowserbaseStatus(): Promise<BrowserbaseStatus> {
  const response = await fetch("/api/crawl/browserbase/status");
  if (!response.ok) {
    throw new Error(`Failed to check Browserbase status (HTTP ${response.status})`);
  }
  const result = await response.json();
  return result.data;
}

export async function startCrawl(
  url: string,
  options?: {
    maxPages?: number;
    maxDepth?: number;
    timeoutSeconds?: number;
    useBrowserbase?: boolean;
  }
): Promise<CrawlJobItem> {
  const response = await fetch("/api/crawl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url, ...options })
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to start crawl.");
  }
  return result.data;
}

export async function getCrawlStatus(jobId: string): Promise<CrawlJobItem> {
  const response = await fetch(`/api/crawl/${jobId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch crawl job (HTTP ${response.status})`);
  }
  const result = await response.json();
  return result.data;
}

export async function listCrawls(limit = 10): Promise<CrawlJobItem[]> {
  const response = await fetch(`/api/crawl?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to list crawl jobs (HTTP ${response.status})`);
  }
  const result = await response.json();
  return result.data;
}

export async function cancelCrawl(jobId: string): Promise<void> {
  const response = await fetch(`/api/crawl/${jobId}/cancel`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Failed to cancel crawl job (HTTP ${response.status})`);
  }
}

// Stage H: SEO Experiments & Hypothesis Testing Types
export type ExperimentCategory =
  | "title_tag"
  | "meta_description"
  | "headings_structure"
  | "schema_markup"
  | "internal_linking"
  | "cwv_performance"
  | "content_revamp"
  | "other";

export type ExperimentStatus = "draft" | "active" | "completed" | "inconclusive";
export type ExperimentVerdict = "win" | "loss" | "neutral" | "pending";

export interface ExperimentSnapshot {
  auditId?: string;
  capturedAt: string;
  healthScore: number;
  findingsSummary: {
    pass: number;
    warning: number;
    info: number;
  };
  pageTitle?: string | null;
  metaDescription?: string | null;
  h1Count?: number;
  estimatedFcpMs?: number;
}

export interface ExperimentDelta {
  scoreDiff?: number;
  warningDiff?: number;
  fcpDiffMs?: number;
  verdict?: ExperimentVerdict;
}

export interface ExperimentItem {
  experimentId: string;
  title: string;
  targetUrl: string;
  hypothesis: string;
  category: ExperimentCategory;
  status: ExperimentStatus;
  baseline: ExperimentSnapshot;
  variant?: ExperimentSnapshot | null;
  delta?: ExperimentDelta;
  notes?: string;
  conclusion?: string | null;
  createdAt: string;
  updatedAt: string;
  storage: "mongodb" | "memory";
}

export interface ExperimentStats {
  total: number;
  active: number;
  completed: number;
  wins: number;
  winRate: number;
}

export interface ListExperimentsResponse {
  items: ExperimentItem[];
  stats: ExperimentStats;
}

export async function listExperiments(options?: {
  status?: string;
  search?: string;
  limit?: number;
}): Promise<ListExperimentsResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.search) params.set("search", options.search);
  if (options?.limit) params.set("limit", String(options.limit));

  const url = `/api/experiments${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to list experiments (HTTP ${response.status})`);
  }
  const result = await response.json();
  return result.data;
}

export async function createExperiment(data: {
  title: string;
  targetUrl: string;
  hypothesis: string;
  category: ExperimentCategory;
  baseline: ExperimentSnapshot;
  notes?: string;
}): Promise<ExperimentItem> {
  const response = await fetch("/api/experiments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to create experiment.");
  }
  return result.data;
}

export async function getExperiment(experimentId: string): Promise<ExperimentItem> {
  const response = await fetch(`/api/experiments/${experimentId}`);
  if (!response.ok) {
    throw new Error(`Failed to get experiment (HTTP ${response.status})`);
  }
  const result = await response.json();
  return result.data;
}

export async function updateExperiment(
  experimentId: string,
  updates: {
    title?: string;
    hypothesis?: string;
    status?: ExperimentStatus;
    notes?: string;
    conclusion?: string;
  }
): Promise<ExperimentItem> {
  const response = await fetch(`/api/experiments/${experimentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update experiment.");
  }
  return result.data;
}

export async function recordExperimentVariant(
  experimentId: string,
  variant: ExperimentSnapshot
): Promise<ExperimentItem> {
  const response = await fetch(`/api/experiments/${experimentId}/variant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant })
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to record variant.");
  }
  return result.data;
}

export async function deleteExperiment(experimentId: string): Promise<void> {
  const response = await fetch(`/api/experiments/${experimentId}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`Failed to delete experiment (HTTP ${response.status})`);
  }
}