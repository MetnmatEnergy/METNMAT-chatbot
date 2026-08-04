import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface PlatformAvailabilityDoc {
  platform: string;
  cities: string[];
  pincodes: string[];
}

export type PlatformAvailabilityDocument = PlatformAvailabilityDoc & Document;

const PlatformAvailabilitySchema = new Schema<PlatformAvailabilityDocument>(
  {
    platform: { type: String, required: true, unique: true },
    cities: { type: [String], default: [] },
    pincodes: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const PlatformAvailabilityModel: Model<PlatformAvailabilityDocument> =
  (mongoose.models?.PlatformAvailability as Model<PlatformAvailabilityDocument>) ??
  mongoose.model<PlatformAvailabilityDocument>("PlatformAvailability", PlatformAvailabilitySchema);
