import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { ProductModel } from "../../database/model";
import { VendorProductModel } from "../../database/model";
import { CreatorProductModel } from "../../database/model";

const getProductList = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10, vendorId, creatorId, categories, tags } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        let productFilter: any = {};

        // Fetch vendor's products if vendorId is provided
        if (vendorId) {
            const vendorProducts = await VendorProductModel.find({ vendorId }).select("productId");
            const productIds = vendorProducts.map((vp) => vp.productId);
            productFilter._id = { $in: productIds };
        }

        // Fetch creator's products if creatorId is provided
        if (creatorId) {
            const creatorProducts = await CreatorProductModel.find({ creatorId }).select("productId");
            const productIds = creatorProducts.map((cp) => cp.productId);
            productFilter._id = { $in: productIds };
        }

        // If no vendor or creator is provided, fetch all products
        if (!vendorId && !creatorId) {
            productFilter = {};
        }

        // Apply categories filter (supporting multiple categories)
        if (categories) {
            const categoryArray = Array.isArray(categories) ? categories : [categories];
            productFilter.categories = { $in: categoryArray };
        }

        // Apply tags filter (supporting multiple tags)
        if (tags) {
            const tagsArray = Array.isArray(tags) ? tags : [tags];
            productFilter.tags = { $all: tagsArray };
        }

        // Fetch filtered product list
        const list = await ProductModel.find(productFilter).skip(skip).limit(limitNumber);
        const count = await ProductModel.countDocuments(productFilter);

        return sendApiResponse(res, 200, "Product list fetched successfully", { data: list, count });
    } catch (error) {
        console.error("Error while fetching product list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

const getProductById = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const product = await ProductModel.findById(productId);
        if (!product) {
            return sendApiResponse(res, 404, "Product not found");
        }
        return sendApiResponse(res, 200, "Product fetched successfully", { data: product });
    } catch (error) {
        console.error("Error while fetching product by id", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

export { getProductList, getProductById };
