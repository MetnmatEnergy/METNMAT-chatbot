import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface CompetitorKnowledgeDoc {
  type: "competitor";
  text: string;
  category?: string;
  sku?: string;
}

export type CompetitorKnowledgeDocument = CompetitorKnowledgeDoc & Document;

const CompetitorKnowledgeSchema = new Schema<CompetitorKnowledgeDocument>(
  {
    type: { type: String, required: true, default: "competitor" },
    text: { type: String, required: true },
    category: { type: String },
    sku: { type: String },
  },
  { timestamps: true }
);

CompetitorKnowledgeSchema.index({ type: 1 });

export const CompetitorKnowledgeModel: Model<CompetitorKnowledgeDocument> =
  (mongoose.models?.CompetitorKnowledge as Model<CompetitorKnowledgeDocument>) ??
  mongoose.model<CompetitorKnowledgeDocument>("CompetitorKnowledge", CompetitorKnowledgeSchema);
