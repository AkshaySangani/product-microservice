import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  CampaignModel,
  CollaborationModel,
  ProductModel,
  VendorModel,
  VendorProductModel,
} from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { BACKEND_URL } from "../../config";
import mongoose from "mongoose";
import { productValidationSchema } from "./validation/index";
import { uploadToS3 } from "../../lib/s3";

const getBrandList = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search, state, city } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter for business_name
    let matchFilter: any = {};
    if (search) {
      const regex = new RegExp(search as string, "i"); // Case-insensitive regex
      matchFilter.business_name = { $regex: regex };
    }

    if (state) {
      matchFilter.state = state;
    }

    if (city) {
      matchFilter.city = city;
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

    // 3. Fetch filtered product list (raw, no pagination yet)
    const productListRaw = await ProductModel.find(productFilter)
      .populate("category")
      .lean();

    // 4. Get active campaigns for these products
    const activeCampaigns = await CampaignModel.find({
      productId: { $in: vendorProductIds },
      status: "ACTIVE",
    }).lean();

    const campaignMap = new Map<string, any>();
    activeCampaigns.forEach((c) => campaignMap.set(c.productId.toString(), c));

    // 5. Fetch creator collaborations
    const collaborations = await CollaborationModel.find({
      vendorId: brandId,
      creatorId,
      productId: { $in: vendorProductIds },
    })
      .populate("requestId")
      .lean();

    const collaborationMap = new Map<string, any>();
    collaborations.forEach((c) => {
      collaborationMap.set(c.productId.toString(), c);
    });

    // 6. Enrich products with campaign + collaboration data
    const enrichedProducts = productListRaw.map((product) => {
      const campaign = campaignMap.get(product._id.toString());
      const collab = collaborationMap.get(product._id.toString());
      const request = collab?.requestId || null;
      delete collab?.requestId;

      return {
        ...product,
        collaboration: collab || null,
        request: request || null,
        campaign: campaign
          ? { _id: campaign._id, status: campaign.status }
          : null,
        vendor: brand,
      };
    });

    // 7. Prioritize campaign products
    const campaignProducts = enrichedProducts.filter((p) => p.campaign);
    const normalProducts = enrichedProducts.filter((p) => !p.campaign);

    // Insert campaign products every 3 slots (adjust as needed)
    const mergedProducts: any[] = [];
    let cpIndex = 0,
      npIndex = 0;

    while (mergedProducts.length < enrichedProducts.length) {
      if (cpIndex < campaignProducts.length) {
        mergedProducts.push(campaignProducts[cpIndex++]);
      }
      for (let i = 0; i < 3 && npIndex < normalProducts.length; i++) {
        mergedProducts.push(normalProducts[npIndex++]);
      }
    }

    // 8. Final paginated output
    const paginated = mergedProducts.slice(skip, skip + limitNumber);

    return sendApiResponse(
      res,
      200,
      "Vendor's product list (creator-specific) with campaigns",
      {
        data: paginated,
        count: enrichedProducts.length,
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
  const { _id: vendorId } = req.user;
  const { productId, channelName } = req.body;

  try {
    // Basic field validation
    if (!productId || !channelName) {
      return sendApiResponse(
        res,
        400,
        "Product ID and channel name are required"
      );
    }

    // Check for existing product
    let existingProduct = await ProductModel.findOne({
      channelProductId: productId,
      vendorId: vendorId,
    });
    if (existingProduct) {
      return sendApiResponse(
        res,
        409,
        "Product already exists in the platform",
        { product: existingProduct }
      );
    }

    // Validate the merged product data
    const { error, value } = productValidationSchema.validate(req.body);
    if (error) {
      return sendApiResponse(res, 400, error.details[0].message);
    }

    let productData;

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
        return sendApiResponse(
          res,
          response.status,
          "Failed to fetch Shopify product",
          { error: errorText }
        );
      }

      const responseData = await response.json();
      productData = responseData.data;

      if (!productData) {
        return sendApiResponse(res, 404, "No product data found");
      }

      // Handle file uploads (e.g., profile image and banner image)
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let creatorMaterial: any[] = [];

      // Handle multiple creatorMaterial files
      if (files?.creatorMaterial?.length) {
        const path = `vendor/${vendorId}/products/materials`;

        const uploadPromises = files.creatorMaterial.map((file) =>
          uploadToS3(file.buffer, file.originalname, file.mimetype, path)
        );

        const uploadedFiles = await Promise.all(uploadPromises);
        creatorMaterial = uploadedFiles.map((upload) => upload.url);
      }

      // Merge API product data and request body (which includes metadata fields)
      const fullProduct = {
        title: productData.title,
        channelProductId: productData.id,
        sku: productData.handle,
        description: productData.description || "",
        media:
          productData.media?.nodes?.length > 0
            ? productData.media?.nodes.map((item: any) => item?.image?.url)
            : [],
        channelName,
        vendorId,
        creatorMaterial, // ⬅️ this now comes from uploaded files
        ...value, // Includes category, tags, commission, etc.
      };

      // Save the product
      const newProduct = await ProductModel.create(fullProduct);

      // // Link vendor with product
      // const existingVendorProduct = await VendorProductModel.findOne({
      //   vendorId,
      //   productId: newProduct._id,
      //   channelName,
      // });

      // if (existingVendorProduct) {
      //   return sendApiResponse(res, 409, "Vendor already added this product", {
      //     vendorProduct: existingVendorProduct,
      //   });
      // }

      // const newVendorProduct = await VendorProductModel.create({
      //   vendorId,
      //   productId: newProduct._id,
      //   channelName,
      // });

      return sendApiResponse(res, 201, "Product added successfully", {
        product: newProduct,
      });
    } else {
      return sendApiResponse(res, 400, "Unsupported channel");
    }
  } catch (error: any) {
    console.error("Error while adding product:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message || "Unknown error",
    });
  }
};

export { getBrandList, productListByBrand, addNewProduct, brandProductList };
