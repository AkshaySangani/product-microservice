import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  AccountModel,
  CampaignModel,
  CategoryModel,
  CollaborationModel,
  CreatorModel,
  ProductModel,
  RequestModel,
  VendorModel,
  WishListModel,
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
      data: product,
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
    // STEP 1: Get deleted account IDs
    const deletedAccounts = await AccountModel.find(
      { isDeleted: true },
      { _id: 1 }
    ).lean();
    const deletedAccountIds = new Set(
      deletedAccounts.map((acc) => acc._id.toString())
    );

    // STEP 2: Get active vendor IDs (whose account is not deleted)
    const validVendors = await VendorModel.find(
      { accountId: { $nin: Array.from(deletedAccountIds) } },
      { _id: 1 }
    ).lean();
    const validVendorIds = new Set(validVendors.map((v) => v._id.toString()));

    // STEP 3: Get valid creator IDs (whose account is not deleted)
    const validCreators = await CreatorModel.find(
      { accountId: { $nin: Array.from(deletedAccountIds) } },
      { _id: 1 }
    ).lean();
    const validCreatorIds = new Set(validCreators.map((c) => c._id.toString()));

    // STEP 4: Fetch all products
    const products = await ProductModel.find(
      {},
      {
        _id: 1,
        status: 1,
        startDate: 1,
        endDate: 1,
        lifeTime: 1,
        vendorId: 1,
      }
    ).lean();

    const bulkProductOps: any[] = [];
    const bulkCollabOps: any[] = [];

    for (const product of products) {
      const { _id, startDate, endDate, lifeTime, status, vendorId } = product;

      // Skip if vendor is linked to a deleted account
      if (!validVendorIds.has(vendorId?.toString())) {
        continue;
      }

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
        // Update product status
        bulkProductOps.push({
          updateOne: {
            filter: { _id },
            update: { $set: { status: newStatus } },
          },
        });

        // Also update collaborations based on new product status
        let collaborationStatus: string | null = null;
        if (newStatus === "EXPIRED") {
          collaborationStatus = "EXPIRED";
        } else if (newStatus === "ACTIVE") {
          collaborationStatus = "SUCCESS";
        }

        if (collaborationStatus) {
          bulkCollabOps.push({
            updateMany: {
              filter: {
                productId: _id,
                vendorId: { $in: Array.from(validVendorIds) },
                creatorId: { $in: Array.from(validCreatorIds) },
                collaborationStatus: { $ne: collaborationStatus },
              },
              update: { $set: { collaborationStatus } },
            },
          });
        }
      }
    }

    // EXECUTE BULK OPS
    if (bulkProductOps.length > 0) {
      await ProductModel.bulkWrite(bulkProductOps);
      console.log(`Updated ${bulkProductOps.length} product statuses.`);
    } else {
      console.log("No product statuses needed updating.");
    }

    if (bulkCollabOps.length > 0) {
      await CollaborationModel.bulkWrite(bulkCollabOps);
      console.log(`Updated ${bulkCollabOps.length} related collaborations.`);
    }
  } catch (error) {
    console.error(
      "Error while updating product and collaboration statuses:",
      error
    );
  }
};

const getProducts = async (req: AuthRequest, res: Response) => {
  const accountId = req?.user?._id;
  try {
    const { page = 1, limit = 10, category, subCategory, search } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // escape default creator
    const trureffCreator = await CreatorModel.findOne({
      user_name: "truereff",
    });

    const collaborations = await CollaborationModel.aggregate([
      {
        $match: {
          creatorId: trureffCreator?._id,
          collaborationStatus: "ACTIVE",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      // Populate product.category
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "product.category",
        },
      },
      {
        $addFields: {
          "product.category": { $arrayElemAt: ["$product.category", 0] },
        },
      },

      // Populate product.subCategory
      {
        $lookup: {
          from: "categories",
          localField: "product.subCategory",
          foreignField: "_id",
          as: "product.subCategory",
        },
      },
      {
        $addFields: {
          "product.subCategory": { $arrayElemAt: ["$product.subCategory", 0] },
        },
      },

      // Match filters
      {
        $match: {
          ...(search && {
            $or: [
              { "product.title": { $regex: search, $options: "i" } },
              { "product.tags": { $in: [new RegExp(search as string, "i")] } },
            ],
          }),
          ...(category &&
            !subCategory && {
              "product.category._id": new mongoose.Types.ObjectId(
                category as string
              ),
            }),
          ...(subCategory && {
            "product.subCategory._id": new mongoose.Types.ObjectId(
              subCategory as string
            ),
          }),
        },
      },

      {
        $facet: {
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limitNumber },
            {
              $project: {
                _id: 1,
                crmLink: 1,
                utmLink: 1,
                product: 1,
              },
            },
          ],
          count: [{ $count: "total" }],
        },
      },
    ]);

    const list = collaborations[0]?.data || [];

    let wishlistedIds = [];
    if (accountId) {
      const wishlistEntries = await WishListModel.find({
        accountId: accountId,
      }).select("collaborationId");
      wishlistedIds = wishlistEntries.map((entry: any) =>
        entry.collaborationId.toString()
      );
    }

    const enhancedList = list.map((collab: any) => ({
      ...collab,
      isWishListed: wishlistedIds.includes(collab._id.toString()),
    }));

    return sendApiResponse(res, 200, "Products fetched successfully", {
      list: enhancedList,
      count: collaborations[0]?.count[0]?.total || 0,
    });
  } catch (error) {
    console.error("Error while fetching products", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const categoryForSlider = async (req: Request, res: Response) => {
  try {
    const trureffCreator = await CreatorModel.findOne({
      user_name: "truereff",
    });

    const categories = await CollaborationModel.aggregate([
      {
        $match: {
          creatorId: trureffCreator?._id,
          collaborationStatus: "ACTIVE",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      // Populate product.category
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "productCategory",
        },
      },
      {
        $addFields: {
          productCategory: { $arrayElemAt: ["$productCategory", 0] },
        },
      },

      // Match only categories that exist (avoid orphaned category references)
      {
        $match: {
          "productCategory._id": { $exists: true },
        },
      },

      {
        $group: {
          _id: "$productCategory._id",
          category: { $first: "$productCategory" },
          productCount: { $sum: 1 },
        },
      },
      {
        $match: {
          productCount: { $gt: 0 },
        },
      },
      {
        $sort: {
          productCount: -1,
        },
      },
      {
        $limit: 5,
      },
      {
        $replaceRoot: {
          newRoot: "$category",
        },
      },
    ]);

    return sendApiResponse(
      res,
      200,
      "Category for slider fetched successfully",
      {
        data: categories,
      }
    );
  } catch (e) {
    console.error("Error while fetching category for slider", e);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

export { getProductList, getProductById, getProducts, categoryForSlider };
