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

const getVendorList = async (req: Request, res: Response) => {
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

const productListByVendorId = async (req: AuthRequest, res: Response) => {
  const { vendorId } = req.params;

  try {
    const { page = 1, limit = 10, search, categories } = req.query;
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const condition: any = {
      vendorId: vendorId,
      status: "ACTIVE",
    }
    let categoryFilter =null;

    if (typeof categories === "string") {
      categoryFilter = categories.split(","); // Convert to array
    }
    
    if (categoryFilter && Array.isArray(categoryFilter)) {
      condition.category = { $in: categoryFilter };
    }

    if(search){
      condition.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } },
      ];
    }

    // 1. Find all productIds under this brand
    const vendorProducts = await ProductModel.find({
      ...condition
    }).skip(skip).limit(limitNumber).sort({createdAt: -1}).lean();

    const collaborations = await CollaborationModel.find({
      vendorId: vendorId,
      creatorId: req.user._id,
      productId: { $in: vendorProducts.map((item) => item._id) },
    }).select("productId collaborationStatus").lean();


   const result = vendorProducts.map((item) => {
    const collaboration = collaborations.find((collab) => collab.productId.toString() === item._id.toString());
    return {
      ...item,
      collaborationStatus: collaboration ? collaboration.collaborationStatus : null,
    };
   });
    
    const count = await ProductModel.countDocuments({
      ...condition
    });

    return sendApiResponse(res, 200, "Product list fetched successfully", {
      list: result,
      total: count,
    });

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

    // Build product query filter
    let productFilter: any = { vendorId: brandId };

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
        productFilter.subCategory = { $in: objectIds };
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
      list: productList,
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
        title: productData.name,
        channelProductId: productData.id,
        price: productData.variants[0].price,
        sku: productData.handle,
        description: productData.description || "",
        media:
          productData.images?.length > 0
            ? productData.images?.map((item: any) => item?.image?.src)
            : [],
        channelName,
        channelProductType: productData.productType,
        channelProductVendor: productData.vendor,
        variants: productData.variants.map((item: any) => ({
          sku: item.sku,
          price: item.price,
          title: item.title,
        })),
        vendorId,
        creatorMaterial, // ⬅️ this now comes from uploaded files
        ...value, // Includes category, tags, commission, etc.
      };

      if(value.lifeTime){
        fullProduct.endDate = null;
      }

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

const editProduct = async (req: AuthRequest, res: Response) => {
  const { _id: vendorId } = req.user;
  const { productId } = req.body;

  try {
    // Basic validation
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return sendApiResponse(res, 400, "Valid productId is required");
    }

    // Fetch product
    const product = await ProductModel.findOne({ _id: productId, vendorId });
    if (!product) {
      return sendApiResponse(res, 404, "Product not found");
    }

    // Validate input
    const { error, value } = productValidationSchema.validate(req.body);
    if (error) {
      return sendApiResponse(res, 400, error.details[0].message);
    }

    // Handle file updates
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let updatedCreatorMaterial = product.creatorMaterial || [];

    if (files?.creatorMaterial?.length) {
      const path = `vendor/${vendorId}/products/materials`;
      const uploadPromises = files.creatorMaterial.map((file) =>
        uploadToS3(file.buffer, file.originalname, file.mimetype, path)
      );
      const uploadedFiles = await Promise.all(uploadPromises);
      updatedCreatorMaterial = uploadedFiles.map((file) => file.url);
    }

    // Build update object
    const updatePayload: Partial<typeof product> = {
      ...value,
      creatorMaterial: updatedCreatorMaterial,
    };

    if(value.lifeTime){
      updatePayload.endDate = null;
    }

    // Update product
    const updatedProduct = await ProductModel.findByIdAndUpdate(
      productId,
      { $set: updatePayload },
      { new: true }
    );

    return sendApiResponse(res, 200, "Product updated successfully", {
      product: updatedProduct,
    });
  } catch (error: any) {
    console.error("Error updating product:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message || "Unknown error",
    });
  }
};

const checkExistingBrandProductBeforeAdd = async (
  req: AuthRequest,
  res: Response
) => {
  const { _id: vendorId } = req.user;
  const { productId } = req.body;
  try {
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

    return sendApiResponse(res, 200, "Product not found");
  } catch (error: any) {
    console.error("Error while checking existing brand product:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message || "Unknown error",
    });
  }
};

export {
  getVendorList,
  productListByVendorId,
  addNewProduct,
  brandProductList,
  editProduct,
  checkExistingBrandProductBeforeAdd,
};
