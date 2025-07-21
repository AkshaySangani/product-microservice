import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CategoryMappingModel } from "../../database/model";

export const createCategoryMapping = async (req: Request, res: Response) => {
    try {
        const { creatorCategory, vendorCategory } = req.body;
        if(!creatorCategory || !vendorCategory) return sendApiResponse(res, 400, "Creator and vendor category are required");

        const isExists = await CategoryMappingModel.findOne({ creatorCategory, vendorCategory });
        if(isExists) return sendApiResponse(res, 400, "Category mapping already exists");

        const categoryMapping = await CategoryMappingModel.create({ creatorCategory, vendorCategory });
        return sendApiResponse(res, 201, "Category mapping created successfully", categoryMapping);
    } catch (error) {
        console.error("error while creating category mapping", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

export const getMapping = async (req: Request, res: Response) => {
    try {
        const { creatorCategory, vendorCategory} = req.query;
        if(!creatorCategory || !vendorCategory) return sendApiResponse(res, 400, "Creator and vendor category are required");

        const categoryMapping = await CategoryMappingModel.findOne({ creatorCategory, vendorCategory });
        if(!categoryMapping) return sendApiResponse(res, 400, "Category mapping not found");

        return sendApiResponse(res, 200, "Category mapping fetched successfully", categoryMapping);
    } catch (error) {
        console.error("error while getting category mapping", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

export const getMappingList = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        // if(type) condition = { type };
        const skip = (Number(page) - 1) * Number(limit);
        const limitNumber = Number(limit);
        
        const categoryMapping = await CategoryMappingModel.find({}).skip(skip).limit(limitNumber);
        const count = await CategoryMappingModel.countDocuments({});

        return sendApiResponse(res, 200, "Category mapping list fetched successfully", {
            data: categoryMapping,
            count
        });
    } catch (error) {
        console.error("error while getting category mapping list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}