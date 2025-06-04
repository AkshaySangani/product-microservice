import { Request, Response } from "express";
import sendApiResponse from "../../common";
import { WishListModel } from "../../database/model";

const addToWishList = async (req: Request, res: Response) => {
  try {
    const { productId, userId } = req.body;

    const wishlist = await WishListModel.findOne({
      accountId: userId,
      productId: productId,
    });

    if (wishlist) {
      //   return sendApiResponse(res, 400, "Product already in wishlist");
      await WishListModel.deleteOne({ _id: wishlist._id });
      return sendApiResponse(res, 200, "Product removed from wishlist");
    }

    const newWishlist = new WishListModel({
      accountId: userId,
      productId: productId,
    });

    await newWishlist.save();
    return sendApiResponse(res, 200, "Product added to wishlist",wishlist);
  } catch (e) {
    console.error("Error while adding to wishlist", e);
    return sendApiResponse(res, 500, "Internal server error");
  }
};

const getWishlistProducts = async (req: Request, res:  Response) => {
  try{

  }catch (e){

  }
}

export { addToWishList };