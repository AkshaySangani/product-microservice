import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { TagsModel } from "../../database/model";

const addTags = async (req: Request, res: Response) => {
    try {
        const { name, categoryId } = req.body;
        if (!name) return sendApiResponse(res, 400, "Name is required");
        if (!categoryId) return sendApiResponse(res, 400, "Category is required");

        const isExists = await TagsModel.findOne({ name, category: categoryId });
        if (isExists) return sendApiResponse(res, 400, "Tags already exists");

        const tag = await TagsModel.create({ name, category: categoryId });
        return sendApiResponse(res, 201, "Tags added successfully", tag);
    } catch (error) {
        console.error("error while add tag", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

const deleteTag = async (req: Request, res: Response) => {
    try {
        const { tagId } = req.params;
        const isExists = await TagsModel.findById(tagId);
        if (!isExists) return sendApiResponse(res, 400, "Tag not found");
        
        await TagsModel.findByIdAndDelete(tagId);
        return sendApiResponse(res, 200, "Tag deleted successfully");
    } catch (error) {
        console.error("error while delete tag", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}


const getTagsList = async (req: Request, res: Response) => {
    try {
        const { page, limit, categoryId } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);

        const skip = (pageNumber - 1) * limitNumber;

        const query = categoryId ? { category: categoryId } : {};
        const list = await TagsModel.find(query).skip(skip).limit(limitNumber);
        const count = await TagsModel.countDocuments(query);
        return sendApiResponse(res, 200, "Tags list fetched successfully", { data: list, count: count });
    } catch (error) {
        console.error("error while get tag list", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}

export { addTags, getTagsList, deleteTag };