import mongoose, { Schema, type Document, type Model } from "mongoose";

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

export interface IExperimentSnapshot {
  auditId?: string;
  capturedAt: Date;
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

export interface IExperimentDelta {
  scoreDiff?: number;
  warningDiff?: number;
  fcpDiffMs?: number;
  verdict?: ExperimentVerdict;
}

export interface ISeoExperiment extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const ExperimentSnapshotSchema = new Schema<IExperimentSnapshot>(
  {
    auditId: { type: String, default: null },
    capturedAt: { type: Date, required: true, default: Date.now },
    healthScore: { type: Number, required: true },
    findingsSummary: {
      pass: { type: Number, default: 0 },
      warning: { type: Number, default: 0 },
      info: { type: Number, default: 0 }
    },
    pageTitle: { type: String, default: null },
    metaDescription: { type: String, default: null },
    h1Count: { type: Number, default: 0 },
    estimatedFcpMs: { type: Number, default: null }
  },
  { _id: false }
);

const ExperimentDeltaSchema = new Schema<IExperimentDelta>(
  {
    scoreDiff: { type: Number, default: 0 },
    warningDiff: { type: Number, default: 0 },
    fcpDiffMs: { type: Number, default: 0 },
    verdict: {
      type: String,
      enum: ["win", "loss", "neutral", "pending"],
      default: "pending"
    }
  },
  { _id: false }
);

const SeoExperimentSchema = new Schema<ISeoExperiment>(
  {
    experimentId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    hypothesis: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: [
        "title_tag",
        "meta_description",
        "headings_structure",
        "schema_markup",
        "internal_linking",
        "cwv_performance",
        "content_revamp",
        "other"
      ],
      default: "title_tag"
    },
    status: {
      type: String,
      enum: ["draft", "active", "completed", "inconclusive"],
      default: "active",
      index: true
    },
    baseline: {
      type: ExperimentSnapshotSchema,
      required: true
    },
    variant: {
      type: ExperimentSnapshotSchema,
      default: null
    },
    delta: {
      type: ExperimentDeltaSchema,
      default: () => ({ verdict: "pending" })
    },
    notes: {
      type: String,
      default: ""
    },
    conclusion: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

SeoExperimentSchema.index({ targetUrl: 1, createdAt: -1 });
SeoExperimentSchema.index({ status: 1, createdAt: -1 });

export const SeoExperiment: Model<ISeoExperiment> =
  mongoose.models.SeoExperiment ||
  mongoose.model<ISeoExperiment>("SeoExperiment", SeoExperimentSchema);
