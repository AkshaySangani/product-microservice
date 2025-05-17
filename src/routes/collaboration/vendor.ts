import { Router } from 'express';
import { VendorAuthMiddleware } from '../../middleware/vendorAuth.middleware';
import { getCreatorWiseProductList } from '../../controller/collaboration/vendor/vendorCollaboration.controller';
const router = Router();

router.get('/creator/product/list', VendorAuthMiddleware, getCreatorWiseProductList); // get product list when vendor send collb request


export { router as vendorCollaborationRouter };