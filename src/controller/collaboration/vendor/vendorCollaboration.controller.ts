import { Response } from "express";
import {
  CollaborationModel,
  CreatorModel,
  MessagesModel,
  ProductModel,
  VendorModel,
} from "../../../database/model";
import sendApiResponse from "../../../common";
import { AuthRequest } from "../../../types/authRequest";
import { sendNotification } from "../../../common/sendNotification";

// get product list when vendor send collb request
const getCreatorWiseProductList = async (req: AuthRequest, res: Response) => {
  const { creatorId } = req.params;
  const { _id: vendorId } = req.user;
  console.log("creatorId", creatorId);
  try {
    // Fetch products for the vendor
    const productList = await ProductModel.find({ vendorId, status: "ACTIVE" });

    // Fetch collaborations between this vendor and creator
    const collaborationList = await CollaborationModel.find({
      creatorId,
      vendorId,
    }).sort({ createdAt: -1 }); // latest first

    // Create a map of productId => collabStatus
    const collabMap = new Map<string, string>();
    for (const collab of collaborationList) {
      const productId = collab.productId.toString();
      if (!collabMap.has(productId)) {
        // first one encountered (latest because of sort)
        collabMap.set(productId, collab.collaborationStatus);
      }
    }

    // Attach collabStatus to each product
    const productListWithCollabStatus = productList.map((product) => {
      const productId = product._id.toString();
      const collabStatus = collabMap.get(productId) || null;
      return {
        ...product.toObject(),
        collaborationStatus: collabStatus,
      };
    });

    return sendApiResponse(res, 200, "Product list fetched successfully", {
      productList: productListWithCollabStatus,
    });
  } catch (e) {
    return sendApiResponse(res, 500, "Internal server error", e);
  }
};

// send collaboration request to creator
const sendCollaborationRequestToCreator = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { productIds, creatorId } = req.body;
    const { _id: vendorId } = req.user;

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

    const vendor = await VendorModel.findById(vendorId);
    if (!vendor) {
      return sendApiResponse(res, 404, "Vendor not found");
    }
    // Step 3: Define who is sending the request
    // const requestFrom = userRole === "creator" ? "CREATOR" : "VENDOR";

    // Step 4: Process each productId separately
    const results = await Promise.all(
      productIds.map(async (productId: string) => {
        try {
          // 4a. Check vendor-product association
          const vendorProduct: any = await ProductModel.findOne({
            _id: productId,
            vendorId,
          });

          if (!vendorProduct)
            return { error: `Vendor not found for product ${productId}` };

          const collaboration = await CollaborationModel.findOne({
            creatorId,
            vendorId,
            productId,
          });

          if (
            collaboration &&
            collaboration.collaborationStatus !== "DEACTIVATED"
          )
            return {
              error: `Collaboration already exists for product ${vendorProduct?.title}`,
            };
          // 4b. Check the channel (must be Shopify)
          //   const channel = await ChannelModel.findOne({
          //     vendorId,
          //     channelType: vendorProduct.channelName,
          //   });
          //   if (!channel)
          //     return { error: `Channel not found for vendor ${vendorId}` };
          //   if (channel.channelType !== "shopify")
          //     return { error: `Only Shopify products are supported` };

          // 4c. Check for existing collaboration
          //   const existing = await CollaborationModel.findOne({
          //     creatorId,
          //     vendorId,
          //     productId,
          //   });
          //   if (existing)
          //     return {
          //       message: `Collaboration already exists for product ${vendorProduct.productId?.title}`,
          //       existing: true,
          //     };

          // 4e. Create the Collaboration linked to the request
          const newCollaboration = new CollaborationModel({
            creatorId,
            vendorId,
            productId,
            requestedBy: "vendor",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
            collaborationStatus: "REQUESTED",
            commissionValue: 0,
            commissionType: "PERCENTAGE",
            negotiation: {
              agreedByVendor: true,
            },
          });

          await newCollaboration.save();

          // 4f. Send notification to creator
          sendNotification(
            req,
            {
              _id: creatorId,
              title: "New Collaboration Request",
              message: `Request from ${vendor.business_name} for product ${vendorProduct?.title}`,
              sender: "vendor",
              userType: "creator",
              notificationType: "collaboration",
              path: '/creator/collaboration/'
            }
          );

          return {
            message: `Collaboration created for product ${vendorProduct?.title}`,
            data: { collaboration: newCollaboration },
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

// cancel collaboration request by vendor
const cancelCollaborationRequestByVendor = async (
  req: AuthRequest,
  res: Response
) => {
  const { collaborationId } = req.params;
  const { _id: vendorId } = req.user;
  console.log("collaborationId", collaborationId, vendorId);
  try {
    const collaboration = await CollaborationModel.findOne({
      _id: collaborationId,
      vendorId,
    });

    if (!collaboration)
      return sendApiResponse(res, 404, "Collaboration not found");

    if (collaboration.collaborationStatus !== "REQUESTED")
      return sendApiResponse(
        res,
        400,
        "Collaboration request is not in requested status"
      );

    await CollaborationModel.findByIdAndDelete(collaborationId);
    return sendApiResponse(res, 200, "Collaboration request cancelled");
  } catch (error: any) {
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

const collaborationList = async (req: AuthRequest, res: Response) => {
  const { _id: vendorId } = req.user;
  const { page = 1, limit = 20, status, search } = req.query;

  try {
    //escape default creator
    const trureffCreator = await CreatorModel.findOne({
      user_name: "truereff",
    });

    const condition: any = { creatorId: { $ne: trureffCreator?._id } };

    if (status) condition.collaborationStatus = status;

    // Step 1: Filter by product title if `search` is passed
    if (search) {
      const matchingProducts = await ProductModel.find({
        title: { $regex: new RegExp(search as string, "i") },
        vendorId,
      })
        .select("_id")
        .lean();

      const productIds = matchingProducts.map((p) => p._id);
      condition.productId = { $in: productIds };
    }

    const collaborationList = await CollaborationModel.find({
      vendorId,
      ...condition,
    })
      .populate({
        path: "productId",
        populate: [{ path: "category", model: "Category" }],
      })
      .populate({
        path: "creatorId",
        populate: [
          { path: "category", model: "Category" },
          { path: "channels", model: "CreatorChannel" },
        ],
      })
      .populate({
        path: "bids",
        match: { sender: "creator" }, // Only bids from creator
        options: { sort: { createdAt: -1 }, limit: 1 }, // Sort descending
      })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    // 🔁 Wait for all lastMessage queries to resolve properly
    const collaborationListWithLastMessage = await Promise.all(
      collaborationList.map(async (c: any) => {
        const lastMessage = await MessagesModel.findOne({
          collaborationId: c._id,
          creatorId: c.creatorId,
        })
          .sort({ createdAt: -1 })
          .lean();

        return {
          ...c.toObject(),
          lastMessage: lastMessage || null,
        };
      })
    );

    const count = await CollaborationModel.countDocuments({
      vendorId,
      ...condition,
    });

    return sendApiResponse(
      res,
      200,
      "Collaboration list fetched successfully",
      {
        list: collaborationListWithLastMessage,
        total: count,
      }
    );
  } catch (error: any) {
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

export {
  getCreatorWiseProductList,
  sendCollaborationRequestToCreator,
  cancelCollaborationRequestByVendor,
  collaborationList,
};
