import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { VendorModel, VendorProductModel } from "../../database/model";

const getBrandList = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        // Aggregation to fetch brands along with product counts
        const brandsWithProductCounts = await VendorModel.aggregate([
            { $skip: skip }, 
            { $limit: limitNumber },
            {
                $lookup: {
                    from: "VendorProduct", //  Match collection name in DB
                    localField: "_id",
                    foreignField: "vendorId",
                    as: "products"
                }
            },
            {
                $addFields: { productCount: { $size: "$products" } } // Add product count field
            },
            {
                $project: { products: 0 } //  Exclude product list, only send count
            }
        ]);

        const count = await VendorModel.countDocuments(); //  Total brand count

        return sendApiResponse(res, 200, "Brand list fetched successfully", {
            data: brandsWithProductCounts,
            count
        });

    } catch (error) {
        console.error("Error while fetching brand list:", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

const productListByBrand = async (req: Request, res: Response)=>{
    try{
        const {page = 1, limit = 10} = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const { brandId } = req.params;
        const brand = await VendorModel.findById(brandId);
        if(!brand){
            return sendApiResponse(res, 404, "Brand not found");
        }
        const list = await VendorProductModel.find({ vendorId: brandId }).skip(skip).limit(limitNumber).populate("productId");
        const count = await VendorProductModel.countDocuments({ vendorId: brandId });
        return sendApiResponse(res, 200, "Product list fetched successfully", { data: list, count: count });
    }catch(error){
        console.error("error while get product list by brand", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}


export { getBrandList, productListByBrand };