import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { CreatorModel, CreatorProductModel } from "../../database/model";

const getCreatorList = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const list = await CreatorModel.find().skip(skip).limit(limitNumber);
        const count = await CreatorModel.countDocuments();
        return sendApiResponse(res, 200, "Creator list fetched successfully", { data: list, count: count });
    } catch (error) {
        console.error("error while get creator list ", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}


const productListByCreator = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const skip = (pageNumber - 1) * limitNumber;

        const { creatorId } = req.params;
        const creator = await CreatorModel.findById(creatorId);
        if(!creator){
            return sendApiResponse(res, 404, "Creator not found");
        }
        
        const list = await CreatorProductModel.find({ creatorId: creatorId }).skip(skip).limit(limitNumber);
        const count = await CreatorProductModel.countDocuments({ creatorId: creatorId });
        return sendApiResponse(res, 200, "Product list fetched successfully", { data: list, count: count });
    } catch (error) {
        console.error("error while get product list by creator", error);
        return sendApiResponse(res, 500, "Internal server error");
    }
}


export { getCreatorList, productListByCreator };