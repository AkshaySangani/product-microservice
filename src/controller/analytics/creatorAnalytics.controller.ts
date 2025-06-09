import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import mongoose from "mongoose";
import { CollaborationModel } from "../../database/model";

// Controller: Fetch analytics for creator collaborations
const creatorAnalytics = async (req: AuthRequest, res: Response) => {
    try {
      const { _id: creatorId } = req.user;
      const { page = 1, limit = 20, vendorId, productId } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
  
      // Step 1: Build base match stage for active collaborations of the creator
      const matchStage: any = {
        creatorId: new mongoose.Types.ObjectId(creatorId),
      };
  
      // Step 2: Add optional filters if provided in query
      if (vendorId)
        matchStage.vendorId = new mongoose.Types.ObjectId(vendorId as string);
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
  
        // Join impressions to get views
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
  
        // Compute totals
        {
          $addFields: {
            totalRevenue: { $sum: "$orders.orderAmount" },
            totalOrders: { $size: "$orders" },
            totalCommissionPaid: { $sum: "$orders.commission" },
            totalViews: { $size: "$views" },
          },
        },
  
        // Join vendor info
        {
          $lookup: {
            from: "vendors",
            localField: "vendorId",
            foreignField: "_id",
            as: "vendor",
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
  
        // Unwind vendor and product arrays
        { $unwind: "$vendor" },
        { $unwind: "$product" },
  
        // Final projection for UI
        {
          $project: {
            vendorName: "$vendor.business_name",
            vendorImage: "$vendor.profile_image",
            vendorId: "$vendor._id",
            productName: "$product.title",
            productImage: { $arrayElemAt: ["$product.media", 0] },
            productId: "$product._id",
            totalRevenue: 1,
            totalOrders: 1,
            totalCommissionPaid: 1,
            totalViews: 1,
          },
        },
  
        // Step 4: Pagination and sorting
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
  
      return sendApiResponse(res, 200, "Creator analytics fetched successfully", {
        list,
        count: totalCount,
      });
    } catch (error) {
      console.error("Error while fetching creator analytics", error);
      return sendApiResponse(res, 500, "Internal server error");
    }
  };
  

// Controller: Fetch analytics page state for creator collaborations
const creatorAnalyticsPageState = async (req: AuthRequest, res: Response) => {
  try {
    const { _id: creatorId } = req.user;
    const { productId, vendorId } = req.query;

    // Step 1: Build base match condition for the creator
    const matchStage: any = {
      creatorId: new mongoose.Types.ObjectId(creatorId),
    };

    // Step 2: Apply optional filters (productId, vendorId)
    if (productId) {
      matchStage.productId = new mongoose.Types.ObjectId(productId as string);
    }

    if (vendorId) {
      matchStage.vendorId = new mongoose.Types.ObjectId(vendorId as string);
    }

    // Step 3: Perform aggregation to calculate metrics
    const result = await CollaborationModel.aggregate([
      // Match collaborations for the current creator (with optional filters)
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
      "Creator analytics page summary fetched successfully",
      summary
    );
  } catch (error) {
    console.error("Error while fetching creator analytics summary", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

export { creatorAnalytics, creatorAnalyticsPageState };
