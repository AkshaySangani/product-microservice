import { Router } from 'express';
import { connectShopifyStore } from '../controller/shopify';
import { getShopifyProductList } from '../controller/shopify/shopifyProduct';
const router = Router();

router.post('/connect', connectShopifyStore); // connect shopify store

router.post('/list', getShopifyProductList); // get category list

export { router as shopifyRouter };