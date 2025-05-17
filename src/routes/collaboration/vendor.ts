import { Router } from 'express';
import { VendorAuthMiddleware } from '../../middleware/vendorAuth.middleware';
import { getCreatorWiseProductList, sendCollaborationRequestToCreator } from '../../controller/collaboration/vendor/vendorCollaboration.controller';
const router = Router();

router.get('/creator/product/list', VendorAuthMiddleware, getCreatorWiseProductList); // get product list when vendor send collb request

router.post('/request-creator', VendorAuthMiddleware, sendCollaborationRequestToCreator); // send bid to creator

export { router as vendorCollaborationRouter };