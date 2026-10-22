import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IAuditFinding {
  id: string;
  status: "pass" | "warning" | "info";
  title: string;
  details: string;
}

export interface IAuditSummary {
  pass: number;
  warning: number;
  info: number;
}

export interface IAuditReport extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const AuditFindingSchema = new Schema<IAuditFinding>(
  {
    id: { type: String, required: true },
    status: { type: String, enum: ["pass", "warning", "info"], required: true },
    title: { type: String, required: true },
    details: { type: String, required: true }
  },
  { _id: false }
);

const AuditSummarySchema = new Schema<IAuditSummary>(
  {
    pass: { type: Number, default: 0 },
    warning: { type: Number, default: 0 },
    info: { type: Number, default: 0 }
  },
  { _id: false }
);

const AuditReportSchema = new Schema<IAuditReport>(
  {
    auditId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    submittedUrl: {
      type: String,
      required: true,
      trim: true
    },
    normalizedUrl: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    statusCode: {
      type: Number,
      required: true
    },
    pageTitle: {
      type: String,
      default: null
    },
    metaDescription: {
      type: String,
      default: null
    },
    canonicalUrl: {
      type: String,
      default: null
    },
    headings: {
      h1: { type: Number, default: 0 },
      h2: { type: Number, default: 0 },
      h3: { type: Number, default: 0 }
    },
    imageCount: {
      type: Number,
      default: 0
    },
    imagesMissingAlt: {
      type: Number,
      default: 0
    },
    noindex: {
      type: Boolean,
      default: false
    },
    findings: {
      type: [AuditFindingSchema],
      default: []
    },
    summary: {
      type: AuditSummarySchema,
      required: true
    },
    healthScore: {
      type: Number,
      default: null
    },
    technicalDetails: {
      type: Schema.Types.Mixed,
      default: null
    },
    aiAnalysis: {
      type: Schema.Types.Mixed,
      default: null
    },
    processingStatus: {
      type: String,
      enum: ["completed", "failed"],
      default: "completed"
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying a site's audit history by date
AuditReportSchema.index({ normalizedUrl: 1, createdAt: -1 });
AuditReportSchema.index({ createdAt: -1 });

export const AuditReport: Model<IAuditReport> =
  mongoose.models.AuditReport ||
  mongoose.model<IAuditReport>("AuditReport", AuditReportSchema);
