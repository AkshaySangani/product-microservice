import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CreatorModel, CreatorProductModel, ProductModel } from "../../database/model";

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
    // Extract creator ID from URL params
    const { creatorId } = req.params;
    try {
        // Extract pagination and filters from query params
        const { page = 1, limit = 10, search, category } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;


        // Check if the creator exists
        const creator = await CreatorModel.findById(creatorId);
        if (!creator) {
            return sendApiResponse(res, 404, "Creator not found");
        }

        // Get all product IDs linked to the creator
        const creatorProducts = await CreatorProductModel.find({ creatorId }).select("productId");
        const productIds = creatorProducts.map((cp) => cp.productId);

        // Build product filter
        let productFilter: any = { _id: { $in: productIds } };

        // If search is provided, filter by title or tags
        if (search) {
            productFilter.$or = [
                { title: { $regex: search as string, $options: "i" } },
                { tags: { $in: [new RegExp(search as string, "i")] } }, // matches any tag containing the search term
            ];
        }

        // If category filter is provided
        if (category) {
            const categoryArray = Array.isArray(category) ? category : [category];
            productFilter.categories = { $in: categoryArray };
        }

        // Fetch product details from ProductModel based on filtered product IDs
        const productList = await ProductModel.find(productFilter)
            .skip(skip)
            .limit(limitNumber)
            .populate("category")
            .lean();

        // Total count for pagination
        const count = await ProductModel.countDocuments(productFilter);

        // Send final response
        return sendApiResponse(res, 200, "Product list fetched successfully", {
            data: productList,
            count
        });

    } catch (error) {
        console.error("Error while getting product list by creator", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};



export { getCreatorList, productListByCreator };