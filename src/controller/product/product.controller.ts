import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  AccountModel,
  CampaignModel,
  CategoryModel,
  CollaborationModel,
  CreatorModel,
  ProductModel,
  VendorModel,
  WishListModel,
} from "../../database/model";
import { VendorProductModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import mongoose from "mongoose";

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
          collaborationStatus = "ACTIVE";
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

export { getProductById, getProducts, categoryForSlider };
