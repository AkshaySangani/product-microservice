import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import { ChannelModel, VendorProductModel, CollaborationModel } from "../../database/model";

const creatorCollaborationRequest = async (req: AuthRequest, res: Response) => {
    try {
        const { _id: creatorId } = req.user; // Extract creator's ID from authenticated user
        const { productId, discountType, discountValue, couponCode, expiresAt } = req.body;

        // Validate required fields
        if (!productId || !discountType || !discountValue || !couponCode || !expiresAt) {
            return sendApiResponse(res, 400, "Missing required fields");
        }

        // Find vendor associated with this product
        const vendorProduct = await VendorProductModel.findOne({ productId });

        if (!vendorProduct) {
            return sendApiResponse(res, 404, "Vendor not found for this product");
        }

        const vendorId = vendorProduct.vendorId;

        // Find the channel information for the vendor
        const channel = await ChannelModel.findOne({ vendorId, channelType: vendorProduct.channelName });

        if (!channel) {
            return sendApiResponse(res, 404, "Channel not found for this vendor");
        }

        // Ensure the collaboration is being requested for Shopify products
        if (channel.channelType === "shopify") {

            // Create a new collaboration request (status PENDING)
            const newCollaboration = new CollaborationModel({
                creatorId,
                vendorId,
                productId,
                discountType,
                discountValue,
                couponCode,
                expiresAt,
                collaborationStatus: "PENDING", // Default status: Pending vendor approval
            });

            await newCollaboration.save();

            return sendApiResponse(res, 201, "Collaboration request sent successfully", { newCollaboration });
        } else {
            return sendApiResponse(res, 400, "Collaboration is only available for Shopify products");
        }

    } catch (error: any) {
        console.error("Collaboration creation error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};


export { creatorCollaborationRequest };