import { useState } from "react";
import {
  type AiAuditAnalysis,
  type SeoAuditResult
} from "../services/api";
import {
  Sparkles,
  Zap,
  ShieldAlert,
  Copy,
  Check,
  Code2,
  ListOrdered,
  Bot,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import "./AiRecommendationsPanel.css";

interface AiRecommendationsPanelProps {
  auditResult: SeoAuditResult;
  aiAnalysis: AiAuditAnalysis | null;
  isConfigured: boolean;
  isLoading: boolean;
  errorMessage?: string | null;
  onGenerate: () => void;
}

export default function AiRecommendationsPanel({
  auditResult,
  aiAnalysis,
  isConfigured,
  isLoading,
  errorMessage,
  onGenerate
}: AiRecommendationsPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "#ff5555";
      case "high":
        return "#ffb84d";
      case "medium":
        return "#c7ff38";
      default:
        return "#6ee7b7";
    }
  };

  return (
    <section className="ai-panel" aria-label="AI Recommendations">
      <div className="ai-panel-header">
        <div className="ai-panel-header-left">
          <div className="section-index">02.B / AI INTELLIGENCE</div>
          <h3 className="ai-panel-title">
            <Bot size={20} className="ai-title-icon" />
            Gemini Diagnostic Intelligence
          </h3>
          <p className="ai-panel-subtitle">
            Algorithmic issue prioritization, fix blueprints, and search-visibility recommendations.
          </p>
        </div>

        <div className="ai-panel-header-right">
          {aiAnalysis && (
            <span className="ai-model-tag">
              MODEL: {aiAnalysis.modelUsed.toUpperCase()}
            </span>
          )}

          <button
            className="ai-generate-btn"
            onClick={onGenerate}
            disabled={isLoading}
          >
            <Sparkles size={14} className={isLoading ? "spin" : ""} />
            <span>
              {isLoading
                ? "ANALYZING..."
                : aiAnalysis
                ? "RE-GENERATE AI FIXES"
                : "GENERATE AI RECOMMENDATIONS"}
            </span>
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="ai-error-notice">
          <ShieldAlert size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* State 1: Not configured */}
      {!isConfigured && !aiAnalysis && !isLoading && (
        <div className="ai-unconfigured-card">
          <div className="unconfigured-badge">
            <span className="unconfigured-dot" />
            <span>AI NOT CONFIGURED</span>
          </div>
          <h4>Google Gemini API Key Required</h4>
          <p>
            Automated code-level remediations, impact vs. effort scoring, and content suggestions
            require a Google Gemini API key. TrackSeo connects exclusively to official Gemini models
            with prompt-injection safeguards.
          </p>
          <div className="unconfigured-steps">
            <div className="unconfigured-step">
              <span className="step-num">01</span>
              <span>Get an API key from Google AI Studio</span>
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ai-link"
              >
                aistudio.google.com <ExternalLink size={12} />
              </a>
            </div>
            <div className="unconfigured-step">
              <span className="step-num">02</span>
              <span>Add key to <code>backend/.env</code>:</span>
              <code className="env-sample">GEMINI_API_KEY=AIzaSy...</code>
            </div>
            <div className="unconfigured-step">
              <span className="step-num">03</span>
              <span>Save file — the backend reloads and activates AI immediately.</span>
            </div>
          </div>
        </div>
      )}

      {/* State 2: Loading */}
      {isLoading && (
        <div className="ai-loading-card">
          <Sparkles size={28} className="spin ai-spinner" />
          <strong>COMMUNING WITH GEMINI...</strong>
          <p>Evaluating verified findings against Google search algorithm standards for {auditResult.url}</p>
        </div>
      )}

      {/* State 3: Analysis Loaded */}
      {aiAnalysis && (
        <div className="ai-analysis-content">
          {/* Executive Summary */}
          <div className="ai-summary-card">
            <div className="ai-summary-top">
              <span className="ai-card-label">EXECUTIVE DIAGNOSIS</span>
              <div className="ai-score-pills">
                <span className="score-pill">
                  HEALTH SCORE: <strong>{aiAnalysis.overallScoreEstimate}/100</strong>
                </span>
                {aiAnalysis.criticalIssuesCount > 0 && (
                  <span className="critical-pill">
                    {aiAnalysis.criticalIssuesCount} CRITICAL BLOCKERS
                  </span>
                )}
              </div>
            </div>
            <p className="ai-executive-text">{aiAnalysis.executiveSummary}</p>
          </div>

          {/* Content Suggestions if provided */}
          {aiAnalysis.contentSuggestions &&
            (aiAnalysis.contentSuggestions.suggestedTitle ||
              aiAnalysis.contentSuggestions.suggestedDescription) && (
              <div className="ai-content-suggestions">
                <span className="ai-card-label">RECOMMENDED META COPY (SEARCH SNIPPET)</span>
                <div className="suggestions-grid">
                  {aiAnalysis.contentSuggestions.suggestedTitle && (
                    <div className="suggestion-box">
                      <div className="suggestion-header">
                        <span>RECOMMENDED TITLE</span>
                        <span className="char-badge">
                          {aiAnalysis.contentSuggestions.suggestedTitle.length} chars
                        </span>
                        <button
                          className="copy-mini-btn"
                          onClick={() =>
                            handleCopy(
                              "title",
                              aiAnalysis.contentSuggestions!.suggestedTitle!
                            )
                          }
                          title="Copy suggested title"
                        >
                          {copiedId === "title" ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedId === "title" ? "COPIED" : "COPY"}</span>
                        </button>
                      </div>
                      <div className="suggestion-value">
                        {aiAnalysis.contentSuggestions.suggestedTitle}
                      </div>
                    </div>
                  )}

                  {aiAnalysis.contentSuggestions.suggestedDescription && (
                    <div className="suggestion-box">
                      <div className="suggestion-header">
                        <span>RECOMMENDED META DESCRIPTION</span>
                        <span className="char-badge">
                          {aiAnalysis.contentSuggestions.suggestedDescription.length} chars
                        </span>
                        <button
                          className="copy-mini-btn"
                          onClick={() =>
                            handleCopy(
                              "desc",
                              aiAnalysis.contentSuggestions!.suggestedDescription!
                            )
                          }
                          title="Copy suggested description"
                        >
                          {copiedId === "desc" ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedId === "desc" ? "COPIED" : "COPY"}</span>
                        </button>
                      </div>
                      <div className="suggestion-value">
                        {aiAnalysis.contentSuggestions.suggestedDescription}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Prioritized Remediation List */}
          <div className="ai-recommendations-list">
            <span className="ai-card-label">ACTIONABLE REMEDIATION ROADMAP</span>
            {aiAnalysis.recommendations.map((rec, index) => {
              const isExpanded = expandedRecId === rec.id || (!expandedRecId && index === 0);

              return (
                <article
                  key={rec.id}
                  className={`rec-card rec-card--${rec.priority}`}
                  style={{ borderLeftColor: priorityColor(rec.priority) }}
                >
                  <div
                    className="rec-card-header"
                    onClick={() =>
                      setExpandedRecId(isExpanded ? "__none__" : rec.id)
                    }
                  >
                    <div className="rec-header-left">
                      <span
                        className="rec-priority-badge"
                        style={{ color: priorityColor(rec.priority), borderColor: priorityColor(rec.priority) }}
                      >
                        {rec.priority.toUpperCase()}
                      </span>
                      <span className="rec-effort-badge">
                        <Zap size={11} />
                        {rec.effort.replace("_", " ").toUpperCase()}
                      </span>
                      <h4 className="rec-title">{rec.title}</h4>
                    </div>

                    <div className="rec-header-right">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  <p className="rec-summary">{rec.summary}</p>

                  {isExpanded && (
                    <div className="rec-details-expanded">
                      {/* Step-by-step Technical Plan */}
                      {rec.technicalSteps && rec.technicalSteps.length > 0 && (
                        <div className="rec-steps-box">
                          <div className="rec-subhead">
                            <ListOrdered size={14} />
                            <span>DEVELOPER IMPLEMENTATION STEPS</span>
                          </div>
                          <ol className="rec-steps-list">
                            {rec.technicalSteps.map((step, sIdx) => (
                              <li key={sIdx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Code Snippet Fix */}
                      {rec.codeSnippet && (
                        <div className="rec-code-box">
                          <div className="rec-code-header">
                            <div className="rec-subhead">
                              <Code2 size={14} />
                              <span>CODE REMEDIATION</span>
                            </div>
                            <button
                              className="copy-mini-btn"
                              onClick={() => handleCopy(rec.id, rec.codeSnippet!)}
                            >
                              {copiedId === rec.id ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedId === rec.id ? "COPIED" : "COPY CODE"}</span>
                            </button>
                          </div>
                          <pre className="rec-code-snippet">
                            <code>{rec.codeSnippet}</code>
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
