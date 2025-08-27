import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import {
  ChannelModel,
  CollaborationModel,
  ProductModel,
  BidModel,
} from "../../database/model";
import { FRONTEND_URL } from "../../config";
import { sendNotification } from "../../common/sendNotification";
import {
  createShopifyUTM,
  createShopifyUTMnew,
  createWordpressUTM,
} from "../utm-link/utm.controller";

const requestStatusChange = async (req: AuthRequest, res: Response) => {
  const { collaborationId, status } = req.body;
  const { _id } = req.user; // Logged-in user's ID and role
  const userRole = req.userRole;
  try {
    // -------------------- Fetch Collaboration --------------------
    const collaboration: any = await CollaborationModel.findById(
      collaborationId
    ).populate("productId");

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
      const newBid = new BidModel({
        proposal: collaboration.productId.commission,
        type: collaboration.productId.commission_type,
        sender: "vendor",
      });
      await newBid.save();
      if (userRole === "creator") {
        collaboration.negotiation.agreedByCreator = true;
        collaboration.negotiation.agreedByVendor = false;
      } else {
        collaboration.negotiation.agreedByCreator = false;
        collaboration.negotiation.agreedByVendor = true;
      }
      collaboration.bids.push(newBid._id);
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
      });

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
      });

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

const getCollaborationById = async (req: AuthRequest, res: Response) => {
  const { _id } = req.user;
  const userRole = req.userRole;
  const { collaborationId } = req.params;

  try {
    const collaboration = await CollaborationModel.findOne({
      _id: collaborationId,
      ...(userRole === "creator" ? { creatorId: _id } : { vendorId: _id }),
    })
      .populate({
        path: "productId",
        populate: [
          { path: "category", model: "Category" },
          { path: "subCategory", model: "Category" },
        ],
      })
      .populate("bids")
      .populate({
        path: "creatorId",
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
    const collaboration: any = await CollaborationModel.findById(
      collaborationId
    );
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

    const product = await ProductModel.findById(collaboration?.productId)

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
      console.log("hello--", vendorProposal);
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
      {
        field: "expiresAt",
        value: expiresAt ? new Date(expiresAt) : undefined,
      },
    ];

    for (const { field, value } of fieldsToUpdate) {
      if (value !== undefined && value !== null) {
        const currentValue = collaboration[field];

        // Handle Date comparison differently
        const isDifferent =
          currentValue instanceof Date
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

    sendNotification(
      req,
      [userRole === 'creator' ? collaboration.vendorId : collaboration.creatorId],
      `New bid for product ${product?.title} from ${userRole === 'creator'? 'vendor':'creator'}`,
      userRole === 'creator'? 'vendor':'creator',
      'collaboration'
    );

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

export const updateCollaborationCrmLink = async (
  req: AuthRequest,
  res: Response
) => {
  const { collaborationId } = req.params;

  try {
    const collaboration: any = await CollaborationModel.findById(
      collaborationId
    ).populate("creatorId");
    if (!collaboration) {
      return sendApiResponse(res, 404, "Collaboration not found.");
    }

    const crmLink =
      FRONTEND_URL +
      "/creators/" +
      collaboration.creatorId.user_name +
      "/" +
      collaboration._id;

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
    console.error(
      "Error while updating collaboration status cron:",
      error.message
    );
  }
};

const activateCollaboration = async (req: AuthRequest, res: Response) => {
  const { collaborationId } = req.params;
  const { _id } = req.user;
  const userRole = req.userRole;

  try {
    const collaboration: any = await CollaborationModel.findById(
      collaborationId
    )
      .populate("bids")
      .populate("creatorId")
      .populate("vendorId")
      .populate({
        path: "productId",
        populate: [
          { path: "category", model: "Category" },
          { path: "subCategory", model: "Category" },
        ],
      });
    if (!collaboration) {
      return sendApiResponse(res, 404, "Collaboration not found.");
    }

    if (
      (userRole === "creator" && !collaboration.negotiation.agreedByVendor) ||
      (userRole === "vendor" && !collaboration.negotiation.agreedByCreator)
    ) {
      return sendApiResponse(
        res,
        400,
        "Collaboration not accepted by both parties"
      );
    }

    const channel = await ChannelModel.findOne({
      vendorId: collaboration.vendorId,
      channelType: collaboration.productId.channelName,
    });

    let crmLinkData: any;
    if (channel?.channelType === "shopify") {
      crmLinkData = await createShopifyUTMnew({
        shopUrl: channel?.channelConfig?.domain,
        productIdentifier: collaboration.productId.channelProductId,
        crmAffiliateId: collaboration.id,
        couponCode: collaboration.productId.couponCode,
        couponDiscountType: collaboration.productId.discountType,
        couponDiscountValue: collaboration.productId.discount,
      });
    } else if (channel?.channelType === "wordpress") {
      crmLinkData = await createWordpressUTM({
        token: channel?.channelConfig?.token,
        productIdentifier: collaboration.productId.channelProductId,
        crmAffiliateId: collaboration?._id,
        couponCode: collaboration.productId.couponCode,
        couponDiscountType: collaboration.productId.discountType,
        couponDiscountValue: collaboration.productId.discount,
      });
    } else {
    }

    if (crmLinkData.shareableLink) {
      collaboration.crmLink =
        FRONTEND_URL + "/product-detail/" + collaboration._id;
      collaboration.utmLink = crmLinkData.shareableLink;
      collaboration.utmLinkIdentifier = crmLinkData.utmappLinkId;
    } else {
      console.log("Error while generating UTM link", crmLinkData);
      return sendApiResponse(res, 400, "Error while generating UTM link");
    }

    collaboration.commissionValue =
      collaboration.bids[collaboration.bids.length - 1].proposal;
    collaboration.commissionType =
      collaboration.bids[collaboration.bids.length - 1].type;
    collaboration.collaborationStatus = "ACTIVE";
    collaboration.discountValue = collaboration.productId.discount;
    collaboration.discountType = collaboration.productId.discountType;
    collaboration.couponCode = collaboration.productId.couponCode;

    await collaboration.save();
    return sendApiResponse(res, 200, "Collaboration activated successfully", {
      collaboration,
    });
  } catch (e) {
    console.error("Error while accepting collaboration:", e);
    return sendApiResponse(res, 500, "Internal server error", null, e);
  }
};

export {
  requestStatusChange,
  getCollaborationStatusByProduct,
  getCollaborationById,
  activateCollaboration,
};
