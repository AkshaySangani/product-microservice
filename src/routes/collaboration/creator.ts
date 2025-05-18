import { Router } from 'express';
import { creatorAuthMiddleware } from '../../middleware/creatorAuth.middleware';
import { cancelCollaborationRequestByCreator, sendCollaborationRequestToVendor } from '../../controller/collaboration/creator/collaboration.controller';
const router = Router();

// router.get('/creator/product/list/:creatorId', creatorAuthMiddleware, getCreatorWiseProductList); // get product list when vendor send collb request

router.post('/request-creator', creatorAuthMiddleware, sendCollaborationRequestToVendor); // send bid to creator

router.delete('/cancel-request/:collaborationId', creatorAuthMiddleware, cancelCollaborationRequestByCreator); // cancel collaboration request

// router.get('/list', creatorAuthMiddleware, collaborationList); // get collaboration list

export { router as creatorCollaborationRouter };