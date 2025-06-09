import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import mongoose from "mongoose";
import { CollaborationModel } from "../../database/model";

// Controller: Fetch analytics for vendor collaborations
const vendorAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { _id: vendorId } = req.user;

    const { page = 1, limit = 20, creatorId, productId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Step 1: Build base match stage for active collaborations of the vendor
    const matchStage: any = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      // collaborationStatus: "ACTIVE",
    };

    // Step 2: Add optional filters if provided in query
    if (creatorId)
      matchStage.creatorId = new mongoose.Types.ObjectId(creatorId as string);
    if (productId)
      matchStage.productId = new mongoose.Types.ObjectId(productId as string);

    // Step 3: Aggregate collaborations with joined orders and impressions (VISITS only)
    const analytics = await CollaborationModel.aggregate([
      { $match: matchStage },

      // Join orders to calculate revenue, orders count and commission
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "collaborationId",
          as: "orders",
        },
      },

      {
        $lookup: {
          from: "impressions",
          let: { collabId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$collaborationId" },
                        { $toString: "$$collabId" },
                      ],
                    },
                    { $eq: ["$impression", "VISIT"] },
                  ],
                },
              },
            },
          ],
          as: "views",
        },
      },

      // Compute total revenue, total orders, commission paid, and views
      {
        $addFields: {
          totalRevenue: { $sum: "$orders.orderAmount" },
          totalOrders: { $size: "$orders" },
          totalCommissionPaid: { $sum: "$orders.commission" },
          totalViews: { $size: "$views" },
        },
      },

      // Join creator info
      {
        $lookup: {
          from: "creators",
          localField: "creatorId",
          foreignField: "_id",
          as: "creator",
        },
      },

      // Join product info
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },

      // Unwind creator and product arrays
      { $unwind: "$creator" },
      { $unwind: "$product" },

      // Final projection of required fields for UI table
      {
        $project: {
          creatorName: "$creator.user_name",
          creatorImage: "$creator.profile_image",
          creatorId: "$creator._id",
          productName: "$product.title",
          productImage: { $arrayElemAt: ["$product.media", 0] },
          productId: "$product._id",
          totalRevenue: 1,
          totalOrders: 1,
          totalCommissionPaid: 1,
          totalViews: 1,
        },
      },

      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { totalRevenue: -1 } },
            { $skip: skip },
            { $limit: Number(limit) },
          ],
        },
      },
    ]);

    const totalCount = analytics[0].metadata[0]?.total || 0;
    const list = analytics[0].data;
    return sendApiResponse(res, 200, "Vendor analytics fetched successfully", {
      list,
      count: totalCount,
    });
  } catch (error) {
    console.error("error while vendor analytics", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

// Controller: Fetch analytics page state for vendor collaborations
const analyticsPageState = async (req: AuthRequest, res: Response) => {
  try {
    const { _id: vendorId } = req.user;
    const { creatorId, productId } = req.query;

    // Step 1: Build base match condition
    const matchStage: any = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
    };

    // Step 2: Apply optional filters (creatorId, productId)
    if (creatorId) {
      matchStage.creatorId = new mongoose.Types.ObjectId(creatorId as string);
    }

    if (productId) {
      matchStage.productId = new mongoose.Types.ObjectId(productId as string);
    }

    // Step 3: Perform aggregation to calculate metrics
    const result = await CollaborationModel.aggregate([
      // Match collaborations for the current vendor (with optional filters)
      { $match: matchStage },

      // Join orders collection
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "collaborationId",
          as: "orders",
        },
      },

      // Join impressions collection, filter by "VISIT"
      {
        $lookup: {
          from: "impressions",
          let: { collabId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toString: "$collaborationId" },
                        { $toString: "$$collabId" },
                      ],
                    },
                    { $eq: ["$impression", "VISIT"] },
                  ],
                },
              },
            },
          ],
          as: "views",
        },
      },

      // Step 4: Compute metrics per collaboration
      {
        $project: {
          totalRevenue: { $sum: "$orders.orderAmount" },
          totalOrders: { $size: "$orders" },
          totalViews: { $size: "$views" },
        },
      },

      // Step 5: Group all collaborations to get summary metrics
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalRevenue" },
          totalOrders: { $sum: "$totalOrders" },
          totalViews: { $sum: "$totalViews" },
          totalCollaborations: { $sum: 1 },
        },
      },

      // Step 6: Compute conversion rate = (orders / views) * 100
      {
        $addFields: {
          conversionRate: {
            $cond: [
              { $eq: ["$totalViews", 0] },
              0,
              {
                $multiply: [{ $divide: ["$totalOrders", "$totalViews"] }, 100],
              },
            ],
          },
        },
      },
    ]);

    // Step 7: Structure response
    const summary = result[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalViews: 0,
      totalCollaborations: 0,
      conversionRate: 0,
    };

    return sendApiResponse(
      res,
      200,
      "Analytics page summary fetched successfully",
      summary
    );
  } catch (error) {
    console.error("error while vendor analytics summary", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const productAndCreatorSearchResultsForVendor = async (
  req: AuthRequest,
  res: Response
) => {
  const { search } = req.query;
  const searchRegex = new RegExp(search as string, "i");
  const vendorId = req.user._id;

  try {
    const [creatorList, productList] = await Promise.all([
      // === Creator Search from collaborations ===
      CollaborationModel.aggregate([
        {
          $match: {
            vendorId: new mongoose.Types.ObjectId(vendorId),
            // collaborationStatus: "ACTIVE", // uncomment if needed
          },
        },
        {
          $lookup: {
            from: "creators",
            localField: "creatorId",
            foreignField: "_id",
            as: "creator",
          },
        },
        { $unwind: "$creator" },
        {
          $match: {
            "creator.user_name": { $regex: searchRegex },
          },
        },
        {
          $group: {
            _id: "$creator._id",
            name: { $first: "$creator.user_name" },
            profile_image: { $first: "$creator.profile_image" },
          },
        },
        { $limit: 5 },
      ]),

      // === Product Search from collaborations ===
      CollaborationModel.aggregate([
        {
          $match: {
            vendorId: new mongoose.Types.ObjectId(vendorId),
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
        {
          $match: {
            "product.title": { $regex: searchRegex },
            // "product.status": "ACTIVE",
          },
        },
        {
          $group: {
            _id: "$product._id",
            title: { $first: "$product.title" },
            media: { $first: "$product.media" },
          },
        },
        { $limit: 10 },
      ]),
    ]);

    return sendApiResponse(
      res,
      200,
      "Vendor-side collaboration search results fetched successfully",
      { creatorList, productList }
    );
  } catch (error) {
    console.error("Error while fetching vendor-side search results", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};


export { vendorAnalytics, analyticsPageState, productAndCreatorSearchResultsForVendor };
