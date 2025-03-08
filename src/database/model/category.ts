import Mongoose from "mongoose";

const { Schema } = Mongoose;

// Category Schema
const CategorySchema = new Schema(
  {
   name:{
    type: String,
    required: true,
    unique: true,
   },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
  },
  { versionKey: false, timestamps: true }
);

export const CategoryModel = Mongoose.model("Category", CategorySchema);
