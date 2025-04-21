import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  CollaborationModel,
  ProductModel,
  VendorModel,
  VendorProductModel,
} from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { BACKEND_URL } from "../../config";
import mongoose from "mongoose";

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
      { $skip: skip }, // Pagination skip
      { $limit: limitNumber }, // Pagination limit
      {
        $lookup: {
          from: "vendorproducts",
          localField: "_id",
          foreignField: "vendorId",
          as: "products",
        },
      },
      {
        $addFields: {
          productCount: { $size: "$products" }, // Add productCount field
        },
      },
      {
        $project: {
          products: 0, // Exclude product list, only return count
        },
      },
    ]);

    // Count total matching brands
    const count = await VendorModel.countDocuments(matchFilter);

    return sendApiResponse(res, 200, "Brand list fetched successfully", {
      data: brandsWithProductCounts,
      count,
    });
  } catch (error) {
    console.error("Error while fetching brand list:", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const productListByBrand = async (req: AuthRequest, res: Response) => {
  const { _id: creatorId } = req.user;
  const { brandId } = req.params;

  try {
    const { page = 1, limit = 10, search, categories } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const brand = await VendorModel.findById(brandId).select({
      business_name: 1,
      profile_image: 1,
    });
    if (!brand) {
      return sendApiResponse(res, 404, "Brand not found");
    }

    // 1. Find all productIds under this brand
    const vendorProducts = await VendorProductModel.find({
      vendorId: brandId,
    }).select("productId");
    const vendorProductIds = vendorProducts.map((vp) =>
      vp.productId.toString()
    );

    // 2. Build filter for all brand's products
    let productFilter: any = {
      _id: { $in: vendorProductIds },
    };

    if (search) {
      productFilter.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } },
      ];
    }

    if (categories) {
      const categoryArray =
        typeof categories === "string"
          ? categories.split(",").map((id) => id.trim())
          : [];

      if (categoryArray.length > 0) {
        // ✅ Cast to ObjectIds
        const objectIds = categoryArray.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        productFilter.category = { $in: objectIds };
      }
    }

    // 3. Fetch filtered product list with pagination
    const productList = await ProductModel.find(productFilter)
      .skip(skip)
      .limit(limitNumber)
      .populate("category")
      .lean();

    // 4. Fetch creator's collaborations for this brand’s products
    const collaborations = await CollaborationModel.find({
      vendorId: brandId,
      creatorId,
      productId: { $in: vendorProductIds },
    })
      .populate("requestId")
      .lean();

    // 5. Map collaborations by productId for quick lookup
    const collaborationMap = new Map<string, any>();
    collaborations.forEach((c) => {
      collaborationMap.set(c.productId.toString(), c);
    });

    // 6. Enrich each product with collaboration if exists
    const enrichedProducts = productList.map((product) => {
      const collab = collaborationMap.get(product._id.toString());
      const request = collab?.requestId || null;
      delete collab?.requestId;
      return {
        ...product,
        collaboration: collab || null,
        request: request || null,
        vendor: brand,
      };
    });

    return sendApiResponse(
      res,
      200,
      "Vendor's product list (creator-specific) fetched successfully",
      {
        data: enrichedProducts,
        count: vendorProductIds.length,
      }
    );
  } catch (error) {
    console.error(
      "Error while getting creator-specific brand product list",
      error
    );
    return sendApiResponse(res, 500, "Internal server error");
  }
};

//My product list
const brandProductList = async (req: AuthRequest, res: Response) => {
  const { _id: brandId } = req.user; // Get brand ID from authenticated user

  try {
    // Extract pagination and filter query params
    const { page, limit, search, categories } = req.query;

    const isPaginationEnabled = page !== undefined && limit !== undefined;
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Verify if the brand/vendor exists
    const brand = await VendorModel.findById(brandId);
    if (!brand) {
      return sendApiResponse(res, 404, "Brand not found");
    }

    // Get all product IDs associated with this vendor
    const vendorProducts = await VendorProductModel.find({
      vendorId: brandId,
    }).select("productId");
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
    if (categories) {
      const categoryArray =
        typeof categories === "string"
          ? categories.split(",").map((id) => id.trim())
          : [];

      if (categoryArray.length > 0) {
        // ✅ Cast to ObjectIds
        const objectIds = categoryArray.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        productFilter.category = { $in: objectIds };
      }
    }

    // Query builder
    const query = ProductModel.find(productFilter).populate("category").lean();
    if (isPaginationEnabled) {
      query.skip(skip).limit(limitNumber);
    }

    const productList = await query;

    // Get total count of filtered results
    const count = await ProductModel.countDocuments(productFilter);

    // Send response
    return sendApiResponse(res, 200, "Product list fetched successfully", {
      data: productList,
      count,
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
      return sendApiResponse(
        res,
        400,
        "Product ID, channel name, and categories are required"
      );
    }

    let productData;

    // Fetch product details from Shopify API if channel is "shopify"
    if (channelName === "shopify") {
      const response = await fetch(
        `${BACKEND_URL}/channel/shopify/product?productId=${productId}`,
        {
          method: "GET",
          headers: {
            Authorization: req.headers.authorization || "", // Pass authorization header
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Shopify API Error:", errorText);
        return sendApiResponse(
          res,
          response.status,
          "Failed to fetch Shopify product",
          { error: errorText }
        );
      }

      const responseData = await response.json();
      if (!responseData?.data) {
        return sendApiResponse(
          res,
          404,
          "No product data found from Shopify API"
        );
      }

      productData = responseData.data;

      // Check if product already exists in the database
      let existingProduct = await ProductModel.findOne({
        channelProductId: productData.id,
        vendorId: vendorId,
      });
      if (existingProduct) {
        return sendApiResponse(
          res,
          409,
          "Product already exists in the database",
          { product: existingProduct }
        );
      }

      // Create a new product entry
      existingProduct = new ProductModel({
        channelProductId: productData.id,
        title: productData.title,
        sku: productData.handle,
        description: productData.description || "",
        media:
          productData.media?.nodes?.length > 0
            ? productData.media?.nodes.map((item: any) => item?.image?.url)
            : [],
        channelName: channelName,
        category: categories,
        tags: productData.tags || [],
        vendorId: vendorId,
      });

      await existingProduct.save();

      // Check if an entry exists in `VendorProductModel` for this vendor and product
      const existingVendorProduct = await VendorProductModel.findOne({
        vendorId: vendorId,
        productId: existingProduct._id,
        channelName: channelName,
      });

      if (existingVendorProduct) {
        return sendApiResponse(res, 409, "Vendor already added this product", {
          vendorProduct: existingVendorProduct,
        });
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
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message || "Unknown error",
    });
  }
};

export { getBrandList, productListByBrand, addNewProduct, brandProductList };
