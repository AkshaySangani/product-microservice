import { Router } from 'express';
import { collaborationController } from '../controller';
import { creatorAuthMiddleware } from '../middleware/creatorAuth.middleware';
import { commonAuthMiddleware } from '../middleware/commonAuth.middleware';
const router = Router();

router.post('/creator/request', commonAuthMiddleware, collaborationController.collaborationRequest); // creator request for collaboration

router.delete('/request/cancel/:collaborationId', commonAuthMiddleware, collaborationController.cancelCollaborationRequest); // cancel collaboration request

router.put('/request/status', commonAuthMiddleware, collaborationController.requestStatusChange);// accept reject collaboration request

router.get('/list', commonAuthMiddleware, collaborationController.getCollaborationList); // get creator/vendor wise collaboration list

router.get('/status/:productId', commonAuthMiddleware, collaborationController.getCollaborationStatusByProduct) // get collaboration status by product id

router.get('/:collaborationId', commonAuthMiddleware, collaborationController.getCollaborationById) // get collaboration by id

router.put('/:collaborationId', commonAuthMiddleware, collaborationController.updateCollaborationDetails) // get collaboration by id

export { router as collaborationRouter };