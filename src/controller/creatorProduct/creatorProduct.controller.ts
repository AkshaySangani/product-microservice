import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CollaborationModel, CreatorModel, CreatorProductModel, ProductModel } from "../../database/model";

const getCreatorList = async (req: Request, res: Response) => {
    try {
        // Pagination
        const { page = 1, limit = 10, search, category, sub_category } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // Build filter conditions
        let filter: any = {};

        // Text search in username or full name
        if (search) {
            const searchRegex = new RegExp(search as string, "i");
            filter.$or = [
                { user_name: { $regex: searchRegex } },
                { full_name: { $regex: searchRegex } },
                { tags: { $in: [new RegExp(search as string, 'i')] } } // Match any tag using regex
            ];
        }

        // Filter by categories
        if (category) {
            const categoryArray = Array.isArray(category) ? category : [category];
            filter.category = { $in: categoryArray };
        }

        // Filter by sub-categories
        if (sub_category) {
            const subCategoryArray = Array.isArray(sub_category) ? sub_category : [sub_category];
            filter.sub_category = { $in: subCategoryArray };
        }

        // Fetch filtered creators with pagination
        const list = await CreatorModel.find(filter)
            .skip(skip)
            .limit(limitNumber)
            .populate("category")
            .populate("sub_category");

        // Count total matching creators
        const count = await CreatorModel.countDocuments(filter);

        // Success response
        return sendApiResponse(res, 200, "Creator list fetched successfully", {
            data: list,
            count
        });

    } catch (error) {
        console.error("Error while getting creator list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

const productListByCreator = async (req: Request, res: Response) => {
    const { creatorId } = req.params;

    try {
        const { page = 1, limit = 10, search, category } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // Step 1: Verify creator exists
        const creator = await CreatorModel.findById(creatorId);
        if (!creator) {
            return sendApiResponse(res, 404, "Creator not found");
        }

        // Step 2: Get product IDs linked to this creator
        const creatorProducts = await CreatorProductModel.find({ creatorId }).select("productId");
        const productIds = creatorProducts.map(cp => cp.productId);

        // Step 3: Build product filter
        let productFilter: any = { _id: { $in: productIds } };

        if (search) {
            productFilter.$or = [
                { title: { $regex: search as string, $options: "i" } },
                { tags: { $in: [new RegExp(search as string, "i")] } },
            ];
        }

        if (category) {
            const categoryArray = Array.isArray(category) ? category : [category];
            productFilter.categories = { $in: categoryArray };
        }

        // Step 4: Fetch filtered products
        const products = await ProductModel.find(productFilter)
            .skip(skip)
            .limit(limitNumber)
            .populate("category")
            .lean();

        // Step 5: Get collaborations and requests for the filtered products
        const collaborations  = await CollaborationModel.find({
            productId: { $in: products.map(p => p._id) },
            creatorId
        }).populate("requestId").lean();

        // Step 6: Map collaborations by productId for fast lookup
        const collaborationMap = new Map<string, any>();
        collaborations.forEach(collab => {
            collaborationMap.set(collab.productId.toString(), collab);
        });

        // Step 7: Attach collaboration + request to each product
        const enrichedProducts = products.map(product => {
            const collab = collaborationMap.get(product._id.toString());
            return {
                ...product,
                collaboration: collab || null,
                request: collab?.requestId || null
            };
        });

        // Step 8: Get total count
        const count = await ProductModel.countDocuments(productFilter);

        // Step 9: Send final response
        return sendApiResponse(res, 200, "Product list fetched successfully", {
            data: enrichedProducts,
            count
        });

    } catch (error) {
        console.error("Error while getting product list by creator", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};


export { getCreatorList, productListByCreator };