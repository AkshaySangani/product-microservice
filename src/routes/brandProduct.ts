import { Router } from 'express';
import { brandProductController } from '../controller';
import { VendorAuthMiddleware } from '../middleware/vendorAuth.middleware';
import { creatorAuthMiddleware } from '../middleware/creatorAuth.middleware';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.get('/vendor/list', brandProductController.getBrandList); // get brand list

router.get('/product/list', VendorAuthMiddleware, brandProductController.brandProductList); // get brand wise product list

router.get('/product/list/:brandId', creatorAuthMiddleware, brandProductController.productListByBrand); // get brand wise product list

router.post('/add', upload.fields([{ name: 'creatorMaterial', maxCount: 10 }]), VendorAuthMiddleware, brandProductController.addNewProduct); // add new product

export { router as brandProductRouter };