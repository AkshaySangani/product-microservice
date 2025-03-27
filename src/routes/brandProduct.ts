import { Router } from 'express';
import { brandProductController } from '../controller';
import { VendorAuthMiddleware } from '../middleware/vendorAuth.middleware';
import { creatorAuthMiddleware } from '../middleware/creatorAuth.middleware';

const router = Router();

router.get('/vendor/list', brandProductController.getBrandList); // get brand list

router.get('/product/list', VendorAuthMiddleware, brandProductController.brandProductList); // get brand wise product list

router.get('/product/list/:brandId', creatorAuthMiddleware, brandProductController.productListByBrand); // get brand wise product list

router.post('/add', VendorAuthMiddleware, brandProductController.addNewProduct); // add new product

export { router as brandProductRouter };