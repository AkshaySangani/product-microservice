import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  CampaignModel,
  CollaborationModel,
  ProductModel,
  RequestModel,
} from "../../database/model";
import { VendorProductModel } from "../../database/model";
import { CreatorProductModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import mongoose from "mongoose";

// Get Product List for Creator with Collaboration, Request, and Campaign Info
const getProductList = async (req: AuthRequest, res: Response) => {
  try {
    const { _id: creatorId } = req.user;

    // -------------------- Extract Query Params --------------------
    const { page = 1, limit = 10, categories, search } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // -------------------- Build Dynamic Product Filters --------------------
    let productFilter: any = {};

    // Text search on title or tags
    if (search) {
      productFilter.$or = [
        { title: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } },
      ];
    }

    // Handle category filtering (comma-separated)
    if (categories) {
      const categoryArray =
        typeof categories === "string"
          ? categories.split(",").map((id) => id.trim())
          : [];

      if (categoryArray.length > 0) {
        const objectIds = categoryArray.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        productFilter.category = { $in: objectIds };
      }
    }

    // -------------------- Fetch Products with Pagination --------------------
    const productList = await ProductModel.find(productFilter)
      .sort({ createdAt: -1 }) // 👈 Sorts by latest
      .skip(skip)
      .limit(limitNumber)
      .populate("category")
      .lean();

    const productIds = productList.map((p) => p._id);

    // -------------------- Fetch Active Campaigns for These Products --------------------
    const campaigns = await CampaignModel.find({
      productId: { $in: productIds },
      status: "ACTIVE",
    }).lean();

    const campaignMap = new Map<string, any>();
    campaigns.forEach((c) => campaignMap.set(c.productId.toString(), c));

    // -------------------- Fetch Creator's Requests and Collaborations --------------------
    const [requests, collaborations] = await Promise.all([
      RequestModel.find({
        creatorId,
        productId: { $in: productIds },
      }).lean(),
      CollaborationModel.find({
        creatorId,
        productId: { $in: productIds },
      }).lean(),
    ]);

    // Build lookup maps for efficient access
    const requestMap = new Map<string, any>();
    requests.forEach((r) => requestMap.set(r.productId.toString(), r));

    const collaborationMap = new Map<string, any>();
    collaborations.forEach((c) =>
      collaborationMap.set(c.productId.toString(), c)
    );

    // -------------------- Enrich Products with Vendor, Request, Collaboration & Campaign Info --------------------
    const enrichedProducts = await Promise.all(
      productList.map(async (product) => {
        const vendorProduct = await VendorProductModel.findOne({
          productId: product._id,
        })
          .populate({
            path: "vendorId",
            select: "_id business_name profile_image",
          })
          .lean();

        const productIdStr = product._id.toString();

        return {
          ...product,
          vendor: vendorProduct?.vendorId || null,
          request: requestMap.get(productIdStr) || null,
          collaboration: collaborationMap.get(productIdStr) || null,
          campaign: campaignMap.has(productIdStr)
            ? {
                _id: campaignMap.get(productIdStr)._id,
                status: campaignMap.get(productIdStr).status,
              }
            : null,
        };
      })
    );

    // -------------------- Separate and Shuffle Products --------------------
    const campaignProducts = enrichedProducts.filter((p) => p.campaign);
    const normalProducts = enrichedProducts.filter((p) => !p.campaign);

    const shuffle = (arr: any[]) => arr.sort(() => Math.random() - 0.5);

    const shuffledCampaigns = shuffle(campaignProducts);
    const shuffledNormals = shuffle(normalProducts);

    // -------------------- Take 2 campaigns for top
    const topCampaigns = shuffledCampaigns.slice(0, 2);
    const remainingCampaigns = shuffledCampaigns.slice(2);

    // -------------------- Mix remaining campaigns and normals
    const mergedRest: any[] = [];
    let cpIndex = 0;
    let npIndex = 0;

    // Push campaign more frequently early, then balance out
    while (
      cpIndex < remainingCampaigns.length ||
      npIndex < shuffledNormals.length
    ) {
      // Push a campaign ~60% of the time early, then less frequently
      const preferCampaign =
        mergedRest.length < 6 ? Math.random() < 0.6 : Math.random() < 0.3;

      if (preferCampaign && cpIndex < remainingCampaigns.length) {
        mergedRest.push(remainingCampaigns[cpIndex++]);
      } else if (npIndex < shuffledNormals.length) {
        mergedRest.push(shuffledNormals[npIndex++]);
      } else if (cpIndex < remainingCampaigns.length) {
        // if normal products are exhausted, push remaining campaigns
        mergedRest.push(remainingCampaigns[cpIndex++]);
      }
    }

    // -------------------- Combine top campaigns with the rest
    const finalMergedList = [...topCampaigns, ...mergedRest];

    // -------------------- Paginate the final list
    const paginated = finalMergedList.slice(0, limitNumber);

    // -------------------- Count Total Matching Products --------------------
    const count = await ProductModel.countDocuments(productFilter);

    // -------------------- Send Final Response --------------------
    return sendApiResponse(res, 200, "Product list fetched successfully", {
      data: paginated,
      count,
    });
  } catch (error) {
    console.error("Error while fetching product list", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const getProductById = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const product = await ProductModel.findById(productId)
      .populate({
        path: "category",
      })
      .lean();
   
    if (!product) {
      return sendApiResponse(res, 404, "Product not found");
    }
    return sendApiResponse(res, 200, "Product fetched successfully", {
      data: product ,
    });
  } catch (error) {
    console.error("Error while fetching product by id", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

// cron job to update product status based on startDate, endDate and lifeTime
export const updateProductStatus = async () => {
  const now = new Date();

  try {
    // Fetch only needed fields, use lean for performance
    const products = await ProductModel.find(
      {},
      {
        _id: 1,
        status: 1,
        startDate: 1,
        endDate: 1,
        lifeTime: 1,
      }
    ).lean();

    const bulkOps: any[] = [];

    for (const product of products) {
      const { _id, startDate, endDate, lifeTime, status } = product;
      let newStatus = status;

      if (lifeTime) {
        // Lifetime products should always remain ACTIVE
        if (status !== "ACTIVE") {
          newStatus = "ACTIVE";
        } else {
          continue;
        }
      } else {
        if (startDate && now < new Date(startDate)) {
          newStatus = "PENDING";
        } else if (endDate && now > new Date(endDate)) {
          newStatus = "EXPIRED";
        } else if (
          startDate &&
          endDate &&
          now >= new Date(startDate) &&
          now <= new Date(endDate)
        ) {
          newStatus = "ACTIVE";
        }
      }

      if (newStatus !== status) {
        bulkOps.push({
          updateOne: {
            filter: { _id },
            update: { $set: { status: newStatus } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await ProductModel.bulkWrite(bulkOps);
      console.log(`Updated ${bulkOps.length} product statuses.`);
    } else {
      console.log("No product statuses needed updating.");
    }
  } catch (error) {
    console.error("Error while updating product statuses:", error);
  }
};

export { getProductList, getProductById };
