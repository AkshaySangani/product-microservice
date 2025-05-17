import { Router } from "express";
import { brandProductController } from "../controller";
import { VendorAuthMiddleware } from "../middleware/vendorAuth.middleware";
import { creatorAuthMiddleware } from "../middleware/creatorAuth.middleware";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() }); // Initialize Multer without any storage configuration

const router = Router();

router.get("/vendor/list", brandProductController.getVendorList); // get getVendorList list

router.get(
  "/product/list",
  VendorAuthMiddleware,
  brandProductController.brandProductList
); // get brand wise product list

router.get(
  "/product/list/:vendorId",
  creatorAuthMiddleware,
  brandProductController.productListByVendorId
); // get vendor wise product list

router.post(
  "/check-existing-product",
  VendorAuthMiddleware,
  brandProductController.checkExistingBrandProductBeforeAdd
); // check existing product
  
router.post(
  "/add",
  VendorAuthMiddleware,
  upload.fields([
    { name: "creatorMaterial", maxCount: 10 },
  ]),
  brandProductController.addNewProduct
); // add new product

router.put(
  "/update",
  VendorAuthMiddleware,
  upload.fields([
    { name: "creatorMaterial", maxCount: 10 },
  ]),
  brandProductController.editProduct
); // add new product

export { router as brandProductRouter };
