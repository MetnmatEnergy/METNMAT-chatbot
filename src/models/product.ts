import mongoose, { type Document, type Model, Schema } from "mongoose";

export interface ProductPurchaseLink {
  platform: string;
  link: string;
}

export interface ProductDoc {
  id: string;
  title: string;
  brand: string;
  tagline?: string;
  subcategory?: string;
  marketing_description?: string;
  variants: string[];
  category: string;
  key_features: string[];
  description: string;
  common_uses: string[];
  specifications?: string;
  sku?: string;
  price?: string;
  body_material?: string;
  product_includes?: string;
  product_purchase_link: ProductPurchaseLink[];
  product_image_link?: string;
}

export type ProductDocument = ProductDoc & Document;

const ProductPurchaseLinkSchema = new Schema(
  {
    platform: { type: String, required: true },
    link: { type: String, required: true },
  },
  { _id: false }
);

const ProductSchema = new Schema<ProductDocument>(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    brand: { type: String, required: true, default: "Metnmat" },
    tagline: { type: String },
    subcategory: { type: String },
    marketing_description: { type: String },
    variants: { type: [String], default: [] },
    category: { type: String, required: true },
    key_features: { type: [String], default: [] },
    description: { type: String, required: true },
    common_uses: { type: [String], default: [] },
    specifications: { type: String },
    sku: { type: String },
    price: { type: String },
    body_material: { type: String },
    product_includes: { type: String },
    product_purchase_link: { type: [ProductPurchaseLinkSchema], default: [] },
    product_image_link: { type: String },
  },
  { timestamps: true }
);

ProductSchema.index({ brand: 1, title: 1 });
ProductSchema.index({ brand: 1, category: 1 });
ProductSchema.index({ category: 1, subcategory: 1 });
ProductSchema.index({ sku: 1 }, { unique: true, sparse: true });

export const ProductModel: Model<ProductDocument> =
  (mongoose.models?.Product as Model<ProductDocument>) ??
  mongoose.model<ProductDocument>("Product", ProductSchema);
