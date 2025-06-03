import { Router } from 'express';
import { getProductById, getProductList, getProducts } from '../controller/product/product.controller';
import { commonAuthMiddleware } from '../middleware/commonAuth.middleware';

const router = Router();

router.get('/list',commonAuthMiddleware, getProductList); // get product list

router.get('/all', getProducts);

router.get('/:productId', getProductById); // get product by id


export { router as productRouter };