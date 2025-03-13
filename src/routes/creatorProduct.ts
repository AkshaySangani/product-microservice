import { Router } from 'express';
import { creatorProductController } from '../controller';
const router = Router();

router.get('/creator/list', creatorProductController.getCreatorList); // get creator list

router.get('/product/list/:creatorId', creatorProductController.productListByCreator); // get creator product list

export { router as creatorProductRouter };