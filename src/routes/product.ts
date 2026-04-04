import { Router } from 'express';
import { categoryForSlider, getProductById, getProducts } from '../controller/product/product.controller';
import { commonAuthMiddleware } from '../middleware/commonAuth.middleware';
import { accountOptionalAuthMiddleware } from '../middleware/accountOptionalMiddleware';

const router = Router();

router.get('/all',accountOptionalAuthMiddleware, getProducts);

router.get('/category-for-slider', categoryForSlider);

router.get('/:productId', getProductById); // get product by id


export { router as productRouter };