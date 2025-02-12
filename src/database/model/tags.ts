import Mongoose from "mongoose";

const { Schema } = Mongoose;

// Tags Schema
const TagsSchema = new Schema(
  {
    name: {
      type: String,
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

export const TagsModel = Mongoose.model("Tags", TagsSchema);
