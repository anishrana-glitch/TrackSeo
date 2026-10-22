import { useState, useEffect, useCallback } from "react";
import {
  getAuditHistory,
  deleteAuditRecord,
  type AuditHistoryItem,
  type AuditHistoryResult
} from "../services/api";
import {
  Search,
  RotateCw,
  ExternalLink,
  Trash2,
  Database,
  Layers,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles
} from "lucide-react";
import "./AuditHistory.css";

interface AuditHistoryProps {
  onSelectAudit: (item: AuditHistoryItem) => void;
  onReAudit: (url: string) => void;
  refreshTrigger: number;
}

export default function AuditHistory({
  onSelectAudit,
  onReAudit,
  refreshTrigger
}: AuditHistoryProps) {
  const [historyData, setHistoryData] = useState<AuditHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const loadHistory = useCallback(async (targetPage = 1, searchQuery = "") => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditHistory({
        page: targetPage,
        limit: 8,
        search: searchQuery
      });
      setHistoryData(data);
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(1, search);
  }, [loadHistory, refreshTrigger]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadHistory(1, search);
  };

  const handleDelete = async (e: React.MouseEvent, auditId: string) => {
    e.stopPropagation();
    try {
      await deleteAuditRecord(auditId);
      void loadHistory(page, search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const formatRelativeTime = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(isoString).toLocaleDateString();
  };

  return (
    <section className="audit-history-panel" aria-label="Investigation History">
      <div className="history-header">
        <div>
          <div className="section-index">03 / AUDIT REGISTRY</div>
          <h2 className="history-title">Historical Investigations</h2>
          <p className="history-subtitle">
            Inspect previous technical audits, track issue resolution, or re-run tests.
          </p>
        </div>

        <div className="history-top-meta">
          {historyData && (
            <span
              className={`storage-source-badge storage-source-badge--${historyData.source}`}
              title={
                historyData.source === "mongodb"
                  ? "Stored persistently in MongoDB Atlas cluster"
                  : "Stored in server session memory (MONGODB_URI not configured)"
              }
            >
              {historyData.source === "mongodb" ? (
                <Database size={13} />
              ) : (
                <Layers size={13} />
              )}
              <span>STORAGE: {historyData.source === "mongodb" ? "MONGODB ATLAS" : "SESSION MEMORY"}</span>
            </span>
          )}

          <button
            className="history-refresh-btn"
            onClick={() => void loadHistory(page, search)}
            aria-label="Refresh audit history"
            disabled={loading}
          >
            <RotateCw size={14} className={loading ? "spin" : ""} />
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <form className="history-search-bar" onSubmit={handleSearchSubmit}>
        <div className="history-search-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by domain, URL, or page title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="history-search-input"
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setSearch("");
                void loadHistory(1, "");
              }}
            >
              CLEAR
            </button>
          )}
        </div>
        <button type="submit" className="history-search-btn" disabled={loading}>
          FILTER
        </button>
      </form>

      {error && <div className="history-error-banner">{error}</div>}

      {/* History Items List */}
      <div className="history-content">
        {loading && !historyData ? (
          <div className="history-loading-placeholder">
            <RotateCw size={24} className="spin" />
            <span>LOADING AUDIT RECORDS...</span>
          </div>
        ) : !historyData || historyData.items.length === 0 ? (
          <div className="history-empty-state">
            <Sparkles size={28} />
            <strong>NO AUDIT RECORDS FOUND</strong>
            <p>
              {search
                ? `No past audits match "${search}". Try clearing your filter.`
                : "Submit a website URL above to generate and persist your first technical investigation."}
            </p>
          </div>
        ) : (
          <div className="history-records-list">
            {historyData.items.map((item) => {
              let hostname = item.normalizedUrl;
              try {
                hostname = new URL(item.normalizedUrl).hostname;
              } catch {
                // fallback to raw string
              }

              return (
                <article
                  key={item.auditId}
                  className="history-card"
                  onClick={() => onSelectAudit(item)}
                >
                  <div className="history-card-main">
                    <div className="history-card-header">
                      <strong className="history-card-host">{hostname}</strong>
                      <span className="history-card-status">HTTP {item.statusCode}</span>
                      <span className="history-card-time">
                        <Clock size={12} />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <div className="history-card-url" title={item.normalizedUrl}>
                      {item.normalizedUrl}
                    </div>

                    {item.pageTitle && (
                      <div className="history-card-title">"{item.pageTitle}"</div>
                    )}

                    <div className="history-card-badges">
                      <span className="summary-pill summary-pill--pass">
                        <CheckCircle2 size={12} /> {item.summary.pass} Pass
                      </span>
                      <span className="summary-pill summary-pill--warn">
                        <AlertTriangle size={12} /> {item.summary.warning} Warnings
                      </span>
                      <span className="summary-pill summary-pill--meta">
                        H1: {item.headings.h1}
                      </span>
                      <span className="summary-pill summary-pill--meta">
                        Images: {item.imageCount}
                      </span>
                    </div>
                  </div>

                  <div className="history-card-actions">
                    <button
                      className="history-action-btn history-action-btn--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAudit(item);
                      }}
                      title="Load findings into dashboard"
                    >
                      <span>INSPECT</span>
                    </button>

                    <button
                      className="history-action-btn history-action-btn--secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReAudit(item.submittedUrl || item.normalizedUrl);
                      }}
                      title="Run a live audit now on this URL"
                    >
                      <RotateCw size={13} />
                      <span>RE-AUDIT</span>
                    </button>

                    <a
                      href={item.normalizedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="history-action-btn history-action-btn--icon"
                      onClick={(e) => e.stopPropagation()}
                      title="Open external website"
                    >
                      <ExternalLink size={14} />
                    </a>

                    <button
                      className="history-action-btn history-action-btn--danger"
                      onClick={(e) => handleDelete(e, item.auditId)}
                      title="Delete audit record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {historyData && historyData.pagination.totalPages > 1 && (
          <div className="history-pagination">
            <button
              className="pagination-btn"
              disabled={page <= 1 || loading}
              onClick={() => void loadHistory(page - 1, search)}
            >
              <ChevronLeft size={14} />
              <span>PREV</span>
            </button>

            <span className="pagination-info">
              PAGE {historyData.pagination.page} OF {historyData.pagination.totalPages} ({historyData.pagination.total} TOTAL)
            </span>

            <button
              className="pagination-btn"
              disabled={page >= historyData.pagination.totalPages || loading}
              onClick={() => void loadHistory(page + 1, search)}
            >
              <span>NEXT</span>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
