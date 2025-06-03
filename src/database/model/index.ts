import mongoose from "mongoose";
import ProductSchema from "../../../../shared-models/src/models/product";
import CategorySchema from "../../../../shared-models/src/models/category";
import TagsSchema from "../../../../shared-models/src/models/tags";
import VendorProductSchema from "../../../../shared-models/src/models/vendorProduct";
import CreatorProductSchema from "../../../../shared-models/src/models/creatorProduct";
import CreatorSchema from "../../../../shared-models/src/models/creator";
import VendorSchema from "../../../../shared-models/src/models/vendor";
import AccountSchema from "../../../../shared-models/src/models/account";
import CollaborationSchema from "../../../../shared-models/src/models/collaboration";
import ChannelSchema from "../../../../shared-models/src/models/channel";
import RequestSchema from "../../../../shared-models/src/models/request";
import CampaignSchema from "../../../../shared-models/src/models/campaign";
import WishListSchema from "../../../../shared-models/src/models/wishList";
import {biddingSchema} from "../../../../shared-models/src/models/collaboration";
import PlanSchema from "../../../../shared-models/src/models/plan"; 
import SubscriptionSchema from "../../../../shared-models/src/models/subscription";
import MessagesSchema from "../../../../shared-models/src/models/messages";
import CreatorChannelSchema from "../../../../shared-models/src/models/creatorChannel";

const ProductModel = mongoose.model("Product", ProductSchema);
const CategoryModel = mongoose.model("Category", CategorySchema);
const TagsModel = mongoose.model("Tags", TagsSchema);
const VendorProductModel = mongoose.model("VendorProduct", VendorProductSchema);
const CreatorProductModel = mongoose.model("CreatorProduct", CreatorProductSchema);
const VendorModel = mongoose.model("Vendor", VendorSchema);
const CreatorModel = mongoose.model("Creator", CreatorSchema);
const AccountModel = mongoose.model("Account", AccountSchema);
const CollaborationModel = mongoose.model("Collaboration", CollaborationSchema);
const ChannelModel = mongoose.model("Channel", ChannelSchema);
const RequestModel = mongoose.model("Request", RequestSchema);
const CampaignModel = mongoose.model("Campaign", CampaignSchema);
const WishListModel = mongoose.model("WishList", WishListSchema);
const BidModel = mongoose.model("Bidding", biddingSchema);
const PlanModel = mongoose.model("Plan", PlanSchema);
const SubscriptionModel = mongoose.model("Subscription", SubscriptionSchema);
const MessagesModel = mongoose.model("Messages", MessagesSchema);
const CreatorChannelModel = mongoose.model("CreatorChannel", CreatorChannelSchema);

export {
    ProductModel,
    CategoryModel,
    TagsModel,
    VendorProductModel,
    CreatorProductModel,
    VendorModel,
    CreatorModel,
    AccountModel,
    CollaborationModel,
    ChannelModel,
    RequestModel,
    CampaignModel,
    WishListModel,
    BidModel,
    PlanModel,
    SubscriptionModel,
    MessagesModel,
    CreatorChannelModel
};