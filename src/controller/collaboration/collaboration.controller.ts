import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import {
  ChannelModel,
  VendorProductModel,
  CollaborationModel,
  CreatorModel,
  ProductModel,
  RequestModel,
} from "../../database/model";
import axios from "axios";
import { BACKEND_URL, FRONTEND_URL } from "../../config";
import { sendNotification } from "../../common/sendNotification";
import { createShopifyUTM } from "../utm-link/utm.controller";

const collaborationRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { productIds, creatorId, vendorId } = req.body;
    const userRole = req.userRole; // Can be "creator" or "vendor"

    // Step 1: Validate input
    if (
      !Array.isArray(productIds) ||
      productIds.length === 0 ||
      !creatorId ||
      !vendorId
    ) {
      return sendApiResponse(res, 400, "Missing required fields");
    }

    // Step 2: Fetch creator details for notification purposes
    const creator = await CreatorModel.findById(creatorId);
    if (!creator) {
      return sendApiResponse(res, 404, "Creator not found");
    }

    // Step 3: Define who is sending the request
    const requestFrom = userRole === "creator" ? "CREATOR" : "VENDOR";

    // Step 4: Process each productId separately
    const results = await Promise.all(
      productIds.map(async (productId: string) => {
        try {
          // 4a. Check vendor-product association
          const vendorProduct: any = await VendorProductModel.findOne({
            productId,
            vendorId,
          }).populate("productId");
          if (!vendorProduct)
            return { error: `Vendor not found for product ${productId}` };

          // 4b. Check the channel (must be Shopify)
          const channel = await ChannelModel.findOne({
            vendorId,
            channelType: vendorProduct.channelName,
          });
          if (!channel)
            return { error: `Channel not found for vendor ${vendorId}` };
          if (channel.channelType !== "shopify")
            return { error: `Only Shopify products are supported` };

          // 4c. Check for existing collaboration
          const existing = await CollaborationModel.findOne({
            creatorId,
            vendorId,
            productId,
          });
          if (existing)
            return {
              message: `Collaboration already exists for product ${vendorProduct.productId?.title}`,
              existing: true,
            };

          // 4d. Create a new Request document
          const newRequest = new RequestModel({
            creatorId,
            vendorId,
            productId,
            collaborationStatus: "REQUESTED",
            requestFrom,
          });

          await newRequest.save();

          // 4e. Create the Collaboration linked to the request
          const newCollaboration = new CollaborationModel({
            creatorId,
            vendorId,
            productId,
            requestId: newRequest._id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
            collaborationStatus: "REQUESTED",
            commissionValue: 0,
            commissionType: "PERCENTAGE",
            negotiation: {
              creatorProposal: 0,
              vendorProposal: 0,
            },
          });

          await newCollaboration.save();

          // 4f. Send notification to vendor
          await sendNotification(
            req,
            [vendorId],
            `New collaboration request from ${creator.full_name} for product ${vendorProduct.productId?.title}`
          );

          return {
            message: `Collaboration created for product ${vendorProduct.productId?.title}`,
            data: { collaboration: newCollaboration, request: newRequest },
          };
        } catch (innerError) {
          console.error("Error in product processing:", innerError);
          return {
            error: `Internal error while processing product ${productId}`,
          };
        }
      })
    );

    // Step 5: Return results summary
    return sendApiResponse(res, 201, "Collaboration request processed", {
      results,
    });
  } catch (error: any) {
    console.error("Collaboration creation error:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

const getCollaborationList = async (req: AuthRequest, res: Response) => {
  const userRole = req.userRole; // "vendor" or "creator"
  const { _id } = req.user;

  try {
    // ---------------- Pagination & Search Setup ----------------
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim() || "";
    // Optional collaborationStatus filter from query
    const collaborationStatus = (
      req.query.collaborationStatus as string
    )?.trim();

    // ---------------- Base Filter: Role and collaborationStatus ----------------
    const matchStage: any = {};
    if (userRole === "creator") {
      matchStage.creatorId = _id;
    } else if (userRole === "vendor") {
      matchStage.vendorId = _id;
    }
    if (collaborationStatus) {
      matchStage.collaborationStatus = collaborationStatus;
    }

    // ---------------- Main Aggregation Pipeline ----------------
    const pipeline: any[] = [
      // 1. Filter by base criteria (role and status)
      { $match: matchStage },

      // 2. Lookup associated product details from "products"
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      // Unwind the product array; drop collaborations with no product.
      { $unwind: "$product" },

      // 3. If a search term is provided, match by product title (case-insensitive)
      ...(search
        ? [
            {
              $match: {
                "product.title": { $regex: search, $options: "i" },
              },
            },
          ]
        : []),

      // 4. Lookup category details from "categories" using product.category
      {
        $lookup: {
          from: "categories",
          localField: "product.category", // <-- this is an array
          foreignField: "_id",
          as: "product.categories", // <-- new field to store the array of matched categories
        },
      },

      // 5. Lookup the related user details using an aggregation pipeline so we can convert the ID to ObjectId.
      //    For vendor login, use creatorId; for creator login, use vendorId.
      {
        $lookup: {
          from: userRole === "vendor" ? "creators" : "vendors",
          let: {
            lookupId: {
              $toObjectId: userRole === "vendor" ? "$creatorId" : "$vendorId",
            },
          },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$lookupId"] },
              },
            },
            // Project the needed fields only
            {
              $project: {
                user_name: 1,
                business_name: 1,
                profile_image: 1,
                _id: 1,
              },
            },
          ],
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 6. Lookup associated request details from "requests"
      {
        $lookup: {
          from: "requests",
          localField: "requestId",
          foreignField: "_id",
          as: "request",
        },
      },
      {
        $unwind: {
          path: "$request",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 7. Group by the unique collaboration _id to remove duplicates created by lookups.
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },

      // 8. Add a new field "fromUser" based on the logged-in user role.
      //    - If vendor is logged in: return creator's user_name and profile_image.
      //    - If creator is logged in: return vendor's business_name and profile_image.
      ...(userRole === "vendor"
        ? [
            {
              $addFields: {
                fromUser: {
                  _id: "$userDetails._id",
                  user_name: "$userDetails.user_name",
                  profile_image: "$userDetails.profile_image",
                },
              },
            },
          ]
        : [
            {
              $addFields: {
                fromUser: {
                  _id: "$userDetails._id",
                  business_name: "$userDetails.business_name",
                  profile_image: "$userDetails.profile_image",
                },
              },
            },
          ]),

      // 9. Optionally remove the userDetails field.
      { $project: { userDetails: 0 } },

      // 10. Sort by creation date in descending order and apply pagination.
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    // Execute the main aggregation pipeline.
    const collaborations = await CollaborationModel.aggregate(pipeline);
    console.log(
      "Collaboration result count (after grouping):",
      collaborations.length
    );

    // ---------------- Count Pipeline ----------------
    // The count pipeline is similar but simpler – we only join products and apply the search.
    const countPipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      ...(search
        ? [
            {
              $match: {
                "product.title": { $regex: search, $options: "i" },
              },
            },
          ]
        : []),
      {
        $group: { _id: "$_id" },
      },
      { $count: "total" },
    ];

    const countResult = await CollaborationModel.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    return sendApiResponse(
      res,
      200,
      "Collaboration list fetched successfully",
      {
        data: collaborations,
        total,
      }
    );
  } catch (error: any) {
    console.error("Collaboration list error:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

const requestStatusChange = async (req: AuthRequest, res: Response) => {
  const { collaborationId, status } = req.body;
  const { _id, userRole } = req.user; // Logged-in user's ID and role

  try {
    // -------------------- Fetch Collaboration --------------------
    const collaboration: any = await CollaborationModel.findById(
      collaborationId
    );

    // -------------------- Role-Based Ownership Check --------------------
    if (
      userRole === "vendor" &&
      String(collaboration.vendorId) !== String(_id)
    ) {
      return sendApiResponse(res, 403, "Unauthorized: Not your collaboration");
    }

    if (
      userRole === "creator" &&
      String(collaboration.creatorId) !== String(_id)
    ) {
      return sendApiResponse(res, 403, "Unauthorized: Not your collaboration");
    }

    // -------------------- Update Acceptance Flags --------------------
    if (status === "accepted") {
      collaboration.collaborationStatus = "PENDING";
    } else if (status === "rejected") {
      collaboration.collaborationStatus = "REJECTED";
    }

    // -------------------- If Both Agreed, Mark as PENDING --------------------
    await collaboration.save();

    // -------------------- Final Response --------------------
    return sendApiResponse(res, 200, "Request status updated successfully", {
      collaboration,
    });
  } catch (error: any) {
    console.error("Collaboration status update error:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

const getCollaborationStatusByProduct = async (
  req: AuthRequest,
  res: Response
) => {
  const { productId } = req.params; // Extract product ID from URL parameters
  const { _id } = req.user; // Get logged-in user's ID
  const userRole = req.userRole; // Get logged-in user's role (creator or vendor)
  const { creatorId } = req.query;

  try {
    const product = await ProductModel.findById(productId);
    if (!product) {
      return sendApiResponse(res, 404, "Product not found");
    }

    // If the user is a creator, check for a collaboration where they are the creator
    if (userRole === "creator") {
      const collaboration = await CollaborationModel.findOne({
        creatorId: _id,
        productId,
      }).populate("requestId");

      return sendApiResponse(
        res,
        200,
        "Collaboration status fetched successfully",
        {
          collaboration,
        }
      );
    }

    // If the user is a vendor, check for a collaboration where they are the vendor
    else if (userRole === "vendor") {
      if (!creatorId) {
        return sendApiResponse(res, 400, "Creator id missing");
      }
      const collaboration = await CollaborationModel.findOne({
        vendorId: _id,
        productId,
        creatorId,
      }).populate("requestId");

      return sendApiResponse(
        res,
        200,
        "Collaboration status fetched successfully",
        {
          collaboration,
        }
      );
    }

    // If userRole is neither creator nor vendor (unexpected), you might want to handle this too
    else {
      return sendApiResponse(res, 403, "Unauthorized role");
    }
  } catch (error: any) {
    console.error("Collaboration status fetch error:", error);

    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

const cancelCollaborationRequest = async (req: AuthRequest, res: Response) => {
  const { collaborationId } = req.params; // Product ID must be provided in the request body

  try {
    if (!collaborationId) {
      return sendApiResponse(res, 400, "Missing collaboration id in request");
    }

    // Match collaboration
    const collaboration = await CollaborationModel.findById(collaborationId);

    if (!collaboration) {
      return sendApiResponse(res, 404, "Collaboration not found.");
    }
    const request: any = await RequestModel.findById({_id: "collaboration.requestId"});
    if (!request) {
      return sendApiResponse(res, 404, "Request not found.");
    }

    // Delete the collaboration
    await CollaborationModel.findByIdAndDelete(collaboration._id);
    await RequestModel.findByIdAndDelete(request._id);
    return sendApiResponse(
      res,
      200,
      "Collaboration request cancelled successfully"
    );
  } catch (error: any) {
    console.error("Cancel collaboration request error:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

const getCollaborationById = async (req: AuthRequest, res: Response) => {
  const { _id } = req.user;
  const userRole = req.userRole;
  const { collaborationId } = req.params;

  try {
    const collaboration = await CollaborationModel.findOne({_id:collaborationId, ...(userRole === "creator" ? {creatorId: _id} : {vendorId: _id})})
      .populate("productId")
      .populate({
        path: "creatorId",
        select: "user_name profile_image", // Add the fields you want here
      })
      .populate({
        path: "vendorId",
        select: "business_name profile_image", // Add the fields you want here
      }); // Populate opposite user;

    if (!collaboration) {
      return sendApiResponse(res, 404, "Collaboration not found");
    }

    return sendApiResponse(res, 200, "Collaboration fetched successfully", {
      collaboration,
    });
  } catch (error: any) {
    console.error("Collaboration fetch error:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

export const updateCollaborationDetails = async (
    req: AuthRequest,
    res: Response
  ) => {
    const { collaborationId } = req.params;
    const userRole = req.userRole;
  
    try {
      const {
        vendorProposal,
        creatorProposal,
        discountType,
        discountValue,
        couponCode,
        commissionValue,
        commissionType,
        startAt,
        expiresAt,
        agreedByCreator,
        agreedByVendor,
      } = req.body;
  
      // -------- Fetch the collaboration --------
      const collaboration: any = await CollaborationModel.findById(collaborationId);
      if (!collaboration) {
        return sendApiResponse(res, 404, "Collaboration not found.");
      }
  
      if (collaboration.collaborationStatus !== "PENDING") {
        return sendApiResponse(
          res,
          400,
          `Cannot modify ${collaboration.collaborationStatus} collaboration.`
        );
      }
  
      let isProposalUpdated = false;
  
      // -------- Update negotiation proposals --------
      if (
        userRole === "creator" &&
        creatorProposal !== undefined &&
        creatorProposal !== null &&
        creatorProposal !== collaboration.negotiation.creatorProposal
      ) {
        collaboration.negotiation.creatorProposal = creatorProposal;
        collaboration.commissionValue = creatorProposal;
        isProposalUpdated = true;
      }
  
      if (
        userRole === "vendor" &&
        vendorProposal !== undefined &&
        vendorProposal !== null &&
        vendorProposal !== collaboration.negotiation.vendorProposal
      ) {
        console.log("hello--",vendorProposal)
        collaboration.negotiation.vendorProposal = vendorProposal;
        collaboration.commissionValue = vendorProposal;
        isProposalUpdated = true;
      }
  
      // -------- Handle explicit commission value --------
      if (
        commissionValue !== undefined &&
        commissionValue !== null &&
        commissionValue !== collaboration.commissionValue
      ) {
        collaboration.commissionValue = commissionValue;
        isProposalUpdated = true;
      }
  
      // -------- Fields to check dynamically --------
      const fieldsToUpdate = [
        { field: "discountType", value: discountType },
        { field: "discountValue", value: discountValue },
        { field: "couponCode", value: couponCode },
        { field: "commissionType", value: commissionType },
        { field: "startAt", value: startAt ? new Date(startAt) : undefined },
        { field: "expiresAt", value: expiresAt ? new Date(expiresAt) : undefined },
      ];
  
      for (const { field, value } of fieldsToUpdate) {
        if (value !== undefined && value !== null) {
          const currentValue = collaboration[field];
  
          // Handle Date comparison differently
          const isDifferent = currentValue instanceof Date
            ? new Date(currentValue).getTime() !== new Date(value).getTime()
            : currentValue !== value;
  
          if (isDifferent) {
            collaboration[field] = value;
            isProposalUpdated = true;
          }
        }
      }
  
      // -------- Reset agreements only if real update happened --------
      if (isProposalUpdated) {
        if (userRole === "creator") {
          collaboration.negotiation.agreedByVendor = false;
          collaboration.negotiation.agreedByCreator = true;
        }
        if (userRole === "vendor") {
          collaboration.negotiation.agreedByVendor = true;
          collaboration.negotiation.agreedByCreator = false;
        }
      }
  
      // -------- Explicit agreement overrides --------
      if (agreedByCreator !== undefined)
        collaboration.negotiation.agreedByCreator = agreedByCreator;
      if (agreedByVendor !== undefined)
        collaboration.negotiation.agreedByVendor = agreedByVendor;
  
      await collaboration.save();
  
      return res.status(200).json({
        message: "Collaboration details updated successfully.",
        data: collaboration,
      });
    } catch (error: any) {
      console.error("Error while updating collaboration details:", error);
      return res.status(500).json({
        message: "Internal server error.",
        error: error?.message || "Unexpected error",
      });
    }
  };

export const updateCollaborationCrmLink = async (req: AuthRequest, res: Response) => {
    const { collaborationId } = req.params;

    try {
      const collaboration : any = await CollaborationModel.findById(collaborationId).populate('creatorId');
      if (!collaboration) {
        return sendApiResponse(res, 404, "Collaboration not found.");
      }

      const crmLink = FRONTEND_URL + '/creators/' + collaboration.creatorId.user_name + '/' + collaboration._id;

      collaboration.crmLink = crmLink;
      await collaboration.save(); 
      return await createShopifyUTM(req, res);
    } catch (error: any) {
      console.error("Error while updating collaboration CRM link:", error);
      return sendApiResponse(res, 500, "Internal server error", {
        error: error?.message || "Unexpected error",
      });
    }
  };


// Runs every hour to update collaboration status
export const updateCollaborationStatus = async () => {
  try {
    const now = new Date();

    // -------- 1. Expire Collaborations that are past expiresAt --------
    const expiredResult = await CollaborationModel.updateMany(
      {
        expiresAt: { $lt: now },
        collaborationStatus: { $in: ["PENDING", "ACTIVE"] },
      },
      { $set: { collaborationStatus: "EXPIRED" } }
    );
    console.log(`Expired collaborations: ${expiredResult.modifiedCount}`);

    // -------- 2. Activate Collaborations that passed startAt and still PENDING --------
    const activatedResult = await CollaborationModel.updateMany(
      {
        startAt: { $lte: now },
        expiresAt: { $gt: now },
        collaborationStatus: "PENDING",
        "negotiation.agreedByCreator": true,
        "negotiation.agreedByVendor": true,
      },
      { $set: { collaborationStatus: "ACTIVE" } }
    );
    console.log(`Activated collaborations: ${activatedResult.modifiedCount}`);
  } catch (error: any) {
    console.error("Error while updating collaboration status cron:", error.message);
  }
};

  
export {
  collaborationRequest,
  getCollaborationList,
  requestStatusChange,
  getCollaborationStatusByProduct,
  cancelCollaborationRequest,
  getCollaborationById,
};
