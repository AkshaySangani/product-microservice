import Mongoose from "mongoose";

const { Schema } = Mongoose;

// creator Product Schema
const CreatorProductSchema = new Schema(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "Creator",
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  },
  { versionKey: false, timestamps: true }
);

export const CreatorProductModel = Mongoose.model("CreatorProduct", CreatorProductSchema);
