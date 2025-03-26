import { Router } from 'express';
import { brandProductController } from '../controller';
import { VendorAuthMiddleware } from '../middleware/vendorAuth.middleware';

const router = Router();

router.get('/vendor/list', brandProductController.getBrandList); // get brand list

router.get('/product/list/:brandId', brandProductController.productListByBrand); // get brand wise product list

router.post('/add', VendorAuthMiddleware, brandProductController.addNewProduct); // add new product

export { router as brandProductRouter };