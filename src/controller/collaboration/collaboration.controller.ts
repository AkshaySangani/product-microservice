import { Response } from "express";
import sendApiResponse from "../../common";
import { AuthRequest } from "../../types/authRequest";
import { ChannelModel, VendorProductModel, CollaborationModel, CreatorModel, ProductModel, RequestModel } from "../../database/model";
import axios from "axios";
import { BACKEND_URL } from "../../config";
import { sendNotification } from "../../common/sendNotification";

const collaborationRequest = async (req: AuthRequest, res: Response) => {
    try {
        const { productIds, creatorId, vendorId } = req.body;
        const userRole = req.userRole; // Can be "CREATOR" or "VENDOR"

        // Step 1: Validate input
        if (!Array.isArray(productIds) || productIds.length === 0 || !creatorId || !vendorId) {
            return sendApiResponse(res, 400, "Missing required fields");
        }

        // Step 2: Fetch creator details for notification purposes
        const creator = await CreatorModel.findById(creatorId);
        if (!creator) {
            return sendApiResponse(res, 404, "Creator not found");
        }

        // Step 3: Define who is sending the request
        const requestFrom = userRole === "VENDOR" ? "VENDOR" : "CREATOR";

        // Step 4: Process each productId separately
        const results = await Promise.all(
            productIds.map(async (productId: string) => {
                try {
                    // 4a. Check vendor-product association
                    const vendorProduct: any = await VendorProductModel.findOne({ productId, vendorId }).populate("productId");
                    if (!vendorProduct) return { error: `Vendor not found for product ${productId}` };

                    // 4b. Check the channel (must be Shopify)
                    const channel = await ChannelModel.findOne({ vendorId, channelType: vendorProduct.channelName });
                    if (!channel) return { error: `Channel not found for vendor ${vendorId}` };
                    if (channel.channelType !== "shopify") return { error: `Only Shopify products are supported` };

                    // 4c. Check for existing collaboration
                    const existing = await CollaborationModel.findOne({ creatorId, vendorId, productId });
                    if (existing) return { message: `Collaboration already exists for product ${vendorProduct.productId?.title}`, existing: true };

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
                        discountType: "PERCENTAGE",
                        discountValue: 0,
                        couponCode: "ABCD", // TODO: Replace with dynamic code generation if needed
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
                        collaborationStatus: "REQUESTED",
                        commissionPercentage: 0,
                    });

                    await newCollaboration.save();

                    // 4f. Send notification to vendor  
                    await sendNotification(
                        req,
                        [vendorId],
                        `New collaboration request from ${creator.full_name} for product ${vendorProduct.productId?.title}`
                    );

                    return { message: `Collaboration created for product ${vendorProduct.productId?.title}`, data: {collaboration: newCollaboration, request: newRequest} };
                } catch (innerError) {
                    console.error("Error in product processing:", innerError);
                    return { error: `Internal error while processing product ${productId}` };
                }
            })
        );

        // Step 5: Return results summary
        return sendApiResponse(res, 201, "Collaboration request processed", { results });

    } catch (error: any) {
        console.error("Collaboration creation error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

const getCollaborationList = async (req: AuthRequest, res: Response) => {
    const userRole = req.userRole; // User role: "creator" or "vendor"
    const { _id } = req.user; // Authenticated user ID

    try {
        // Step 1: Pagination setup
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Step 2: Build query condition based on user role
        const condition: any = {};
        if (userRole === "creator") {
            condition.creatorId = _id;
        } else if (userRole === "vendor") {
            condition.vendorId = _id;
        }

        // Step 3: Fetch collaborations
        const collaborations = await CollaborationModel.find(condition)
            .populate({
                path: 'productId',
                populate: { path: 'category' } // Product category
            })
            .populate(userRole === 'vendor' ? {
                path: 'creatorId',
                select: 'name email profileImage' // Add the fields you want here
              } : {
                path: 'vendorId',
                select: 'business_name logo website' // Add the fields you want here
              }) // Populate opposite user
            .populate('requestId') // 👈 New: include associated Request data
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Step 4: Count total results for pagination
        const total = await CollaborationModel.countDocuments(condition);

        // Step 5: Respond with data
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
    const { collaborationId, status } = req.body;
    const { _id, userRole } = req.user; // Logged-in user's ID and role

    try {
        // -------------------- Fetch Collaboration --------------------
        const collaboration: any = await CollaborationModel.findById(collaborationId);
        if (!collaboration) {
            return sendApiResponse(res, 404, "Collaboration not found");
        }

        // -------------------- Role-Based Ownership Check --------------------
        if (userRole === "vendor" && String(collaboration.vendorId) !== String(_id)) {
            return sendApiResponse(res, 403, "Unauthorized: Not your collaboration");
        }

        if (userRole === "creator" && String(collaboration.creatorId) !== String(_id)) {
            return sendApiResponse(res, 403, "Unauthorized: Not your collaboration");
        }

        // -------------------- Update Acceptance Flags --------------------
        if (status === "accepted") {
            if (userRole === "vendor") {
                collaboration.agreedByVendor = true;
            } else if (userRole === "creator") {
                collaboration.agreedByCreator = true;
            }
        } else if (status === "rejected") {
            if (userRole === "vendor") {
                collaboration.agreedByVendor = false;
            } else if (userRole === "creator") {
                collaboration.agreedByCreator = false;
            }

            // If either party rejects, mark collaboration as REJECTED
            collaboration.collaborationStatus = "REJECTED";
            await collaboration.save();
            return sendApiResponse(res, 200, "Collaboration rejected", { collaboration });
        }

        // -------------------- If Both Agreed, Mark as PENDING --------------------
        if (collaboration.agreedByVendor && collaboration.agreedByCreator) {
            collaboration.collaborationStatus = "PENDING";
        }

        await collaboration.save();

        // -------------------- Final Response --------------------
        return sendApiResponse(res, 200, "Collaboration status updated successfully", { collaboration });

    } catch (error: any) {
        console.error("Collaboration status update error:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message });
    }
};

const getCollaborationStatusByProduct = async (req: AuthRequest, res: Response) => {
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
            const collaboration = await CollaborationModel.findOne({ creatorId: _id, productId });

            return sendApiResponse(res, 200, "Collaboration status fetched successfully", {
                collaboration,
            });
        }

        // If the user is a vendor, check for a collaboration where they are the vendor
        else if (userRole === "vendor") {
            if (!creatorId) {
                return sendApiResponse(res, 400, "Creator id missing");
            }
            const collaboration = await CollaborationModel.findOne({ vendorId: _id, productId, creatorId });

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

export { collaborationRequest, getCollaborationList, requestStatusChange, getCollaborationStatusByProduct, cancelCollaborationRequest };