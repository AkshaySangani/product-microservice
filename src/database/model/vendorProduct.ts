import Mongoose from "mongoose";

const { Schema } = Mongoose;

// Vendor Product Schema
const VendorProductSchema = new Schema(
  {
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
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

export const VendorProductModel = Mongoose.model("VendorProduct", VendorProductSchema);
