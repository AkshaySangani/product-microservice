import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CategoryMappingModel, CategoryModel } from "../../database/model";

const addCategory = async (req: Request, res: Response) => {
    try {
        const { name, parentId, type } = req.body;
        if (!name) return sendApiResponse(res, 400, "Name is required");

        if(type !== "creator" && type !== "vendor") return sendApiResponse(res, 400, "Invalid type");
        
        const isExists = await CategoryModel.findOne({ name, parentId, type });
        if (isExists) return sendApiResponse(res, 400, "Category already exists");

        const category = await CategoryModel.create({ name, parentId, type });
        return sendApiResponse(res, 201, "Category added successfully", category);
    } catch (error) {
        console.error("error while add category", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

const getCategoryList = async (req: Request, res: Response) => {
    try {
        const { page, limit, parentId, all, type } = req.query;

        // Initialize query condition based on parentId
        let condition = {};
        if (parentId) condition = { parentId };
        if (!parentId && all === 'false') condition = { parentId: null };
        if(type) condition = { type };

        let list, count;

        // If page & limit provided, apply pagination
        if (page && limit) {
            const pageNumber = Number(page);
            const limitNumber = Number(limit);
            const skip = (pageNumber - 1) * limitNumber;

            list = await CategoryModel.find(condition).populate("parentId").skip(skip).limit(limitNumber).sort({ createdAt: -1 });
            count = await CategoryModel.countDocuments(condition);
        } else {
            // If no pagination, fetch all categories matching condition
            list = await CategoryModel.find(condition).populate("parentId");
            count = list.length;
        }

        return sendApiResponse(res, 200, "Category list fetched successfully", {
            data: list,
            count
        });
    } catch (error) {
        console.error("Error while fetching category list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
};

const deleteCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        const isExists = await CategoryModel.findById(categoryId);
        if (!isExists) return sendApiResponse(res, 400, "Category not found");

        const isMappingExists = await CategoryMappingModel.findOne({ $or: [{ creatorCategory: categoryId }, { vendorCategory: categoryId }] });
        if(isMappingExists) return sendApiResponse(res, 400, "Category is mapped to vendor");
        
        await CategoryModel.findByIdAndDelete(categoryId);
        return sendApiResponse(res, 200, "Category deleted successfully");
    } catch (error) {
        console.error("error while delete category", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

export { addCategory, getCategoryList, deleteCategory };