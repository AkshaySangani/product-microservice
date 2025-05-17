import { Request, Response } from "express";
import { CollaborationModel, ProductModel } from "../../../database/model";
import sendApiResponse from "../../../common";
import { AuthRequest } from "../../../types/authRequest";

// get product list when vendor send collb request
const getCreatorWiseProductList = async (req: AuthRequest, res: Response) => {
    const { creatorId } = req.params;
    const { _id: vendorId } = req.user;

    try {
        // Fetch products for the vendor
        const productList = await ProductModel.find({ vendorId, status: "ACTIVE" });

        // Fetch collaborations between this vendor and creator
        const collaborationList = await CollaborationModel.find({ creatorId, vendorId });

        // Create a map of productId => collabStatus
        const collabMap = new Map<string, string>();
        for (const collab of collaborationList) {
            collabMap.set(collab.productId.toString(), collab.collaborationStatus); // Assuming `status` field exists
        }

        // Attach collabStatus to each product
        const productListWithCollabStatus = productList.map(product => {
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


export { getCreatorWiseProductList };