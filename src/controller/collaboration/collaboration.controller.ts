import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import { ChannelModel, VendorProductModel, CollaborationModel } from "../../database/model";

const creatorCollaborationRequest = async (req: AuthRequest, res: Response) => {
    try {
        const { productId, creatorId, vendorId, discountType, discountValue, couponCode, expiresAt } = req.body;

        // Validate required fields
        if (!productId || !discountType || !discountValue || !couponCode || !expiresAt || creatorId || vendorId) {
            return sendApiResponse(res, 400, "Missing required fields");
        }

        // Find vendor associated with this product
        const vendorProduct = await VendorProductModel.findOne({ productId, vendorId });

        if (!vendorProduct) {
            return sendApiResponse(res, 404, "Vendor not found for this product");
        }

        // Find the channel information for the vendor
        const channel = await ChannelModel.findOne({ vendorId, channelType: vendorProduct.channelName });

        if (!channel) {
            return sendApiResponse(res, 404, "Channel not found for this vendor");
        }

        // Ensure the collaboration is being requested for Shopify products
        if (channel.channelType !== "shopify") {
            return sendApiResponse(res, 400, "Collaboration is only available for Shopify products");
        }

        // Check if collaboration already exists for the same product, vendor, and creator
        const existingCollaboration = await CollaborationModel.findOne({
            creatorId,
            vendorId,
            productId
        });

        if (existingCollaboration) {
            return sendApiResponse(res, 200, "Collaboration already exists", { data: existingCollaboration });
        }

        // Create a new collaboration request
        const newCollaboration = new CollaborationModel({
            creatorId,
            vendorId,
            productId,
            discountType,
            discountValue,
            couponCode,
            expiresAt,
            collaborationStatus: "REQUESTED", // Default status: REQUESTED for vendor approval
        });

        await newCollaboration.save();

        return sendApiResponse(res, 201, "Collaboration request sent successfully", { newCollaboration });

    } catch (error: any) {
        console.error("Collaboration creation error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

const getCollaborationList = async (req: AuthRequest, res: Response) => {
    const userRole = req.userRole; // User role (creator or vendor)
    const { _id } = req.user; // Extract user ID from authenticated request

    try {
        // Extract pagination parameters from query (default: page 1, limit 20)
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const skip = (page - 1) * limit; // Calculate offset

        // Define search condition based on user role
        const condition: any = {};
        if (userRole === "creator") {
            condition.creatorId = _id;
        } else if (userRole === "vendor") {
            condition.vendorId = _id;
        }

        // Fetch collaborations with pagination and populate related product data
        const collaborations = await CollaborationModel.find(condition)
            .populate('productId') // Populate product details
            .skip(skip) // Apply pagination offset
            .limit(limit) // Limit the number of results
            .sort({ createdAt: -1 }); // Sort by newest first

        // Count total matching records
        const total = await CollaborationModel.countDocuments(condition);

        // Send response with data and pagination info
        return sendApiResponse(res, 200, "Collaboration list fetched successfully", {
            data: collaborations,
            total
        });

    } catch (error: any) {
        console.error("Collaboration list error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};


export { creatorCollaborationRequest, getCollaborationList };