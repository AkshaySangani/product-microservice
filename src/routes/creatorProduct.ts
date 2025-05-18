import { Router } from "express";
import { creatorProductController } from "../controller";
import { creatorAuthMiddleware } from "../middleware/creatorAuth.middleware";
const router = Router();

router.get("/creator/list", creatorProductController.getCreatorList); // get creator list

router.get(
  "/product/list/:creatorId",
  creatorProductController.productListByCreator
); // get creator product list

router.get(
  "/product/search",
  creatorAuthMiddleware,
  creatorProductController.productAndVendorSearchResultsForCreator
); // get product search results for creator

router.get(
  "/product/list-search",
  creatorAuthMiddleware,
  creatorProductController.productSearchResultsForCreator
); // get product search results for creator

export { router as creatorProductRouter };
