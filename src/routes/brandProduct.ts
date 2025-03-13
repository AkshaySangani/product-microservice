import { Router } from 'express';
import { brandProductController } from '../controller';
const router = Router();

router.get('/brand/list', brandProductController.getBrandList); // get brand list

router.get('/product/list/:brandId', brandProductController.productListByBrand); // get brand wise product list

export { router as brandProductRouter };