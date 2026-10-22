import mongoose from "mongoose";
import { AuditReport, type IAuditFinding, type IAuditSummary } from "../models/AuditReport.js";

export interface SaveAuditInput {
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
  findings: IAuditFinding[];
  healthScore?: number;
  technicalDetails?: Record<string, unknown>;
  aiAnalysis?: Record<string, unknown>;
}

export interface AuditRecord {
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
  findings: IAuditFinding[];
  summary: IAuditSummary;
  healthScore?: number;
  technicalDetails?: Record<string, unknown>;
  aiAnalysis?: Record<string, unknown>;
  processingStatus: "completed" | "failed";
  createdAt: string;
  storage: "mongodb" | "memory";
}

export interface HistoryPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HistoryResult {
  items: AuditRecord[];
  pagination: HistoryPagination;
  source: "mongodb" | "memory";
}

// In-memory fallback cache when MongoDB is disconnected or in local offline mode
const memoryAuditStore: AuditRecord[] = [];
const MAX_MEMORY_ITEMS = 50;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class HistoryService {
  /**
   * Persists an audit result to MongoDB if connected, or to an in-memory store as fallback.
   */
  async saveAudit(input: SaveAuditInput): Promise<{ auditId: string; storage: "mongodb" | "memory" }> {
    const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const pass = input.findings.filter((f) => f.status === "pass").length;
    const warning = input.findings.filter((f) => f.status === "warning").length;
    const info = input.findings.filter((f) => f.status === "info").length;
    const summary: IAuditSummary = { pass, warning, info };

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      try {
        await AuditReport.create({
          auditId,
          submittedUrl: input.submittedUrl,
          normalizedUrl: input.normalizedUrl,
          statusCode: input.statusCode,
          pageTitle: input.pageTitle,
          metaDescription: input.metaDescription,
          canonicalUrl: input.canonicalUrl,
          headings: input.headings,
          imageCount: input.imageCount,
          imagesMissingAlt: input.imagesMissingAlt,
          noindex: input.noindex,
          findings: input.findings,
          summary,
          healthScore: input.healthScore,
          technicalDetails: input.technicalDetails,
          aiAnalysis: input.aiAnalysis,
          processingStatus: "completed"
        });

        return { auditId, storage: "mongodb" };
      } catch (err) {
        console.warn("[HistoryService] Failed to persist audit to MongoDB, falling back to memory:", err);
      }
    }

    // Fallback: save to memory store
    const memoryRecord: AuditRecord = {
      auditId,
      submittedUrl: input.submittedUrl,
      normalizedUrl: input.normalizedUrl,
      statusCode: input.statusCode,
      pageTitle: input.pageTitle,
      metaDescription: input.metaDescription,
      canonicalUrl: input.canonicalUrl,
      headings: input.headings,
      imageCount: input.imageCount,
      imagesMissingAlt: input.imagesMissingAlt,
      noindex: input.noindex,
      findings: input.findings,
      summary,
      healthScore: input.healthScore,
      technicalDetails: input.technicalDetails,
      aiAnalysis: input.aiAnalysis,
      processingStatus: "completed",
      createdAt: new Date().toISOString(),
      storage: "memory"
    };

    memoryAuditStore.unshift(memoryRecord);
    if (memoryAuditStore.length > MAX_MEMORY_ITEMS) {
      memoryAuditStore.pop();
    }

    return { auditId, storage: "memory" };
  }

  /**
   * Retrieves paginated audit history with optional search filtering.
   */
  async getAuditHistory(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<HistoryResult> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 10));
    const search = options.search?.trim();

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      try {
        const filter: Record<string, unknown> = {};
        if (search) {
          const regex = new RegExp(escapeRegex(search), "i");
          filter.$or = [{ normalizedUrl: regex }, { submittedUrl: regex }, { pageTitle: regex }];
        }

        const [total, reports] = await Promise.all([
          AuditReport.countDocuments(filter),
          AuditReport.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()
        ]);

        const items: AuditRecord[] = reports.map((doc) => ({
          auditId: doc.auditId,
          submittedUrl: doc.submittedUrl,
          normalizedUrl: doc.normalizedUrl,
          statusCode: doc.statusCode,
          pageTitle: doc.pageTitle,
          metaDescription: doc.metaDescription,
          canonicalUrl: doc.canonicalUrl,
          headings: doc.headings,
          imageCount: doc.imageCount,
          imagesMissingAlt: doc.imagesMissingAlt,
          noindex: doc.noindex,
          findings: doc.findings,
          summary: doc.summary,
          healthScore: doc.healthScore,
          technicalDetails: doc.technicalDetails,
          aiAnalysis: doc.aiAnalysis,
          processingStatus: doc.processingStatus,
          createdAt: new Date(doc.createdAt).toISOString(),
          storage: "mongodb"
        }));

        return {
          items,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit))
          },
          source: "mongodb"
        };
      } catch (err) {
        console.warn("[HistoryService] MongoDB query failed, falling back to memory store:", err);
      }
    }

    // In-memory fallback
    let filtered = memoryAuditStore;
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = memoryAuditStore.filter(
        (item) =>
          item.normalizedUrl.toLowerCase().includes(lowerSearch) ||
          item.submittedUrl.toLowerCase().includes(lowerSearch) ||
          (item.pageTitle && item.pageTitle.toLowerCase().includes(lowerSearch))
      );
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      source: "memory"
    };
  }

  /**
   * Retrieves a single audit by auditId.
   */
  async getAuditById(auditId: string): Promise<AuditRecord | null> {
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await AuditReport.findOne({ auditId }).lean();
        if (doc) {
          return {
            auditId: doc.auditId,
            submittedUrl: doc.submittedUrl,
            normalizedUrl: doc.normalizedUrl,
            statusCode: doc.statusCode,
            pageTitle: doc.pageTitle,
            metaDescription: doc.metaDescription,
            canonicalUrl: doc.canonicalUrl,
            headings: doc.headings,
            imageCount: doc.imageCount,
            imagesMissingAlt: doc.imagesMissingAlt,
            noindex: doc.noindex,
            findings: doc.findings,
            summary: doc.summary,
            healthScore: doc.healthScore,
            technicalDetails: doc.technicalDetails,
            aiAnalysis: doc.aiAnalysis,
            processingStatus: doc.processingStatus,
            createdAt: new Date(doc.createdAt).toISOString(),
            storage: "mongodb"
          };
        }
      } catch (err) {
        console.warn("[HistoryService] MongoDB getById failed:", err);
      }
    }

    const found = memoryAuditStore.find((item) => item.auditId === auditId);
    return found || null;
  }

  /**
   * Deletes an audit by auditId.
   */
  async deleteAuditById(auditId: string): Promise<boolean> {
    if (mongoose.connection.readyState === 1) {
      try {
        const res = await AuditReport.deleteOne({ auditId });
        return (res.deletedCount ?? 0) > 0;
      } catch (err) {
        console.warn("[HistoryService] MongoDB delete failed:", err);
      }
    }

    const index = memoryAuditStore.findIndex((item) => item.auditId === auditId);
    if (index !== -1) {
      memoryAuditStore.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Attaches AI recommendations to an existing audit record.
   */
  async attachAiAnalysis(auditId: string, analysis: unknown): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      try {
        await AuditReport.updateOne({ auditId }, { $set: { aiAnalysis: analysis } });
      } catch (err) {
        console.warn("[HistoryService] Failed to attach AI analysis to MongoDB:", err);
      }
    }

    const item = memoryAuditStore.find((i) => i.auditId === auditId);
    if (item) {
      (item as unknown as { aiAnalysis?: unknown }).aiAnalysis = analysis;
    }
  }
}

export const historyService = new HistoryService();
