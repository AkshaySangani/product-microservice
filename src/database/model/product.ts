import Mongoose from "mongoose";

const { Schema } = Mongoose;

// Product Schema
const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    account: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    }
  },
  { versionKey: false, timestamps: true }
);

export const ProductModel = Mongoose.model("Product", ProductSchema);
