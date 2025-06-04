import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { WishListModel } from "../../database/model";
import { AuthRequest } from "../../types/authRequest";
import mongoose from "mongoose";

const addToWishList = async (req: Request, res: Response) => {
  try {
    const { collaborationId, userId } = req.body;

    const wishlist = await WishListModel.findOne({
      accountId: userId,
      collaborationId: collaborationId,
    });

    if (wishlist) {
      //   return sendApiResponse(res, 400, "Product already in wishlist");
      await WishListModel.deleteOne({ _id: wishlist._id });
      return sendApiResponse(res, 200, "Product removed from wishlist");
    }

    const newWishlist = new WishListModel({
      accountId: userId,
      collaborationId: collaborationId,
    });

    await newWishlist.save();
    return sendApiResponse(res, 200, "Product added to wishlist", wishlist);
  } catch (e) {
    console.error("Error while adding to wishlist", e);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const getWishlistProducts = async (req: AuthRequest, res: Response) => {
  try {
    //@ts-ignore
    const accountId = req?.headers?.account?._id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Fetch filtered wishlist
    const wishlist = await WishListModel.find({ accountId })
      .populate({
        path: "collaborationId",
        match: { collaborationStatus: "ACTIVE" },
        populate: {
          path: "productId",
          populate: {
            path: "category",
          },
        },
      })
      .skip(skip)
      .limit(limit);

    // Filter out null collaborations
    const filteredWishlist = wishlist.filter((entry) => entry.collaborationId);

    // Accurate count using aggregation
    const countResult = await WishListModel.aggregate([
      {
        $match: { accountId: new mongoose.Types.ObjectId(accountId) },
      },
      {
        $lookup: {
          from: "collaborations",
          localField: "collaborationId",
          foreignField: "_id",
          as: "collab",
        },
      },
      { $unwind: "$collab" },
      {
        $match: { "collab.collaborationStatus": "ACTIVE" },
      },
      {
        $count: "total",
      },
    ]);

    const count = countResult[0]?.total || 0;

    return sendApiResponse(res, 200, "Wishlist products fetched successfully", {
      list: filteredWishlist,
      count,
    });
  } catch (e) {
    console.error("Error while fetching wishlist products", e);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

export { addToWishList, getWishlistProducts };
