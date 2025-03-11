import mongoose from "mongoose";
import ProductSchema from "../../../../shared-models/src/models/product";
import CategorySchema from "../../../../shared-models/src/models/category";
import TagsSchema from "../../../../shared-models/src/models/tags";
import VendorProductSchema from "../../../../shared-models/src/models/vendorProduct";
import CreatorProductSchema from "../../../../shared-models/src/models/creatorProduct";

const ProductModel = mongoose.model("Product", ProductSchema);
const CategoryModel = mongoose.model("Category", CategorySchema);
const TagsModel = mongoose.model("Tags", TagsSchema);
const VendorProductModel = mongoose.model("VendorProduct", VendorProductSchema);
const CreatorProductModel = mongoose.model("CreatorProduct", CreatorProductSchema);

export { ProductModel, CategoryModel, TagsModel, VendorProductModel, CreatorProductModel};