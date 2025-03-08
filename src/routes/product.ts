import { Router } from 'express';
import { getProductById, getProductList } from '../controller/product/product.controller';
const router = Router();

router.get('/list', getProductList); // get product list

router.get('/:productId', getProductById); // get product by id

export { router as productRouter };