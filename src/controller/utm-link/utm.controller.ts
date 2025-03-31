import { Response } from "express";
import sendApiResponse from "../../common";
import { ChannelModel, CollaborationModel, CreatorModel, VendorProductModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import axios from "axios";
import { BACKEND_URL } from "../../config";

/**
 * @desc Generate UTM link for a collaboration (only if the vendor's channel is Shopify)
 * @route POST /api/collaboration/generate-utm
 * @access Private (Vendor only)
 */
export const createUTM = async (req: AuthRequest, res: Response) => {
    try {
        const { collaborationId } = req.body;
        const { _id: vendorId } = req.user;

        if (!collaborationId) {
            return sendApiResponse(res, 400, "Collaboration ID is required");
        }

        // Find the collaboration
        const collaboration = await CollaborationModel.findById(collaborationId);

        if (!collaboration) {
            return sendApiResponse(res, 404, "Collaboration not found");
        }

        // Ensure the collaboration belongs to the vendor
        if (collaboration.vendorId.toString() !== vendorId.toString()) {
            return sendApiResponse(res, 403, "Unauthorized: Vendor does not own this collaboration");
        }

        // Check if collaboration is already active
        if (collaboration.collaborationStatus === "ACTIVE") {
            return sendApiResponse(res, 409, "Collaboration is already active", { collaboration });
        }

        // Find vendor product associated with this collaboration
        const vendorProduct: any = await VendorProductModel.findOne({ vendorId, productId: collaboration.productId }).populate('productId'); // Ensure 'Product' is correctly referenced

        if (!vendorProduct) {
            return sendApiResponse(res, 404, "Vendor product not found");
        }

        // Find the vendor's channel
        const channel = await ChannelModel.findOne({ vendorId, productId: collaboration.productId });

        if (!channel) {
            return sendApiResponse(res, 404, "Channel not found for this vendor");
        }
        console.log("channel-->", channel)
        // Ensure collaboration is only generated for Shopify
        if (channel.channelType === "shopify") {
            const creator: any = await CreatorModel.findById(collaboration.creatorId);

            const response: any = await fetch(`${BACKEND_URL}/channel/shopify/utm/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": req.headers.authorization || "", // Pass authorization header
                },
                body: JSON.stringify({
                    id: vendorProduct.productId,
                    discount_type: collaboration.discountType,
                    discount_value: collaboration.discountValue,
                    coupon_code: collaboration.couponCode,
                    commission_percentage: collaboration.commissionPercentage,
                    expires_at: collaboration.expiresAt,
                    product_id: vendorProduct.productId.channelProductId,
                    creator_id: collaboration.creatorId,
                    creator_name: creator?.full_name,
                    collaboration_id: collaboration._id,
                    shop: channel.channelConfig.domain,
                    access_token: channel.channelConfig.access_token,
                }),
            });

            // Check if the response is ok (status in the range 200-299)
            if (!response.ok) {
                const errorData = await response.json(); // Parse the error response
                return sendApiResponse(res, response.status, errorData.message || "Error generating UTM link");
            }

            console.log("response", response);

            // Update collaboration with UTM link and set status to ACTIVE
            // collaboration.utmLink = utmLink;
            // collaboration.collaborationStatus = "ACTIVE";

            // await collaboration.save();

            // return sendApiResponse(res, 201, "UTM link generated successfully", { collaboration });
        } else {
            return sendApiResponse(res, 400, "UTM links can only be generated for Shopify channels");
        }

    } catch (error: any) {
        console.error("Error generating UTM link:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};


