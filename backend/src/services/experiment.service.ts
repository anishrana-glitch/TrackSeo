import mongoose from "mongoose";
import {
  SeoExperiment,
  type IExperimentSnapshot,
  type IExperimentDelta,
  type ExperimentCategory,
  type ExperimentStatus,
  type ExperimentVerdict
} from "../models/SeoExperiment.js";

export interface CreateExperimentInput {
  title: string;
  targetUrl: string;
  hypothesis: string;
  category: ExperimentCategory;
  baseline: IExperimentSnapshot;
  notes?: string;
}

export interface UpdateExperimentInput {
  title?: string;
  hypothesis?: string;
  status?: ExperimentStatus;
  notes?: string;
  conclusion?: string;
}

export interface ExperimentRecord {
  experimentId: string;
  title: string;
  targetUrl: string;
  hypothesis: string;
  category: ExperimentCategory;
  status: ExperimentStatus;
  baseline: IExperimentSnapshot;
  variant?: IExperimentSnapshot | null;
  delta?: IExperimentDelta;
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

// In-memory fallback cache
const memoryExperiments: ExperimentRecord[] = [];

export class ExperimentService {
  /**
   * Calculates delta and verdict between baseline and variant snapshots.
   */
  calculateDelta(
    baseline: IExperimentSnapshot,
    variant: IExperimentSnapshot
  ): IExperimentDelta {
    const scoreDiff = variant.healthScore - baseline.healthScore;
    const warningDiff =
      variant.findingsSummary.warning - baseline.findingsSummary.warning;

    let fcpDiffMs = 0;
    if (variant.estimatedFcpMs && baseline.estimatedFcpMs) {
      fcpDiffMs = variant.estimatedFcpMs - baseline.estimatedFcpMs;
    }

    let verdict: ExperimentVerdict = "neutral";
    if (scoreDiff > 2 || warningDiff < 0) {
      verdict = "win";
    } else if (scoreDiff < -2 || warningDiff > 0) {
      verdict = "loss";
    }

    return {
      scoreDiff,
      warningDiff,
      fcpDiffMs,
      verdict
    };
  }

  /**
   * Creates a new hypothesis test / SEO experiment.
   */
  async createExperiment(input: CreateExperimentInput): Promise<ExperimentRecord> {
    const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      try {
        const doc = new SeoExperiment({
          experimentId,
          title: input.title,
          targetUrl: input.targetUrl,
          hypothesis: input.hypothesis,
          category: input.category,
          status: "active",
          baseline: input.baseline,
          variant: null,
          delta: { verdict: "pending", scoreDiff: 0, warningDiff: 0, fcpDiffMs: 0 },
          notes: input.notes || ""
        });
        await doc.save();

        return {
          experimentId: doc.experimentId,
          title: doc.title,
          targetUrl: doc.targetUrl,
          hypothesis: doc.hypothesis,
          category: doc.category,
          status: doc.status,
          baseline: doc.baseline,
          variant: doc.variant || null,
          delta: doc.delta,
          notes: doc.notes,
          conclusion: doc.conclusion || null,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
          storage: "mongodb"
        };
      } catch (err) {
        console.warn("[ExperimentService] MongoDB save failed, falling back to memory:", err);
      }
    }

    const memoryDoc: ExperimentRecord = {
      experimentId,
      title: input.title,
      targetUrl: input.targetUrl,
      hypothesis: input.hypothesis,
      category: input.category,
      status: "active",
      baseline: input.baseline,
      variant: null,
      delta: { verdict: "pending", scoreDiff: 0, warningDiff: 0, fcpDiffMs: 0 },
      notes: input.notes || "",
      conclusion: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      storage: "memory"
    };

    memoryExperiments.unshift(memoryDoc);
    return memoryDoc;
  }

  /**
   * Lists experiments with optional status and search filtering.
   */
  async listExperiments(options?: {
    status?: string;
    search?: string;
    limit?: number;
  }): Promise<{ items: ExperimentRecord[]; stats: ExperimentStats }> {
    const isDbConnected = mongoose.connection.readyState === 1;
    const limit = Math.min(50, options?.limit || 20);

    let items: ExperimentRecord[] = [];

    if (isDbConnected) {
      try {
        const query: Record<string, unknown> = {};
        if (options?.status && options.status !== "all") {
          query.status = options.status;
        }
        if (options?.search) {
          const regex = new RegExp(options.search, "i");
          query.$or = [{ title: regex }, { targetUrl: regex }, { hypothesis: regex }];
        }

        const docs = await SeoExperiment.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        items = docs.map((doc: any) => ({
          experimentId: doc.experimentId,
          title: doc.title,
          targetUrl: doc.targetUrl,
          hypothesis: doc.hypothesis,
          category: doc.category,
          status: doc.status,
          baseline: doc.baseline,
          variant: doc.variant || null,
          delta: doc.delta,
          notes: doc.notes,
          conclusion: doc.conclusion || null,
          createdAt: new Date(doc.createdAt).toISOString(),
          updatedAt: new Date(doc.updatedAt).toISOString(),
          storage: "mongodb"
        }));
      } catch (err) {
        console.warn("[ExperimentService] MongoDB query failed, using memory fallback:", err);
      }
    }

    if (items.length === 0 && memoryExperiments.length > 0) {
      let filtered = [...memoryExperiments];
      if (options?.status && options.status !== "all") {
        filtered = filtered.filter((i) => i.status === options.status);
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        filtered = filtered.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.targetUrl.toLowerCase().includes(q) ||
            i.hypothesis.toLowerCase().includes(q)
        );
      }
      items = filtered.slice(0, limit);
    }

    const stats = await this.getStats();
    return { items, stats };
  }

  /**
   * Retrieves a single experiment by ID.
   */
  async getExperimentById(experimentId: string): Promise<ExperimentRecord | null> {
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = (await SeoExperiment.findOne({ experimentId }).lean()) as any;
        if (doc) {
          return {
            experimentId: doc.experimentId,
            title: doc.title,
            targetUrl: doc.targetUrl,
            hypothesis: doc.hypothesis,
            category: doc.category,
            status: doc.status,
            baseline: doc.baseline,
            variant: doc.variant || null,
            delta: doc.delta,
            notes: doc.notes,
            conclusion: doc.conclusion || null,
            createdAt: new Date(doc.createdAt).toISOString(),
            updatedAt: new Date(doc.updatedAt).toISOString(),
            storage: "mongodb"
          };
        }
      } catch (err) {
        console.warn("[ExperimentService] MongoDB findOne failed:", err);
      }
    }

    const found = memoryExperiments.find((i) => i.experimentId === experimentId);
    return found || null;
  }

  /**
   * Records a variant comparison snapshot and recomputes delta.
   */
  async recordVariant(
    experimentId: string,
    variantSnapshot: IExperimentSnapshot
  ): Promise<ExperimentRecord | null> {
    const existing = await this.getExperimentById(experimentId);
    if (!existing) return null;

    const delta = this.calculateDelta(existing.baseline, variantSnapshot);

    if (mongoose.connection.readyState === 1) {
      try {
        const updated = (await SeoExperiment.findOneAndUpdate(
          { experimentId },
          {
            $set: {
              variant: variantSnapshot,
              delta,
              status: "completed"
            }
          },
          { new: true }
        ).lean()) as any;

        if (updated) {
          return {
            experimentId: updated.experimentId,
            title: updated.title,
            targetUrl: updated.targetUrl,
            hypothesis: updated.hypothesis,
            category: updated.category,
            status: updated.status,
            baseline: updated.baseline,
            variant: updated.variant,
            delta: updated.delta,
            notes: updated.notes,
            conclusion: updated.conclusion || null,
            createdAt: new Date(updated.createdAt).toISOString(),
            updatedAt: new Date(updated.updatedAt).toISOString(),
            storage: "mongodb"
          };
        }
      } catch (err) {
        console.warn("[ExperimentService] MongoDB updateOne failed:", err);
      }
    }

    const memItem = memoryExperiments.find((i) => i.experimentId === experimentId);
    if (memItem) {
      memItem.variant = variantSnapshot;
      memItem.delta = delta;
      memItem.status = "completed";
      memItem.updatedAt = new Date().toISOString();
      return memItem;
    }

    return null;
  }

  /**
   * Updates experiment attributes (notes, status, conclusion).
   */
  async updateExperiment(
    experimentId: string,
    updates: UpdateExperimentInput
  ): Promise<ExperimentRecord | null> {
    if (mongoose.connection.readyState === 1) {
      try {
        const updated = (await SeoExperiment.findOneAndUpdate(
          { experimentId },
          { $set: updates },
          { new: true }
        ).lean()) as any;

        if (updated) {
          return {
            experimentId: updated.experimentId,
            title: updated.title,
            targetUrl: updated.targetUrl,
            hypothesis: updated.hypothesis,
            category: updated.category,
            status: updated.status,
            baseline: updated.baseline,
            variant: updated.variant || null,
            delta: updated.delta,
            notes: updated.notes,
            conclusion: updated.conclusion || null,
            createdAt: new Date(updated.createdAt).toISOString(),
            updatedAt: new Date(updated.updatedAt).toISOString(),
            storage: "mongodb"
          };
        }
      } catch (err) {
        console.warn("[ExperimentService] MongoDB update failed:", err);
      }
    }

    const memItem = memoryExperiments.find((i) => i.experimentId === experimentId);
    if (memItem) {
      Object.assign(memItem, updates, { updatedAt: new Date().toISOString() });
      return memItem;
    }

    return null;
  }

  /**
   * Deletes an experiment by ID.
   */
  async deleteExperiment(experimentId: string): Promise<boolean> {
    if (mongoose.connection.readyState === 1) {
      try {
        const res = await SeoExperiment.deleteOne({ experimentId });
        return (res.deletedCount ?? 0) > 0;
      } catch (err) {
        console.warn("[ExperimentService] MongoDB delete failed:", err);
      }
    }

    const idx = memoryExperiments.findIndex((i) => i.experimentId === experimentId);
    if (idx !== -1) {
      memoryExperiments.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Aggregates stats across all experiments.
   */
  async getStats(): Promise<ExperimentStats> {
    let all: Array<{ status: string; delta?: IExperimentDelta }> = [];

    if (mongoose.connection.readyState === 1) {
      try {
        const docs = (await SeoExperiment.find({}, "status delta").lean()) as any[];
        all = docs;
      } catch {
        all = memoryExperiments;
      }
    } else {
      all = memoryExperiments;
    }

    const total = all.length;
    const active = all.filter((i) => i.status === "active").length;
    const completed = all.filter((i) => i.status === "completed").length;
    const wins = all.filter((i) => i.delta?.verdict === "win").length;
    const winRate = completed > 0 ? Math.round((wins / completed) * 100) : 0;

    return { total, active, completed, wins, winRate };
  }
}

export const experimentService = new ExperimentService();
