import { Request, Response } from "express";
import sendApiResponse from "../../common";
import {
  CategoryMappingModel,
  CollaborationModel,
  CreatorModel,
  ProductModel,
  VendorModel,
} from "../../database/model";
import { AuthRequest } from "../../types/authRequest";

const productAndVendorSearchResultsForCreator = async (
  req: Request,
  res: Response
) => {
  const { search } = req.query;
  const searchRegex = new RegExp(search as string, "i"); // case-insensitive regex

  try {
    // Vendor search: by business_name, must have completed_step 3
    const vendorQuery = VendorModel.find({
      business_name: searchRegex,
      completed_step: 3,
    })
      .limit(5)
      .lean()
      .select("business_name profile_image");

    // Build product search condition
    const productCondition: any = { status: "ACTIVE" };

    if (search) {
      productCondition.$or = [
        { title: { $regex: searchRegex } }, // match product title
        { tags: { $in: [searchRegex] } }, // match any tag (case-insensitive)
      ];
    }

    // Product search: only fetch title and media for creator display
    const productQuery = ProductModel.find(productCondition)
      .limit(10)
      .populate("category")
      .lean()
      .select("title media");

    // Execute both queries in parallel
    const [vendorList, productList] = await Promise.all([
      vendorQuery,
      productQuery,
    ]);

    return sendApiResponse(
      res,
      200,
      "Product search results fetched successfully",
      { productList, vendorList }
    );
  } catch (error) {
    console.error("Error while getting creator search results", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const productSearchResultsForCreator = async (
  req: AuthRequest,
  res: Response
) => {
  const {
    search,
    page = 1,
    limit = 20,
    vendorId,
    category,
    subCategory,
  } = req.query;

  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  try {
    const creator = await CreatorModel.findById(req.user._id)
      .select("category sub_category")
      .lean();

    const categoryMapping = await CategoryMappingModel.find({
      creatorCategory: {
        $in: [...(creator?.category || []), ...(creator?.sub_category || [])],
      },
    })
      .select("vendorCategory")
      .lean();

    const recommendedCategories = categoryMapping.map((c) => c.vendorCategory);

    const baseCondition: any = { status: "ACTIVE" };

    // Add search conditions
    const andConditions = [];

    // 1. Handle Search (Title OR Tags)
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      andConditions.push({
        $or: [
          { title: { $regex: searchRegex } },
          { tags: { $in: [searchRegex] } },
        ]
      });
    }

    // 2. Handle Vendor Filter
    if (vendorId) {
      andConditions.push({ vendorId: vendorId });
    }

    // 3. Handle Category (Category OR SubCategory)
    if (category) {
      const categoryArray = Array.isArray(category) ? category : [category];
      // Note: Usually subCategory is a different field, 
      // but keeping your logic of checking both.
      andConditions.push({
        $or: [
          { category: { $in: categoryArray } },
          { subCategory: { $in: categoryArray } },
        ]
      });
    }

    // 4. Final Query Construction
    if (andConditions.length > 0) {
      baseCondition.$and = andConditions;
    }

    // if (subCategory) {
    //   const subCategoryArray = Array.isArray(subCategory)
    //     ? subCategory
    //     : [subCategory];
    //   baseCondition.subCategory = { $in: subCategoryArray };
    // }

    let finalProductList: any[] = [];
    let productCount = 0;

    const applyHybridFeed =
      !category && !subCategory && !search && recommendedCategories.length > 0;

    if (applyHybridFeed) {
      // -----------------------------------------------
      // 🔁 INTERLEAVING LOGIC: Recommended + General Mix
      // -----------------------------------------------

      // Fetch recommended products first
      const recommendedProducts = await ProductModel.find({
        ...baseCondition,
        $or: [
          { category: { $in: recommendedCategories } },
          { subCategory: { $in: recommendedCategories } },
        ],
      })
        .limit(50)
        .populate("category")
        .sort({ createdAt: -1 })
        .lean();

      const recommendedIds = recommendedProducts.map((p) => p._id.toString());

      // Fetch general products excluding recommended
      const generalProducts = await ProductModel.find({
        ...baseCondition,
        _id: { $nin: recommendedIds },
      })
        .limit(50)
        .populate("category")
        .sort({ createdAt: -1 })
        .lean();

      // Interleave strategy: 3 recommended, 2 general
      const interleaved: any[] = [];
      let r = 0,
        g = 0;
      while (r < recommendedProducts.length || g < generalProducts.length) {
        for (let i = 0; i < 3 && r < recommendedProducts.length; i++)
          interleaved.push(recommendedProducts[r++]);
        for (let i = 0; i < 2 && g < generalProducts.length; i++)
          interleaved.push(generalProducts[g++]);
      }

      finalProductList = interleaved.slice(skip, skip + limitNumber);
      productCount = interleaved.length;
    } else {
      // ----------------------------------------------------
      // 🟩 STANDARD PRODUCT FETCH (filtered / searched case)
      // ----------------------------------------------------

      const [productListRaw, count] = await Promise.all([
        ProductModel.find(baseCondition)
          .skip(skip)
          .limit(limitNumber)
          .populate("category")
          .sort({ createdAt: -1 })
          .lean(),
        ProductModel.countDocuments(baseCondition),
      ]);

      finalProductList = productListRaw;
      productCount = count;
    }

    // -----------------------------------------
    // 🔗 Map collaborations to products
    // -----------------------------------------
    const productIds = finalProductList.map((p) => p._id);
    const collaborationMap = new Map<string, any>();

    if (productIds.length > 0) {
      const collaborationList = await CollaborationModel.find({
        productId: { $in: productIds },
        creatorId: req.user._id,
      })
        .lean()
        .select("collaborationStatus productId");

      collaborationList.forEach((collab) => {
        collaborationMap.set(collab.productId.toString(), collab);
      });
    }

    const productList = finalProductList.map((p) => ({
      ...p,
      collaboration: collaborationMap.get(p._id.toString()) || null,
    }));

    // ------------------------------------------------------
    // 💡 Suggested products (fallback when few results found)
    // ------------------------------------------------------
    let suggestedList: any = { suggestedProductList: [], total: 0 };

    if (productCount < 10 && !search && !category && !subCategory) {
      const suggestedCondition: any = {
        status: "ACTIVE",
        category: { $in: creator?.category || [] },
        subCategory: { $in: creator?.sub_category || [] },
      };

      const [suggestedRaw, suggestedCount] = await Promise.all([
        ProductModel.find(suggestedCondition)
          .skip(skip)
          .limit(limitNumber)
          .populate("category")
          .lean(),
        ProductModel.countDocuments(suggestedCondition),
      ]);

      const suggestedIds = suggestedRaw.map((p) => p._id);
      const suggestedMap = new Map<string, any>();

      if (suggestedIds.length > 0) {
        const suggestedCollabs = await CollaborationModel.find({
          productId: { $in: suggestedIds },
          creatorId: req.user._id,
        })
          .select("collaborationStatus productId")
          .lean();

        suggestedCollabs.forEach((collab) => {
          suggestedMap.set(collab.productId.toString(), collab);
        });
      }

      const suggestedProductList = suggestedRaw.map((p) => ({
        ...p,
        collaboration: suggestedMap.get(p._id.toString()) || null,
      }));

      suggestedList = {
        suggestedProductList,
        total: suggestedCount,
      };
    }

    // -----------------------------------------
    // ✅ Final response
    // -----------------------------------------
    return sendApiResponse(
      res,
      200,
      "Product search results fetched successfully",
      {
        productList: { list: productList, total: productCount },
        suggestedList,
      }
    );
  } catch (error) {
    console.error("Error while getting product search results", error);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

export {
  productSearchResultsForCreator,
  productAndVendorSearchResultsForCreator,
};
