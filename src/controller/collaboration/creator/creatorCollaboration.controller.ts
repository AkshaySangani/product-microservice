import { Response } from "express";
import sendApiResponse from "../../../common";
import { CollaborationModel, CreatorModel, ProductModel, VendorModel } from "../../../database/model";
import { AuthRequest } from "../../../types/authRequest";

// send collaboration request to vendor
const sendCollaborationRequestToVendor = async (
    req: AuthRequest,
    res: Response
  ) => {
    try {
      const { productId, vendorId } = req.body;
      const { _id: creatorId } = req.user;
  
      // Step 1: Validate input
      if (
        !productId ||
        !creatorId ||
        !vendorId
      ) {
        return sendApiResponse(res, 400, "Missing required fields");
      }
  
      // Step 2: Fetch vendor details for notification purposes
      const vendor = await VendorModel.findById(vendorId);
      if (!vendor) {
        return sendApiResponse(res, 404, "Vendor not found");
      }

      const collaboration = await CollaborationModel.findOne({
        creatorId,
        vendorId,
        productId,
      });
      if (collaboration)
        return sendApiResponse(res, 400, "Collaboration already exists");

      const newCollaboration = new CollaborationModel({
        creatorId,
        vendorId,
        productId,
        requestedBy: "creator",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
        collaborationStatus: "REQUESTED",
        commissionValue: 0,
        commissionType: "PERCENTAGE",
        negotiation: {
          agreedByCreator: true,
        },
      });

      await newCollaboration.save();
  
      // Step 5: Return results summary
      return sendApiResponse(res, 201, "Collaboration request processed", {
        collaboration: newCollaboration
      });
    } catch (error: any) {
      console.error("Collaboration creation error:", error);
      return sendApiResponse(res, 500, "Internal server error", {
        error: error.message,
      });
    }
  };
  
  // cancel collaboration request by creator
  const cancelCollaborationRequestByCreator = async (
    req: AuthRequest,
    res: Response
  ) => {
    const { collaborationId } = req.params;
    const { _id: creatorId } = req.user;

    try {
      const collaboration = await CollaborationModel.findOne({
        _id: collaborationId,
        creatorId,
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
    const { _id: creatorId } = req.user;
    const { page = 1, limit = 20, status, search } = req.query;
  
    try {
      const condition: any = {};
  
      if (status) condition.collaborationStatus = status;
  
      // Step 1: Filter by product title if `search` is passed
      if (search) {
        const matchingProducts = await ProductModel.find({
          title: { $regex: new RegExp(search as string, "i") },
          // creatorId,
        }).select("_id").lean();
  
        const productIds = matchingProducts.map((p) => p._id);
        condition.productId = { $in: productIds };
      }
  
      const collaborationList = await CollaborationModel.find({
        creatorId,
        ...condition,
      })
        .populate({
          path: "productId",
          populate: [{ path: "category", model: "Category" }],
        })
        .populate("creatorId")
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .sort({ createdAt: -1 });
  
      const count = await CollaborationModel.countDocuments({
        creatorId,
        ...condition,
      });
  
      return sendApiResponse(
        res,
        200,
        "Collaboration list fetched successfully",
        {
          list: collaborationList,
          total: count,
        }
      );
    } catch (error: any) {
      return sendApiResponse(res, 500, "Internal server error", {
        error: error.message,
      });
    }
  };

  export { sendCollaborationRequestToVendor, cancelCollaborationRequestByCreator, collaborationList };