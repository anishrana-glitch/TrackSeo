import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ICrawledPage {
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
  findings: Array<{
    id: string;
    status: "pass" | "warning" | "info";
    title: string;
    details: string;
  }>;
  crawledAt: Date;
}

export interface ICrawlJob extends Document {
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
  pages: ICrawledPage[];
  error?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

const CrawledPageSchema = new Schema<ICrawledPage>(
  {
    url: { type: String, required: true },
    depth: { type: Number, required: true },
    statusCode: { type: Number, required: true },
    pageTitle: { type: String, default: null },
    metaDescription: { type: String, default: null },
    canonicalUrl: { type: String, default: null },
    headings: {
      h1: { type: Number, default: 0 },
      h2: { type: Number, default: 0 },
      h3: { type: Number, default: 0 }
    },
    imageCount: { type: Number, default: 0 },
    imagesMissingAlt: { type: Number, default: 0 },
    noindex: { type: Boolean, default: false },
    linksFound: { type: Number, default: 0 },
    internalLinks: { type: [String], default: [] },
    externalLinks: { type: [String], default: [] },
    findings: {
      type: [
        {
          id: String,
          status: { type: String, enum: ["pass", "warning", "info"] },
          title: String,
          details: String
        }
      ],
      default: []
    },
    crawledAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const CrawlJobSchema = new Schema<ICrawlJob>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    rootUrl: {
      type: String,
      required: true,
      trim: true
    },
    domain: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "cancelled"],
      default: "queued",
      index: true
    },
    engine: {
      type: String,
      enum: ["cheerio_static", "browserbase_render"],
      default: "cheerio_static"
    },
    options: {
      maxPages: { type: Number, default: 5 },
      maxDepth: { type: Number, default: 2 },
      timeoutSeconds: { type: Number, default: 30 },
      concurrency: { type: Number, default: 2 }
    },
    progress: {
      pagesFound: { type: Number, default: 1 },
      pagesCrawled: { type: Number, default: 0 },
      pagesRemaining: { type: Number, default: 1 }
    },
    pages: {
      type: [CrawledPageSchema],
      default: []
    },
    error: {
      type: String,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

CrawlJobSchema.index({ domain: 1, createdAt: -1 });
CrawlJobSchema.index({ createdAt: -1 });

export const CrawlJob: Model<ICrawlJob> =
  mongoose.models.CrawlJob ||
  mongoose.model<ICrawlJob>("CrawlJob", CrawlJobSchema);
