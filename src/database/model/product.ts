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
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    tags:{
      type: [String],
      default: [],
    }
  },
  { versionKey: false, timestamps: true }
);

export const ProductModel = Mongoose.model("Product", ProductSchema);
