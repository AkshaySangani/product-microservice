import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import { ChannelModel, VendorProductModel, CollaborationModel, CreatorModel, ProductModel } from "../../database/model";
import axios from "axios";
import { BACKEND_URL } from "../../config";
import { sendNotification } from "../../common/sendNotification";

const creatorCollaborationRequest = async (req: AuthRequest, res: Response) => {
    try {
        const { productId, creatorId, vendorId } = req.body;

        // Validate required fields
        if (!productId || !creatorId || !vendorId) {
            return sendApiResponse(res, 400, "Missing required fields");
        }

        // Find vendor associated with this product
        const vendorProduct: any = await VendorProductModel.findOne({ productId, vendorId }).populate('productId');

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

        // Fetch creator and vendor details
        const creator = await CreatorModel.findById(creatorId);

        // Create a new collaboration request
        const newCollaboration = new CollaborationModel({
            creatorId,
            vendorId,
            productId,
            discountType: "PERCENTAGE",
            discountValue: 0,
            couponCode: "ABCD",
            expiresAt: new Date(),
            collaborationStatus: "REQUESTED", // Default status: REQUESTED for vendor approval
        });

        await newCollaboration.save();
        await sendNotification(req, [vendorId], `New collaboration request from ${creator?.full_name} for product ${vendorProduct.productId?.title}`)

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
            .populate(userRole === 'vendor' ? 'creatorId' : 'vendorId') // Conditionally populate based on userRole
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

const requestStatusChange = async (req: AuthRequest, res: Response) => {
    // Extract collaborationId and status (accepted/rejected) from request body
    const { collaborationId, status } = req.body;
    const { _id } = req.user; // Logged-in user's ID

    try {
        // Fetch the collaboration by its ID
        const collaboration: any = await CollaborationModel.findById(collaborationId);
        if (!collaboration) {
            return sendApiResponse(res, 404, "Collaboration not found");
        }

        // Optional: Authorization check to ensure only the relevant vendor can update status
        // Uncomment this block if required
        // if (collaboration.vendorId !== _id) {
        //     return sendApiResponse(res, 403, "Unauthorized to update this collaboration");
        // }

        // Update the status to ACCEPTED
        if (status === "accepted") {
            collaboration.collaborationStatus = "PENDING";
            await collaboration.save();
        }

        // Update the status to REJECTED
        if (status === "rejected") {
            collaboration.collaborationStatus = "REJECTED";
            await collaboration.save();
        }

        // Send success response
        return sendApiResponse(res, 200, "Collaboration status updated successfully", { collaboration });
    } catch (error: any) {
        console.error("Collaboration status update error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
}

const getCollaborationStatusByProduct = async (req: AuthRequest, res: Response) => {
    const { productId } = req.params; // Extract product ID from URL parameters
    const { _id } = req.user; // Get logged-in user's ID
    const userRole = req.userRole; // Get logged-in user's role (creator or vendor)

    try {

        const product = await ProductModel.findById(productId);
        if (!product) {
            return sendApiResponse(res, 404, "Product not found");
        }

        // If the user is a creator, check for a collaboration where they are the creator
        if (userRole === "creator") {
            const collaboration = await CollaborationModel.findOne({ creatorId: _id, productId });

            return sendApiResponse(res, 200, "Collaboration status fetched successfully", {
                collaboration,
            });
        }

        // If the user is a vendor, check for a collaboration where they are the vendor
        else if (userRole === "vendor") {
            const collaboration = await CollaborationModel.findOne({ vendorId: _id, productId });

            return sendApiResponse(res, 200, "Collaboration status fetched successfully", {
                collaboration,
            });
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
        const collaboration = await CollaborationModel.findById(collaborationId)

        if (!collaboration) {
            return sendApiResponse(res, 404, "Collaboration not found.");
        }

        // Delete the collaboration
        await CollaborationModel.findByIdAndDelete(collaboration._id);

        return sendApiResponse(res, 200, "Collaboration request cancelled successfully");
    } catch (error: any) {
        console.error("Cancel collaboration request error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

export { creatorCollaborationRequest, getCollaborationList, requestStatusChange, getCollaborationStatusByProduct, cancelCollaborationRequest };