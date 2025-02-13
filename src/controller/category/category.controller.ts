import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CategoryModel } from "../../database/model";

const addCategory = async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name) return sendApiResponse(res, 400, "Name is required");

        const isExists = await CategoryModel.findOne({ name });
        if (isExists) return sendApiResponse(res, 400, "Category already exists");

        const category = await CategoryModel.create({ name });
        return sendApiResponse(res, 201, "Category added successfully", category);
    } catch (error) {
        console.error("error while add category", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}


const getCategoryList = async (req: Request, res: Response) => {
    try {
        const { page, limit } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);

        const skip = (pageNumber - 1) * limitNumber;

        const list = await CategoryModel.find({}).skip(skip).limit(limitNumber);
        const count = await CategoryModel.countDocuments();
        return sendApiResponse(res, 200, "Category list fetched successfully", { data: list, count: count });
    } catch (error) {
        console.error("error while get category list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

const deleteCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        const isExists = await CategoryModel.findById(categoryId);
        if (!isExists) return sendApiResponse(res, 400, "Category not found");
        
        await CategoryModel.findByIdAndDelete(categoryId);
        return sendApiResponse(res, 200, "Category deleted successfully");
    } catch (error) {
        console.error("error while delete category", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

export { addCategory, getCategoryList, deleteCategory };