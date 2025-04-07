import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { ProductModel, VendorModel, VendorProductModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { BACKEND_URL } from "../../config";

const getBrandList = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // Build filter for business_name
        let matchFilter: any = {};
        if (search) {
            const regex = new RegExp(search as string, "i"); // Case-insensitive regex
            matchFilter.business_name = { $regex: regex };
        }

        // Aggregation to fetch brands with product counts
        const brandsWithProductCounts = await VendorModel.aggregate([
            { $match: matchFilter }, // Apply search filter if any
            { $skip: skip },         // Pagination skip
            { $limit: limitNumber }, // Pagination limit
            {
                $lookup: {
                    from: "VendorProduct", //  Match collection name in DB
                    localField: "_id",
                    foreignField: "vendorId",
                    as: "products"
                }
            },
            {
                $addFields: {
                    productCount: { $size: "$products" } // Add productCount field
                }
            },
            {
                $project: {
                    products: 0 // Exclude product list, only return count
                }
            }
        ]);

        // Count total matching brands
        const count = await VendorModel.countDocuments(matchFilter);

        return sendApiResponse(res, 200, "Brand list fetched successfully", {
            data: brandsWithProductCounts,
            count
        });

    } catch (error) {
        console.error("Error while fetching brand list:", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};


const productListByBrand = async (req: Request, res: Response) => {
    const { brandId } = req.params;

    try {
        // Extract pagination and filter query params
        const { page = 1, limit = 10, search, category } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // Verify if the brand/vendor exists
        const brand = await VendorModel.findById(brandId);
        if (!brand) {
            return sendApiResponse(res, 404, "Brand not found");
        }

        // Get all product IDs associated with this vendor
        const vendorProducts = await VendorProductModel.find({ vendorId: brandId }).select("productId");
        const productIds = vendorProducts.map((vp) => vp.productId);

        // Build product query filter
        let productFilter: any = { _id: { $in: productIds } };

        // If search is provided, match against title or tags (tags is an array of strings)
        if (search) {
            productFilter.$or = [
                { title: { $regex: search as string, $options: "i" } },
                { tags: { $in: [new RegExp(search as string, "i")] } }, // case-insensitive match in tags array
            ];
        }

        // If category filter is provided
        if (category) {
            const categoryArray = Array.isArray(category) ? category : [category];
            productFilter.categories = { $in: categoryArray };
        }

        // Fetch products with applied filters and pagination
        const productList = await ProductModel.find(productFilter)
            .skip(skip)
            .limit(limitNumber)
            .populate("category")
            .lean();

        // Get total count for pagination
        const count = await ProductModel.countDocuments(productFilter);

        // Return response
        return sendApiResponse(res, 200, "Product list fetched successfully", {
            data: productList,
            count
        });

    } catch (error) {
        console.error("Error while getting product list by brand", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

const brandProductList = async (req: AuthRequest, res: Response) => {
    const { _id: brandId } = req.user; // Get brand ID from authenticated user

    try {
        // Extract pagination and filter query params
        const { page = 1, limit = 10, search, category } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // Verify if the brand/vendor exists
        const brand = await VendorModel.findById(brandId);
        if (!brand) {
            return sendApiResponse(res, 404, "Brand not found");
        }

        // Get all product IDs associated with this vendor
        const vendorProducts = await VendorProductModel.find({ vendorId: brandId }).select("productId");
        const productIds = vendorProducts.map((vp) => vp.productId);

        // Build product query filter
        let productFilter: any = { _id: { $in: productIds } };

        // Apply search filter to title or tags
        if (search) {
            productFilter.$or = [
                { title: { $regex: search as string, $options: "i" } },
                { tags: { $in: [new RegExp(search as string, "i")] } },
            ];
        }

        // Apply category filter
        if (category) {
            const categoryArray = Array.isArray(category) ? category : [category];
            productFilter.categories = { $in: categoryArray };
        }

        // Fetch filtered products with pagination
        const productList = await ProductModel.find(productFilter)
            .skip(skip)
            .limit(limitNumber)
            .populate("category")
            .lean();

        // Get total count of filtered results
        const count = await ProductModel.countDocuments(productFilter);

        // Send response
        return sendApiResponse(res, 200, "Product list fetched successfully", {
            data: productList,
            count
        });

    } catch (error) {
        console.error("Error while getting product list by brand", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

const addNewProduct = async (req: AuthRequest, res: Response) => {
    const { _id: vendorId } = req.user; // Extract vendor ID from authenticated user
    const { productId, channelName, categories } = req.body; // Extract necessary fields

    try {
        // Validate required fields
        if (!productId || !channelName || !categories) {
            return sendApiResponse(res, 400, "Product ID, channel name, and categories are required");
        }

        let productData;

        // Fetch product details from Shopify API if channel is "shopify"
        if (channelName === "shopify") {
            const response = await fetch(`${BACKEND_URL}/channel/shopify/product?productId=${productId}`, {
                method: "GET",
                headers: {
                    "Authorization": req.headers.authorization || "", // Pass authorization header
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Shopify API Error:", errorText);
                return sendApiResponse(res, response.status, "Failed to fetch Shopify product", { error: errorText });
            }

            const responseData = await response.json();
            if (!responseData?.data) {
                return sendApiResponse(res, 404, "No product data found from Shopify API");
            }

            productData = responseData.data;


            // Check if product already exists in the database
            let existingProduct = await ProductModel.findOne({ sku: productData.handle });
            if (existingProduct) {
                return sendApiResponse(res, 409, "Product already exists in the database", { product: existingProduct });
            }

            // Create a new product entry
            existingProduct = new ProductModel({
                channelProductId: productData.id,
                title: productData.title,
                sku: productData.handle,
                description: productData.description || "",
                media: productData.featuredMedia?.preview?.image?.url ? [productData.featuredMedia.preview.image.url] : [],
                channelName: channelName,
                category: categories,
                tags: productData.tags || [],
            });

            await existingProduct.save();

            // Check if an entry exists in `VendorProductModel` for this vendor and product
            const existingVendorProduct = await VendorProductModel.findOne({
                vendorId: vendorId,
                productId: existingProduct._id,
                channelName: channelName,
            });

            if (existingVendorProduct) {
                return sendApiResponse(res, 409, "Vendor already added this product", { vendorProduct: existingVendorProduct });
            }

            // Add an entry in the `VendorProductModel`
            const newVendorProduct = new VendorProductModel({
                vendorId: vendorId,
                productId: existingProduct._id,
                channelName: channelName,
            });
            await newVendorProduct.save();

            // Return success response
            return sendApiResponse(res, 201, "Product added successfully", {
                product: existingProduct,
                vendorProduct: newVendorProduct,
            });
        } else {
            return sendApiResponse(res, 400, "Channel not allowed");
        }

    } catch (error: any) {
        console.error("Error while adding new product:", error);
        return sendApiResponse(res, 500, "Internal server error", { error: error.message || "Unknown error" });
    }
};

export { getBrandList, productListByBrand, addNewProduct, brandProductList };