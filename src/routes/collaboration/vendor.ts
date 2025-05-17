import { Router } from 'express';
import { VendorAuthMiddleware } from '../../middleware/vendorAuth.middleware';
import { cancelCollaborationRequestByVendor, collaborationList, getCreatorWiseProductList, sendCollaborationRequestToCreator } from '../../controller/collaboration/vendor/vendorCollaboration.controller';
const router = Router();

router.get('/creator/product/list/:creatorId', VendorAuthMiddleware, getCreatorWiseProductList); // get product list when vendor send collb request

router.post('/request-creator', VendorAuthMiddleware, sendCollaborationRequestToCreator); // send bid to creator

router.delete('/cancel-request/:collaborationId', VendorAuthMiddleware, cancelCollaborationRequestByVendor); // cancel collaboration request

router.get('/list', VendorAuthMiddleware, collaborationList); // get collaboration list

export { router as vendorCollaborationRouter };