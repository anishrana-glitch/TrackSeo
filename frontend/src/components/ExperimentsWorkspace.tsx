import { useState, useEffect, useCallback } from "react";
import {
  listExperiments,
  createExperiment,
  recordExperimentVariant,
  deleteExperiment,
  runSeoAudit,
  type ExperimentItem,
  type ExperimentStats,
  type ExperimentCategory,
  type SeoAuditResult
} from "../services/api";
import {
  FlaskConical,
  Plus,
  RotateCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  ExternalLink,
  Zap,
  Globe2,
  Tag,
  Loader2,
  X,
  Sparkles
} from "lucide-react";
import "./ExperimentsWorkspace.css";

interface ExperimentsWorkspaceProps {
  currentAudit?: SeoAuditResult | null;
  onNavigateToAudit?: (url: string) => void;
}

const CATEGORIES: Array<{ key: ExperimentCategory; label: string }> = [
  { key: "title_tag", label: "Title Tag" },
  { key: "meta_description", label: "Meta Description" },
  { key: "headings_structure", label: "Headings Structure" },
  { key: "schema_markup", label: "Schema / Structured Data" },
  { key: "internal_linking", label: "Internal Linking" },
  { key: "cwv_performance", label: "CWV / Performance" },
  { key: "content_revamp", label: "Content Revamp" },
  { key: "other", label: "Other" }
];

export default function ExperimentsWorkspace({
  currentAudit,
  onNavigateToAudit
}: ExperimentsWorkspaceProps) {
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [stats, setStats] = useState<ExperimentStats>({
    total: 0,
    active: 0,
    completed: 0,
    wins: 0,
    winRate: 0
  });

  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [runningVariantId, setRunningVariantId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // New experiment form state
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState(currentAudit?.url || "");
  const [newCategory, setNewCategory] = useState<ExperimentCategory>("title_tag");
  const [newHypothesis, setNewHypothesis] = useState("");
  const [isAuditingBaseline, setIsAuditingBaseline] = useState(false);
  const [baselineData, setBaselineData] = useState<SeoAuditResult | null>(
    currentAudit && currentAudit.url === newUrl ? currentAudit : null
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorNotice(null);
    try {
      const res = await listExperiments({
        status: statusFilter,
        search: searchQuery
      });
      setExperiments(res.items);
      setStats(res.stats);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Failed to load experiments.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle fetching baseline audit if not already present
  const handleFetchBaseline = async () => {
    if (!newUrl.trim()) {
      setErrorNotice("Enter a target URL first.");
      return;
    }
    setIsAuditingBaseline(true);
    setErrorNotice(null);
    try {
      const audit = await runSeoAudit(newUrl.trim());
      setBaselineData(audit);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Failed to run baseline audit.");
    } finally {
      setIsAuditingBaseline(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setErrorNotice("Enter an experiment title.");
      return;
    }
    if (!newUrl.trim()) {
      setErrorNotice("Enter a target URL.");
      return;
    }
    if (!newHypothesis.trim()) {
      setErrorNotice("Enter a hypothesis description.");
      return;
    }

    let baseline = baselineData;
    if (!baseline || baseline.url !== newUrl.trim()) {
      setIsAuditingBaseline(true);
      try {
        baseline = await runSeoAudit(newUrl.trim());
        setBaselineData(baseline);
      } catch (err) {
        setErrorNotice(err instanceof Error ? err.message : "Failed to audit baseline URL.");
        setIsAuditingBaseline(false);
        return;
      }
      setIsAuditingBaseline(false);
    }

    const passCount = baseline.findings.filter((f) => f.status === "pass").length;
    const warnCount = baseline.findings.filter((f) => f.status === "warning").length;
    const infoCount = baseline.findings.filter((f) => f.status === "info").length;

    try {
      await createExperiment({
        title: newTitle.trim(),
        targetUrl: newUrl.trim(),
        hypothesis: newHypothesis.trim(),
        category: newCategory,
        baseline: {
          auditId: baseline.auditId,
          capturedAt: new Date().toISOString(),
          healthScore: baseline.healthScore ?? 75,
          findingsSummary: {
            pass: passCount,
            warning: warnCount,
            info: infoCount
          },
          pageTitle: baseline.pageTitle,
          metaDescription: baseline.metaDescription,
          h1Count: baseline.headings?.h1 ?? 0,
          estimatedFcpMs: baseline.technicalDetails?.performance?.estimatedFcpMs ?? 300
        }
      });

      setIsCreating(false);
      setNewTitle("");
      setNewHypothesis("");
      void loadData();
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Failed to create experiment.");
    }
  };

  const handleRunVariant = async (exp: ExperimentItem) => {
    setRunningVariantId(exp.experimentId);
    setErrorNotice(null);

    try {
      const freshAudit = await runSeoAudit(exp.targetUrl);
      const passCount = freshAudit.findings.filter((f) => f.status === "pass").length;
      const warnCount = freshAudit.findings.filter((f) => f.status === "warning").length;
      const infoCount = freshAudit.findings.filter((f) => f.status === "info").length;

      await recordExperimentVariant(exp.experimentId, {
        auditId: freshAudit.auditId,
        capturedAt: new Date().toISOString(),
        healthScore: freshAudit.healthScore ?? 75,
        findingsSummary: {
          pass: passCount,
          warning: warnCount,
          info: infoCount
        },
        pageTitle: freshAudit.pageTitle,
        metaDescription: freshAudit.metaDescription,
        h1Count: freshAudit.headings?.h1 ?? 0,
        estimatedFcpMs: freshAudit.technicalDetails?.performance?.estimatedFcpMs ?? 300
      });

      void loadData();
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Failed to run variant comparison.");
    } finally {
      setRunningVariantId(null);
    }
  };

  const handleDelete = async (experimentId: string) => {
    if (!window.confirm("Are you sure you want to delete this experiment?")) return;
    try {
      await deleteExperiment(experimentId);
      void loadData();
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : "Failed to delete experiment.");
    }
  };

  return (
    <div className="experiments-workspace" aria-label="SEO Experiments Workspace">
      {/* Workspace Header */}
      <div className="exp-header">
        <div>
          <div className="section-index">01 / HYPOTHESIS LAB</div>
          <h2 className="exp-title">
            <FlaskConical size={22} className="title-icon" />
            SEO Experiments & Hypothesis Testing
          </h2>
          <p className="exp-subtitle">
            Formulate targeted SEO hypotheses, record baseline health scores, deploy on-page changes, and verify empirical ranking signals over time.
          </p>
        </div>

        <div className="exp-header-actions">
          <button
            className="new-exp-btn"
            onClick={() => {
              setIsCreating(true);
              if (currentAudit?.url && !newUrl) {
                setNewUrl(currentAudit.url);
                setBaselineData(currentAudit);
              }
            }}
          >
            <Plus size={16} />
            <span>NEW HYPOTHESIS</span>
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="exp-metrics-strip">
        <div className="exp-metric-card">
          <span className="exp-metric-label">TOTAL TESTS</span>
          <div className="exp-metric-val">{stats.total}</div>
          <small>Formulated hypotheses</small>
        </div>
        <div className="exp-metric-card">
          <span className="exp-metric-label">ACTIVE TRIALS</span>
          <div className="exp-metric-val val-lime">{stats.active}</div>
          <small>Awaiting variant audits</small>
        </div>
        <div className="exp-metric-card">
          <span className="exp-metric-label">WIN RATE</span>
          <div className="exp-metric-val val-cyan">{stats.winRate}%</div>
          <small>{stats.wins} verified positive outcomes</small>
        </div>
        <div className="exp-metric-card">
          <span className="exp-metric-label">COMPLETED</span>
          <div className="exp-metric-val">{stats.completed}</div>
          <small>Verified A/B conclusions</small>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="exp-toolbar">
        <div className="exp-status-filters">
          {[
            { key: "all", label: "ALL" },
            { key: "active", label: "ACTIVE" },
            { key: "completed", label: "COMPLETED" },
            { key: "draft", label: "DRAFT" }
          ].map((tab) => (
            <button
              key={tab.key}
              className={`exp-filter-tab ${statusFilter === tab.key ? "active" : ""}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="exp-search-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search experiments by URL or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="exp-refresh-btn" onClick={() => void loadData()} title="Refresh list">
            <RotateCw size={14} className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {errorNotice && (
        <div className="exp-notice exp-notice--error">
          <AlertTriangle size={15} />
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice(null)}><X size={14} /></button>
        </div>
      )}

      {/* Creation Modal / Drawer */}
      {isCreating && (
        <div className="exp-modal-overlay">
          <div className="exp-modal-card">
            <div className="exp-modal-header">
              <div className="modal-title-wrap">
                <FlaskConical size={18} />
                <strong>FORMULATE NEW SEO HYPOTHESIS</strong>
              </div>
              <button className="modal-close-btn" onClick={() => setIsCreating(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="exp-modal-form">
              <div className="form-field">
                <label>TEST TITLE</label>
                <input
                  type="text"
                  placeholder="e.g. Optimize H1 and Meta Description for High-Intent Keywords"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-field flex-2">
                  <label>TARGET URL</label>
                  <div className="input-with-action">
                    <input
                      type="text"
                      placeholder="https://example.com/page"
                      value={newUrl}
                      onChange={(e) => {
                        setNewUrl(e.target.value);
                        setBaselineData(null);
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="inline-audit-btn"
                      onClick={handleFetchBaseline}
                      disabled={isAuditingBaseline}
                    >
                      {isAuditingBaseline ? (
                        <>
                          <Loader2 size={13} className="spin" />
                          <span>AUDITING...</span>
                        </>
                      ) : (
                        <span>CAPTURE BASELINE</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="form-field flex-1">
                  <label>CATEGORY</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ExperimentCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label>HYPOTHESIS & INTENDED IMPACT</label>
                <textarea
                  placeholder="e.g. By introducing targeted semantic keywords into the H1 and refining meta description lengths, we expect to resolve structural warnings, boost click-through rates, and raise overall health score by +10 points."
                  value={newHypothesis}
                  onChange={(e) => setNewHypothesis(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              {/* Baseline Preview */}
              <div className="baseline-preview-card">
                <div className="baseline-preview-header">
                  <span>BASELINE SNAPSHOT</span>
                  {baselineData ? (
                    <span className="baseline-ready-pill">
                      <CheckCircle2 size={12} /> READY (HEALTH: {baselineData.healthScore ?? 75}/100)
                    </span>
                  ) : (
                    <span className="baseline-pending-pill">
                      <AlertTriangle size={12} /> WILL BE AUDITED ON SUBMIT
                    </span>
                  )}
                </div>
                {baselineData && (
                  <div className="baseline-metrics-grid">
                    <div>
                      <small>PAGE TITLE</small>
                      <strong>{baselineData.pageTitle || "None"}</strong>
                    </div>
                    <div>
                      <small>H1 COUNT</small>
                      <strong>{baselineData.headings?.h1 ?? 0}</strong>
                    </div>
                    <div>
                      <small>WARNINGS</small>
                      <strong>
                        {baselineData.findings.filter((f) => f.status === "warning").length}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsCreating(false)}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={isAuditingBaseline}
                >
                  <Sparkles size={14} />
                  <span>INITIALIZE EXPERIMENT</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Experiments List */}
      <div className="experiments-list">
        {experiments.length === 0 && !isLoading && (
          <div className="empty-experiments-card">
            <FlaskConical size={32} />
            <h3>No experiments recorded.</h3>
            <p>
              Formulate your first SEO hypothesis to track baseline signals, test variants, and calculate verifiable wins.
            </p>
            <button
              className="new-exp-btn"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={15} />
              <span>CREATE FIRST HYPOTHESIS</span>
            </button>
          </div>
        )}

        {experiments.map((exp) => {
          const delta = exp.delta;
          const isWin = delta?.verdict === "win";
          const isLoss = delta?.verdict === "loss";

          return (
            <article key={exp.experimentId} className="exp-card">
              <div className="exp-card-header">
                <div className="exp-card-left">
                  <div className="exp-category-pill">
                    <Tag size={11} />
                    <span>{exp.category.replace("_", " ").toUpperCase()}</span>
                  </div>
                  <h3 className="exp-card-title">{exp.title}</h3>
                  <a
                    href={exp.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="exp-url-link"
                  >
                    <Globe2 size={12} />
                    <span>{exp.targetUrl}</span>
                    <ExternalLink size={11} />
                  </a>
                </div>

                <div className="exp-card-badges">
                  {delta?.verdict && delta.verdict !== "pending" && (
                    <span
                      className={`verdict-pill ${
                        isWin ? "verdict-win" : isLoss ? "verdict-loss" : "verdict-neutral"
                      }`}
                    >
                      {isWin ? <TrendingUp size={13} /> : isLoss ? <TrendingDown size={13} /> : <Minus size={13} />}
                      <span>{delta.verdict.toUpperCase()}</span>
                    </span>
                  )}
                  <span className={`status-tag status-tag--${exp.status}`}>
                    {exp.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Hypothesis statement */}
              <div className="exp-hypothesis-box">
                <span className="hypothesis-label">HYPOTHESIS:</span>
                <p>{exp.hypothesis}</p>
              </div>

              {/* Baseline vs Variant Comparison */}
              <div className="comparison-container">
                {/* Baseline Column */}
                <div className="comparison-col">
                  <div className="col-label">01 / BASELINE</div>
                  <div className="col-score">
                    <span className="score-val">{exp.baseline.healthScore}</span>
                    <span className="score-max">/ 100</span>
                  </div>
                  <div className="col-details">
                    <div>
                      <span>Warnings:</span> <strong>{exp.baseline.findingsSummary.warning}</strong>
                    </div>
                    <div>
                      <span>H1 Headings:</span> <strong>{exp.baseline.h1Count ?? 0}</strong>
                    </div>
                    <div>
                      <span>Est. FCP:</span>{" "}
                      <strong>{exp.baseline.estimatedFcpMs ? `${exp.baseline.estimatedFcpMs} ms` : "—"}</strong>
                    </div>
                    <div className="col-date">
                      {new Date(exp.baseline.capturedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Delta / Diff Column */}
                <div className="comparison-diff-col">
                  <ArrowRight size={18} className="diff-arrow" />
                  {exp.variant && delta ? (
                    <div className="diff-badges">
                      <div
                        className={`diff-metric ${(delta.scoreDiff || 0) > 0 ? "metric-plus" : (delta.scoreDiff || 0) < 0 ? "metric-minus" : ""}`}
                      >
                        {(delta.scoreDiff || 0) > 0 ? `+${delta.scoreDiff}` : delta.scoreDiff} Score
                      </div>
                      <div
                        className={`diff-metric ${(delta.warningDiff || 0) < 0 ? "metric-plus" : (delta.warningDiff || 0) > 0 ? "metric-minus" : ""}`}
                      >
                        {(delta.warningDiff || 0) > 0 ? `+${delta.warningDiff}` : delta.warningDiff} Warns
                      </div>
                    </div>
                  ) : (
                    <span className="diff-pending">PENDING VARIANT</span>
                  )}
                </div>

                {/* Variant Column */}
                <div className="comparison-col comparison-col--variant">
                  <div className="col-label">02 / VARIANT TRIAL</div>
                  {exp.variant ? (
                    <>
                      <div className="col-score">
                        <span className="score-val">{exp.variant.healthScore}</span>
                        <span className="score-max">/ 100</span>
                      </div>
                      <div className="col-details">
                        <div>
                          <span>Warnings:</span> <strong>{exp.variant.findingsSummary.warning}</strong>
                        </div>
                        <div>
                          <span>H1 Headings:</span> <strong>{exp.variant.h1Count ?? 0}</strong>
                        </div>
                        <div>
                          <span>Est. FCP:</span>{" "}
                          <strong>{exp.variant.estimatedFcpMs ? `${exp.variant.estimatedFcpMs} ms` : "—"}</strong>
                        </div>
                        <div className="col-date">
                          {new Date(exp.variant.capturedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="variant-placeholder">
                      <p>Deploy your changes to the live site, then audit to measure impact.</p>
                      <button
                        className="run-variant-btn"
                        onClick={() => void handleRunVariant(exp)}
                        disabled={runningVariantId === exp.experimentId}
                      >
                        {runningVariantId === exp.experimentId ? (
                          <>
                            <Loader2 size={14} className="spin" />
                            <span>ANALYZING VARIANT...</span>
                          </>
                        ) : (
                          <>
                            <Zap size={14} />
                            <span>RUN VARIANT AUDIT</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="exp-card-footer">
                <div className="card-footer-left">
                  <span>ID: {exp.experimentId}</span>
                  <span>•</span>
                  <span>Created {new Date(exp.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="card-footer-right">
                  {onNavigateToAudit && (
                    <button
                      className="footer-action-link"
                      onClick={() => onNavigateToAudit(exp.targetUrl)}
                      title="Inspect URL in Site Audits"
                    >
                      <ExternalLink size={12} />
                      <span>INSPECT AUDIT</span>
                    </button>
                  )}
                  <button
                    className="footer-del-btn"
                    onClick={() => void handleDelete(exp.experimentId)}
                    title="Delete experiment"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
