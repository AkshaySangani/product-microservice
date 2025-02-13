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
  },
  { versionKey: false, timestamps: true }
);

export const CategoryModel = Mongoose.model("Category", CategorySchema);
