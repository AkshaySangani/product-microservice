import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CollaborationModel, ProductModel, RequestModel } from "../../database/model";
import { VendorProductModel } from "../../database/model";
import { CreatorProductModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import mongoose from "mongoose";

//for creator product list with request and collaboration
const getProductList = async (req: AuthRequest, res: Response) => {
    try {
        const { _id: creatorId } = req.user;

        // -------------------- Extract and Prepare Query Params --------------------
        const { page = 1, limit = 10, categories, search } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // -------------------- Build Product Filters --------------------
        let productFilter: any = {};

        if (search) {
            productFilter.$or = [
                { title: { $regex: search, $options: "i" } },
                { tags: { $in: [new RegExp(search as string, "i")] } }
            ];
        }

        // ✅ Handle comma-separated `categories` param
        if (categories) {
            const categoryArray = typeof categories === "string"
              ? categories.split(",").map((id) => id.trim())
              : [];
          
            if (categoryArray.length > 0) {
              // ✅ Cast to ObjectIds
              const objectIds = categoryArray.map((id) => new mongoose.Types.ObjectId(id));
              productFilter.category = { $in: objectIds };
            }
          }

        // -------------------- Fetch Filtered Products with Pagination --------------------
        const productList = await ProductModel.find(productFilter)
            .skip(skip)
            .limit(limitNumber)
            .populate("category")
            .lean();

        const productIds = productList.map(p => p._id);

        // -------------------- Fetch Requests & Collaborations by This Creator --------------------
        const [requests, collaborations] = await Promise.all([
            RequestModel.find({
                creatorId,
                productId: { $in: productIds }
            }).lean(),
            CollaborationModel.find({
                creatorId,
                productId: { $in: productIds }
            }).lean()
        ]);

        // -------------------- Create Lookup Maps for Request & Collaboration --------------------
        const requestMap = new Map<string, any>();
        requests.forEach(r => requestMap.set(r.productId.toString(), r));

        const collaborationMap = new Map<string, any>();
        collaborations.forEach(c => collaborationMap.set(c.productId.toString(), c));

        // -------------------- Merge Product + Vendor Info + Creator's Request/Collab --------------------
        const finalList = await Promise.all(productList.map(async (product) => {
            const vendorProduct = await VendorProductModel.findOne({ productId: product._id })
                .populate({ path: 'vendorId', select: '_id business_name' })
                .lean();

            return {
                ...product,
                vendor: vendorProduct?.vendorId || null,
                request: requestMap.get(product._id.toString()) || null,
                collaboration: collaborationMap.get(product._id.toString()) || null
            };
        }));

        // -------------------- Count Total Products for Pagination --------------------
        const count = await ProductModel.countDocuments(productFilter);

        // -------------------- Final Response --------------------
        return sendApiResponse(res, 200, "Product list fetched successfully", {
            data: finalList,
            count
        });

    } catch (error) {
        console.error("Error while fetching product list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};


const getProductById = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const product = await ProductModel.findById(productId).populate({
            path: "category",
        }).lean();
        const vendorProduct = await VendorProductModel.findOne({ productId }).select('vendorId')
        if (!product) {
            return sendApiResponse(res, 404, "Product not found");
        }
        return sendApiResponse(res, 200, "Product fetched successfully", { data: { ...product, vendorId: vendorProduct?.vendorId } });
    } catch (error) {
        console.error("Error while fetching product by id", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};


// const getProductList = async (req: AuthRequest, res: Response) => {
//     try {
//         const { page = 1, limit = 10, vendorId, creatorId, categories, tags } = req.query;
//         const pageNumber = Number(page);
//         const limitNumber = Number(limit);
//         const skip = (pageNumber - 1) * limitNumber;

//         let productFilter: any = {};

//         // Fetch vendor's products if vendorId is provided
//         if (vendorId) {
//             const vendorProducts = await VendorProductModel.find({ vendorId }).select("productId");
//             const productIds = vendorProducts.map((vp) => vp.productId);
//             productFilter._id = { $in: productIds };
//         }

//         // Fetch creator's products if creatorId is provided
//         if (creatorId) {
//             const creatorProducts = await CreatorProductModel.find({ creatorId }).select("productId");
//             const productIds = creatorProducts.map((cp) => cp.productId);
//             productFilter._id = { $in: productIds };
//         }

//         // If no vendor or creator is provided, fetch all products
//         if (!vendorId && !creatorId) {
//             productFilter = {};
//         }

//         // Apply categories filter (supporting multiple categories)
//         if (categories) {
//             const categoryArray = Array.isArray(categories) ? categories : [categories];
//             productFilter.categories = { $in: categoryArray };
//         }

//         // Apply tags filter (supporting multiple tags)
//         if (tags) {
//             const tagsArray = Array.isArray(tags) ? tags : [tags];
//             productFilter.tags = { $all: tagsArray };
//         }

//         // Fetch filtered product list
//         const list = await ProductModel.find(productFilter)
//             .skip(skip)
//             .limit(limitNumber)
//             .populate('category')
//             .lean(); // Convert to plain JavaScript objects

//         // Fetch collaboration status for each product for the logged-in creator
//         const productsWithCollaboration = await Promise.all(
//             list.map(async (product) => {
//                 const collaboration = await CollaborationModel.findOne({
//                     productId: product._id,
//                     creatorId: req.user._id, // Assuming logged-in user's creatorId is available in req.user
//                 }).select('collaborationStatus');

//                 return {
//                     ...product,
//                     collaborationStatus: collaboration ? collaboration.collaborationStatus : null
//                 };
//             })
//         );

//         const count = await ProductModel.countDocuments(productFilter);

//         return sendApiResponse(res, 200, "Product list fetched successfully", { 
//             data: productsWithCollaboration, 
//             count 
//         });
//     } catch (error) {
//         console.error("Error while fetching product list", error);
//         return sendApiResponse(res, 500, "Internal server error");
//     }
// };

export { getProductList, getProductById };
