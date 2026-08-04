import mongoose, { type Document, type Model, Schema } from "mongoose";

/** User type for segmentation (customer, retailer, wholesaler). */
export const USER_TYPES = ["customer", "retailer", "wholesaler"] as const;
export type UserType = (typeof USER_TYPES)[number];

export interface UserProfileDoc {
  phone: string;
  name?: string;
  preferredLanguage?: string;
  city?: string;
  userType?: UserType;
  businessName?: string;
}

export type UserProfileDocument = UserProfileDoc & Document;

const UserProfileSchema = new Schema<UserProfileDocument>(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String },
    preferredLanguage: { type: String },
    city: { type: String },
    userType: { type: String, enum: USER_TYPES },
    businessName: { type: String },
  },
  { collection: "user_profiles", timestamps: true }
);

UserProfileSchema.index({ phone: 1 });

export const UserProfileModel: Model<UserProfileDocument> =
  (mongoose.models?.UserProfile as Model<UserProfileDocument>) ??
  mongoose.model<UserProfileDocument>("UserProfile", UserProfileSchema);
