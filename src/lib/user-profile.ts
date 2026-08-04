import connectToDb from "./connect-to-db";
import {
  UserProfileModel,
  type UserProfileDoc,
  type UserType,
} from "../models/user-profile";

/**
 * Updates that can be applied to a user profile. Only non-undefined fields are updated.
 */
export type UserProfileUpdate = Partial<
  Pick<UserProfileDoc, "name" | "preferredLanguage" | "city" | "userType" | "businessName">
>;

/**
 * Fetches the user profile by phone. Returns null if not found.
 */
export async function getProfile(phone: string): Promise<UserProfileDoc | null> {
  if (!phone?.trim()) return null;
  await connectToDb();
  const normalized = phone.replace(/^\+/, "").trim();
  const doc = await UserProfileModel.findOne({ phone: normalized }).lean();
  if (!doc) return null;
  return {
    phone: doc.phone,
    name: doc.name,
    preferredLanguage: doc.preferredLanguage,
    city: doc.city,
    userType: doc.userType as UserType | undefined,
    businessName: doc.businessName,
  };
}

/**
 * Upserts profile: merges updates into existing profile (only non-empty updates overwrite).
 * Creates a new profile if none exists for the phone.
 */
export async function updateProfile(
  phone: string,
  updates: any
): Promise<UserProfileDoc> {
  if (!phone?.trim()) throw new Error("Phone is required");
  await connectToDb();
  const normalized = phone.replace(/^\+/, "").trim();
  const toSet: Record<string, unknown> = {};
  if (updates.name != null && updates.name !== "") toSet.name = updates.name;
  if (updates.preferredLanguage != null && updates.preferredLanguage !== "")
    toSet.preferredLanguage = updates.preferredLanguage;
  if (updates.city != null && updates.city !== "") toSet.city = updates.city;
  if (updates.userType != null)
    toSet.userType = updates.userType;
  if (updates.businessName != null && updates.businessName !== "")
    toSet.businessName = updates.businessName;

  const doc = await UserProfileModel.findOneAndUpdate(
    { phone: normalized },
    { $set: toSet },
    { returnDocument: "after", upsert: true }
  ).lean();

  return {
    phone: doc.phone,
    name: doc.name,
    preferredLanguage: doc.preferredLanguage,
    city: doc.city,
    userType: doc.userType as UserType | undefined,
    businessName: doc.businessName,
  };
}
