export interface ExportAuditData {
  auditId?: string;
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
  findings: Array<{
    id: string;
    status: "pass" | "warning" | "info";
    title: string;
    details: string;
  }>;
  healthScore?: number;
  technicalDetails?: {
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
  };
  aiAnalysis?: {
    executiveSummary?: string;
    overallHealthAssessment?: string;
    criticalIssuesCount?: number;
    recommendations?: Array<{
      category: string;
      priority: string;
      title: string;
      explanation: string;
      suggestedFix: string;
    }>;
  } | null;
}

export class ExportService {
  /**
   * Generates a clean, formatted JSON export.
   */
  generateJson(audit: ExportAuditData): string {
    return JSON.stringify(
      {
        generator: "TrackSeo Intelligence Platform",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        audit
      },
      null,
      2
    );
  }

  /**
   * Generates a CSV export of all findings and AI recommendations.
   */
  generateCsv(audit: ExportAuditData): string {
    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows: string[] = [];

    // Header info rows
    rows.push(["TRACKSEO AUDIT REPORT", escapeCsv(audit.url)].join(","));
    rows.push(["Audited At", escapeCsv(audit.auditedAt)].join(","));
    rows.push(["HTTP Status", escapeCsv(audit.statusCode)].join(","));
    if (audit.healthScore !== undefined) {
      rows.push(["Overall Health Score", escapeCsv(`${audit.healthScore}/100`)].join(","));
    }
    rows.push(""); // blank line

    // Section 1: Findings Table
    rows.push(escapeCsv("FINDINGS TABLE"));
    rows.push(["Finding ID", "Status", "Title", "Details"].map(escapeCsv).join(","));

    for (const f of audit.findings) {
      rows.push([f.id, f.status.toUpperCase(), f.title, f.details].map(escapeCsv).join(","));
    }

    // Section 2: AI Recommendations if available
    if (audit.aiAnalysis?.recommendations && audit.aiAnalysis.recommendations.length > 0) {
      rows.push("");
      rows.push(escapeCsv("AI RECOMMENDATIONS"));
      rows.push(["Priority", "Category", "Action Title", "Explanation", "Suggested Fix"].map(escapeCsv).join(","));

      for (const rec of audit.aiAnalysis.recommendations) {
        rows.push([rec.priority, rec.category, rec.title, rec.explanation, rec.suggestedFix].map(escapeCsv).join(","));
      }
    }

    return rows.join("\r\n");
  }

  /**
   * Generates a self-contained, printable HTML report with print-optimized styling.
   */
  generateHtml(audit: ExportAuditData): string {
    const findingsHtml = audit.findings
      .map(
        (f) => `
        <tr class="finding-row finding-${f.status}">
          <td class="badge-cell"><span class="status-badge status-${f.status}">${f.status.toUpperCase()}</span></td>
          <td class="title-cell"><strong>${escapeHtml(f.title)}</strong></td>
          <td class="details-cell">${escapeHtml(f.details)}</td>
        </tr>`
      )
      .join("\n");

    const aiHtml = audit.aiAnalysis?.recommendations
      ? `
      <section class="report-section ai-section">
        <h2>03 / AI RECOMMENDATIONS (${audit.aiAnalysis.recommendations.length})</h2>
        <p class="summary-lead">${escapeHtml(audit.aiAnalysis.executiveSummary || "")}</p>
        <div class="recs-list">
          ${audit.aiAnalysis.recommendations
            .map(
              (r) => `
            <div class="rec-card priority-${r.priority.toLowerCase()}">
              <div class="rec-header">
                <span class="p-badge">${escapeHtml(r.priority)}</span>
                <span class="cat-badge">${escapeHtml(r.category)}</span>
                <strong>${escapeHtml(r.title)}</strong>
              </div>
              <p class="rec-expl">${escapeHtml(r.explanation)}</p>
              ${r.suggestedFix ? `<pre class="code-fix"><code>${escapeHtml(r.suggestedFix)}</code></pre>` : ""}
            </div>`
            )
            .join("\n")}
        </div>
      </section>`
      : "";

    const tech = audit.technicalDetails;
    const og = tech?.openGraph;
    const cw = tech?.performance;
    const disc = tech?.discovery;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TrackSeo Audit Report — ${escapeHtml(audit.url)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;600;700&display=swap');
    
    :root {
      --bg: #0d0f15;
      --card-bg: #141824;
      --border: #242c3f;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --lime: #c7ff38;
      --coral: #ff5555;
      --amber: #ffb84d;
      --cyan: #38bdf8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, sans-serif;
      line-height: 1.5;
      padding: 32px 20px;
    }
    .report-wrap {
      max-width: 960px;
      margin: 0 auto;
    }
    header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand {
      font-family: 'IBM Plex Mono', monospace;
      font-weight: 700;
      letter-spacing: 0.1em;
      font-size: 20px;
      color: var(--lime);
    }
    .meta-lead {
      color: var(--text-muted);
      font-size: 13px;
      font-family: 'IBM Plex Mono', monospace;
      margin-top: 4px;
    }
    .score-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 32px;
      font-weight: 700;
      color: var(--lime);
      border: 2px solid var(--lime);
      padding: 4px 16px;
      background: rgba(199, 255, 56, 0.05);
    }
    .report-section {
      margin-bottom: 36px;
    }
    h2 {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 14px;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .overview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .overview-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 16px;
      font-family: 'IBM Plex Mono', monospace;
    }
    .overview-label {
      font-size: 11px;
      color: var(--text-muted);
      display: block;
      margin-bottom: 6px;
    }
    .overview-val {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      border: 1px solid var(--border);
      background: var(--card-bg);
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    th {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      background: #0f131c;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .status-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 2px;
      display: inline-block;
    }
    .status-pass { background: rgba(199,255,56,0.15); color: var(--lime); border: 1px solid var(--lime); }
    .status-warning { background: rgba(255,184,77,0.15); color: var(--amber); border: 1px solid var(--amber); }
    .status-info { background: rgba(56,189,248,0.15); color: var(--cyan); border: 1px solid var(--cyan); }
    .rec-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 16px;
      margin-bottom: 12px;
    }
    .rec-header {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
    }
    .p-badge {
      background: var(--coral);
      color: #000;
      font-weight: 700;
      font-size: 10px;
      padding: 2px 6px;
    }
    .cat-badge {
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 10px;
      padding: 2px 6px;
    }
    .code-fix {
      background: #0a0c12;
      border: 1px solid var(--border);
      padding: 10px;
      margin-top: 10px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      color: var(--lime);
      overflow-x: auto;
    }
    @media print {
      body { background: #fff !important; color: #000 !important; padding: 0; }
      .brand, .score-badge, .overview-val { color: #000 !important; }
      .overview-card, table, .rec-card { background: #fff !important; border-color: #ccc !important; }
      .code-fix { background: #f5f5f5 !important; color: #000 !important; }
      th { background: #eee !important; color: #333 !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-wrap">
    <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 10px;">
      <button onclick="window.print()" style="padding: 8px 16px; background: #c7ff38; border: none; font-family: 'IBM Plex Mono', monospace; font-weight: 700; cursor: pointer;">PRINT / SAVE PDF</button>
      <button onclick="window.close()" style="padding: 8px 16px; background: #242c3f; color: #fff; border: none; font-family: 'IBM Plex Mono', monospace; cursor: pointer;">CLOSE</button>
    </div>

    <header>
      <div>
        <div class="brand">TRACKSEO® INTELLIGENCE REPORT</div>
        <div class="meta-lead">TARGET: ${escapeHtml(audit.url)}</div>
        <div class="meta-lead">AUDITED: ${escapeHtml(audit.auditedAt)} | HTTP ${audit.statusCode}</div>
      </div>
      <div>
        <div class="score-badge">${audit.healthScore !== undefined ? audit.healthScore : 85}/100</div>
      </div>
    </header>

    <section class="report-section">
      <h2>01 / SIGNAL SUMMARY</h2>
      <div class="overview-grid">
        <div class="overview-card">
          <span class="overview-label">PAGE TITLE</span>
          <div class="overview-val" style="font-size:14px;">${escapeHtml(audit.pageTitle || "None")}</div>
        </div>
        <div class="overview-card">
          <span class="overview-label">HEADINGS (H1 / H2 / H3)</span>
          <div class="overview-val">${audit.headings.h1} / ${audit.headings.h2} / ${audit.headings.h3}</div>
        </div>
        <div class="overview-card">
          <span class="overview-label">IMAGES (TOTAL / NO ALT)</span>
          <div class="overview-val">${audit.imageCount} / ${audit.imagesMissingAlt}</div>
        </div>
        <div class="overview-card">
          <span class="overview-label">CORE WEB VITALS (EST. FCP)</span>
          <div class="overview-val">${cw?.estimatedFcpMs ? `${cw.estimatedFcpMs} ms` : "—"}</div>
        </div>
        <div class="overview-card">
          <span class="overview-label">OPENGRAPH READY</span>
          <div class="overview-val">${og?.title ? "CONFIGURED" : "MISSING"}</div>
        </div>
        <div class="overview-card">
          <span class="overview-label">ROBOTS.TXT / SITEMAP</span>
          <div class="overview-val">${disc?.robotsTxtFound ? "ROBOTS: YES" : "ROBOTS: NO"} | ${disc?.sitemapFound ? "MAP: YES" : "MAP: NO"}</div>
        </div>
      </div>
    </section>

    <section class="report-section">
      <h2>02 / DETERMINISTIC FINDINGS (${audit.findings.length})</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 100px;">Status</th>
            <th style="width: 220px;">Check Title</th>
            <th>Evidence & Diagnostics</th>
          </tr>
        </thead>
        <tbody>
          ${findingsHtml}
        </tbody>
      </table>
    </section>

    ${aiHtml}

    <footer style="margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
      <span>TRACKSEO® AUDIT ENGINE</span>
      <span>AUTOMATED TECHNICAL SEO & PERFORMANCE INTELLIGENCE</span>
    </footer>
  </div>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const exportService = new ExportService();
