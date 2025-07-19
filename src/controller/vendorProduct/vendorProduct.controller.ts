import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  BidModel,
  ChannelModel,
  CollaborationModel,
  CreatorModel,
  ProductModel,
  VendorModel,
} from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import { BACKEND_URL, FRONTEND_URL } from "../../config";
import mongoose from "mongoose";
import { productValidationSchema } from "./validation/index";
import { uploadToS3 } from "../../lib/s3";
import {
  createShopifyUTMnew,
  createWordpressUTM,
  shopifyCouponUpdate,
  shopifyUpdateDiscount,
} from "../utm-link/utm.controller";

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
    };
    let categoryFilter = null;

    if (typeof categories === "string") {
      categoryFilter = categories.split(","); // Convert to array
    }

    if (categoryFilter && Array.isArray(categoryFilter)) {
      condition.category = { $in: categoryFilter };
    }

    if (search) {
      condition.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } },
      ];
    }

    // 1. Find all productIds under this brand
    const vendorProducts = await ProductModel.find({
      ...condition,
    })
      .skip(skip)
      .limit(limitNumber)
      .sort({ createdAt: -1 })
      .lean();

    const collaborations = await CollaborationModel.find({
      vendorId: vendorId,
      creatorId: req.user._id,
      productId: { $in: vendorProducts.map((item) => item._id) },
    })
      .select("productId collaborationStatus")
      .lean();

    const result = vendorProducts.map((item) => {
      const collaboration = collaborations.find(
        (collab) => collab.productId.toString() === item._id.toString()
      );
      return {
        ...item,
        collaborationStatus: collaboration
          ? collaboration.collaborationStatus
          : null,
      };
    });

    const count = await ProductModel.countDocuments({
      ...condition,
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

    // Fetch active collaboration counts for each product
    const productIds = productList.map((p) => p._id);

    const escapeCreator = await CreatorModel.findOne({
      user_name: "truereff",
    });

    const collabCounts = await CollaborationModel.aggregate([
      {
        $match: {
          productId: { $in: productIds },
          collaborationStatus: "ACTIVE",
          creatorId: { $ne: escapeCreator?._id },
        },
      },
      {
        $group: {
          _id: "$productId",
          count: { $sum: 1 },
        },
      },
    ]);

    // Map productId => count
    const countMap = new Map(
      collabCounts.map((item) => [item._id.toString(), item.count])
    );

    // Attach count to each product
    const enrichedProductList = productList.map((product) => ({
      ...product,
      activeCollabCount: countMap.get(product._id.toString()) || 0,
    }));

    // Get total count of filtered results
    const count = await ProductModel.countDocuments(productFilter);

    // Send response
    return sendApiResponse(res, 200, "Product list fetched successfully", {
      list: enrichedProductList,
      count,
    });
  } catch (error) {
    console.error("Error while getting product list by brand", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

// Controller: Add New Product for Shopify or WordPress
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

    // Check if product already exists
    const existingProduct = await ProductModel.findOne({
      channelProductId: productId,
      vendorId,
    });
    if (existingProduct) {
      return sendApiResponse(
        res,
        409,
        "Product already exists in the platform",
        { product: existingProduct }
      );
    }

    // Validate request body with schema
    const { error, value } = productValidationSchema.validate(req.body);
    if (error) {
      return sendApiResponse(res, 400, error.details[0].message);
    }

    let productData;

    // Handle Shopify products
    if (channelName === "shopify") {
      const response = await fetch(
        `${BACKEND_URL}/channel/shopify/product?productId=${productId}`,
        {
          method: "GET",
          headers: { Authorization: req.headers.authorization || "" },
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

      productData = (await response.json()).data;
      if (!productData)
        return sendApiResponse(res, 404, "No product data found");

      // Upload creator material files to S3
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let creatorMaterial: string[] = [];
      if (files?.creatorMaterial?.length) {
        const path = `vendor/${vendorId}/products/materials`;
        const uploadedFiles = await Promise.all(
          files.creatorMaterial.map((file) =>
            uploadToS3(file.buffer, file.originalname, file.mimetype, path)
          )
        );
        creatorMaterial = uploadedFiles.map((upload) => upload.url);
      }

      // Determine product status based on start date
      let status: string = "PENDING";
      const now = new Date();

      if (value.startDate) {
        const startDate = new Date(value.startDate);

        if (
          !isNaN(startDate.getTime()) &&
          now.getDate() >= startDate.getDate()
        ) {
          status = "ACTIVE";
        }
      }

      // Merge product data
      const fullProduct = {
        ...value,
        title: productData.name,
        channelProductId: productData.id,
        price: productData.variants[0].price,
        sku: productData.handle,
        description: productData.description || "",
        media: productData.images?.map((item: any) => item?.src) || [],
        channelName,
        channelProductType: productData.productType,
        channelProductVendor: productData.vendor,
        variants: productData.variants.map((item: any) => ({
          sku: item.sku,
          price: item.price,
          title: item.title,
        })),
        status: status,
        vendorId,
        creatorMaterial,
      };

      if (value.lifeTime) fullProduct.endDate = null;

      const newProduct = await ProductModel.create(fullProduct);

      await generateDefaultUTMLink(req, {
        productId: newProduct._id.toString(),
        channelType: "shopify",
      });

      return sendApiResponse(res, 201, "Product added successfully", {
        product: newProduct,
      });
    }

    // Handle WordPress products
    else if (channelName === "wordpress") {
      const response = await fetch(
        `${BACKEND_URL}/channel/wordpress/product?productId=${productId}`,
        {
          method: "GET",
          headers: { Authorization: req.headers.authorization || "" },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return sendApiResponse(
          res,
          response.status,
          "Failed to fetch WordPress product",
          { error: errorText }
        );
      }

      productData = (await response.json()).data;
      if (!productData)
        return sendApiResponse(res, 404, "No product data found");

      // Upload creator material files to S3
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let creatorMaterial: string[] = [];
      if (files?.creatorMaterial?.length) {
        const path = `vendor/${vendorId}/products/materials`;
        const uploadedFiles = await Promise.all(
          files.creatorMaterial.map((file) =>
            uploadToS3(file.buffer, file.originalname, file.mimetype, path)
          )
        );
        creatorMaterial = uploadedFiles.map((upload) => upload.url);
      }

      // Determine product status based on start date
      let status = "PENDING";
      const now = new Date();
      if (value.startDate && now >= new Date(value.startDate))
        status = "ACTIVE";

      // Merge product data
      const fullProduct = {
        ...value,
        title: productData.name,
        channelProductId: productData.id,
        price: productData.price,
        sku: productData.slug,
        description: productData.description || "",
        media: productData.images,
        channelName,
        channelProductType: productData.type,
        variantLabel: productData.variations?.slice(0, 1)?.map((ele: any) => {
          const attrs = ele.attributes ?? {};
          return Object.keys(attrs).join("/");
        })?.[0],
        variants: productData.variations?.map((ele: any) => {
          const attrs = ele.attributes ?? {};
          const values = Object.keys(attrs)
            .filter((key) => attrs[key] != null)
            .map((key) => attrs[key]);
          return {
            title: values.join("/"),
            price: ele.price,
            sku: ele.sku,
          };
        }),
        status,
        vendorId,
        creatorMaterial,
      };

      if (value.lifeTime) fullProduct.endDate = null;

      const newProduct = await ProductModel.create(fullProduct);

      await generateDefaultUTMLink(req, {
        productId: newProduct._id.toString(),
        channelType: "wordpress",
      });

      return sendApiResponse(res, 201, "Product added successfully", {
        product: newProduct,
      });
    }

    // Unsupported channel fallback
    else {
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
    // 1. Validate product ID
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return sendApiResponse(res, 400, "Valid productId is required");
    }

    // 2. Fetch product
    const product = await ProductModel.findOne({ _id: productId, vendorId });
    if (!product) {
      return sendApiResponse(res, 404, "Product not found");
    }

    // 3. Validate input body
    const { error, value } = productValidationSchema.validate(req.body);
    if (error) {
      return sendApiResponse(res, 400, error.details[0].message);
    }

    // 4. File uploads
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

    // 5. Determine status
    const now = new Date();
    let status = "PENDING";
    if (value.startDate && now >= new Date(value.startDate)) {
      status = "ACTIVE";
    } else if (value.endDate && now > new Date(value.endDate)) {
      status = "EXPIRED";
    }

    // 6. Check if UTM regeneration needed
    const hasOldCoupon = product.discount || product.discountType || product.couponCode;
    const hasNewCoupon = value.discount || value.discountType || value.couponCode;
    const isCouponChanged =
      product.discount !== value.discount ||
      product.discountType !== value.discountType ||
      product.couponCode !== value.couponCode;
    const isCouponRemoved = hasOldCoupon && !hasNewCoupon;
    const shouldUpdateUTM = isCouponChanged || isCouponRemoved;

    // 7. Prepare update payload
    const updatePayload: Partial<typeof product> = {
      ...value,
      creatorMaterial: updatedCreatorMaterial,
      status,
    };
    if (value.lifeTime) updatePayload.endDate = null;

    // 8. Regenerate UTM if coupon changes or removal
    if (shouldUpdateUTM) {
      const channel = await ChannelModel.findOne({
        vendorId: product.vendorId,
        channelType: product.channelName,
      });

      if (!channel) {
        return sendApiResponse(res, 400, "Channel not found");
      }

      const collaborations = await CollaborationModel.find({
        productId: productId,
        vendorId: product.vendorId,
      });
      console.log("collaborations", collaborations.length);
      const results: any[] = [];

      if (product.channelName === "shopify") {
        for (const collaboration of collaborations) {
          try {
            const crmLinkData = await createShopifyUTMnew({
              shopUrl: channel?.channelConfig?.domain,
              productIdentifier: product.channelProductId,
              crmAffiliateId: collaboration._id,
              couponCode: value?.couponCode,
              couponDiscountType: value?.discountType,
              couponDiscountValue: value?.discount,
            });

            results.push({
              collaborationId: collaboration._id,
              crmLinkData,
            });
          } catch (err) {
            console.error("Error generating Shopify UTM link:", err);
          }
        }
      } else if (product.channelName === "wordpress") {
        for (const collaboration of collaborations) {
          try {
            const crmLinkData = await createWordpressUTM({
              token: channel?.channelConfig?.token,
              productIdentifier: product.channelProductId,
              crmAffiliateId: collaboration?._id,
              couponCode: value?.couponCode,
              couponDiscountType: value?.discountType,
              couponDiscountValue: value?.discount,
            });

            results.push({
              collaborationId: collaboration._id,
              crmLinkData,
            });
          } catch (err) {
            console.error("Error generating WordPress UTM link:", err);
          }
        }
      }

      // ✅ Apply UTM updates
      for (const result of results) {
        if (result.crmLinkData) {
          await CollaborationModel.updateOne(
            { _id: result.collaborationId },
            {
              $set: {
                crmLink: `${FRONTEND_URL}/product-detail/${result.collaborationId}`,
                utmLink: result.crmLinkData.shareableLink,
                utmLinkIdentifier: result.crmLinkData.utmappLinkId,
                discountValue: value?.discount,
                discountType: value?.discountType,
                couponCode: value?.couponCode,
              },
            }
          );
        }
      }

      console.log("UTM link regenerated due to coupon change/removal.");
    }

    // 9. Update product
    await ProductModel.updateOne({ _id: productId, vendorId }, { $set: updatePayload });

    // 10. Return updated product
    const updatedProduct = await ProductModel.findById(productId);
    return sendApiResponse(res, 200, "Product updated successfully", {
      product: updatedProduct,
    });
  } catch (error: any) {
    console.error("Error while editing product:", error);
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
    const existingProduct = await ProductModel.findOne({
      channelProductId: productId,
      vendorId: vendorId,
    });

    const productCount = await ProductModel.countDocuments({
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

    // const planDetail: any = await planDetails(vendorId);
    // if (!planDetail) {
    //   return sendApiResponse(
    //     res,
    //     400,
    //     "Subscription not found for adding products",
    //     {
    //       subscriptionExists: false,
    //       isActive: false,
    //       productLimit: 0,
    //       productCount: productCount,
    //     }
    //   );
    // }

    // if (planDetail.status !== "active") {
    //   return sendApiResponse(res, 400, "Subscription is not active ", {
    //     subscriptionExists: true,
    //     isActive: false,
    //     productLimit: planDetail.planId.productLimit,
    //     productCount: productCount,
    //   });
    // }

    // if (productCount >= planDetail.planId.productLimit) {
    //   return sendApiResponse(
    //     res,
    //     400,
    //     "Product limit reached, upgrade plan to add more products",
    //     {
    //       subscriptionExists: true,
    //       isActive: true,
    //       productLimit: planDetail.planId.productLimit,
    //       productCount: productCount,
    //     }
    //   );
    // }

    return sendApiResponse(res, 200, "Product not found");
  } catch (error: any) {
    console.error("Error while checking existing brand product:", error);
    return sendApiResponse(res, 500, "Internal server error", {
      error: error.message || "Unknown error",
    });
  }
};

const generateDefaultUTMLink = async (
  req: AuthRequest,
  body: { productId: string; channelType: string }
) => {
  const { _id: vendorId } = req.user;
  const { productId } = body;

  try {
    // 1. Find the default creator by username (e.g., used for automated or platform-owned collaborations)
    const creator = await CreatorModel.findOne({ user_name: "truereff" });

    // 2. Find the vendor's active channel (assumes one per vendor for)
    const channel = await ChannelModel.findOne({
      vendorId: vendorId,
      channelType: body.channelType,
    });

    // 3. Fetch product data by ID
    const product: any = await ProductModel.findOne({ _id: productId });

    // 4. Create a new collaboration record
    const collaboration = await CollaborationModel.create({
      vendorId: vendorId,
      creatorId: creator?._id,
      productId: productId,
      requestedBy: "vendor", // indicating the vendor initiated the collab
      collaborationStatus: "ACTIVE",
      commissionValue: product?.commission,
      commissionType: product?.commission_type,
      discountType: product?.discountType,
      discountValue: product?.discount,
      negotiation: {
        agreedByVendor: true,
      },
    });

    // 5. Create an initial bid for the collaboration
    const newBid = new BidModel({
      proposal: product?.commission,
      type: product?.commission_type,
      sender: "vendor",
    });
    await newBid.save();

    // 6. Link the bid to the collaboration
    collaboration.bids.push(newBid._id);
    await collaboration.save();

    // 7. Generate UTM tracking link for the product via external CRM/shopify service
    let crmLinkData: any;
    if (channel?.channelType === "shopify") {
      crmLinkData = await createShopifyUTMnew({
        shopUrl: channel?.channelConfig?.domain,
        productIdentifier: product?.channelProductId,
        crmAffiliateId: collaboration?._id,
        couponCode: product?.couponCode,
        couponDiscountType: product?.discountType,
        couponDiscountValue: product?.discount,
      });
    } else if (channel?.channelType === "wordpress") {
      crmLinkData = await createWordpressUTM({
        token: channel?.channelConfig?.token,
        productIdentifier: product?.channelProductId,
        crmAffiliateId: collaboration?._id,
        couponCode: product?.couponCode,
        couponDiscountType: product?.discountType,
        couponDiscountValue: product?.discount,
      });
    } else {
    }

    // 8. If the CRM service returns a valid shareable link, update the collaboration with UTM and tracking data
    if (crmLinkData.shareableLink) {
      collaboration.crmLink =
        FRONTEND_URL + "/product-detail/" + collaboration._id;
      collaboration.utmLink = crmLinkData.shareableLink;
      collaboration.utmLinkIdentifier = crmLinkData.utmappLinkId;
    } else {
      console.log("Error while generating UTM link", crmLinkData);
    }

    // 9. Save the final state of the collaboration
    collaboration.save();
  } catch (e: any) {
    // Log any errors encountered during the process
    console.error("Error while generating default UTM link:", e);
    return e;
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
