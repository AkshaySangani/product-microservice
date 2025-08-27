import { Router } from 'express';
import { collaborationController } from '../../controller';
import { commonAuthMiddleware } from '../../middleware/commonAuth.middleware';
import { vendorCollaborationRouter } from './vendor';
import { creatorCollaborationRouter } from './creator';
const router = Router();

router.put('/request/status', commonAuthMiddleware, collaborationController.requestStatusChange);// accept reject collaboration request

router.get('/status/:productId', commonAuthMiddleware, collaborationController.getCollaborationStatusByProduct) // get collaboration status by product id

router.get('/:collaborationId', commonAuthMiddleware, collaborationController.getCollaborationById) // get collaboration by id

router.put('/:collaborationId', commonAuthMiddleware, collaborationController.updateCollaborationDetails) // get collaboration by id

router.use('/vendor', vendorCollaborationRouter);

router.use('/creator', creatorCollaborationRouter);

router.post('/activate/:collaborationId', commonAuthMiddleware, collaborationController.activateCollaboration)

router.put('/deactivate/:collaborationId', commonAuthMiddleware, collaborationController.deactivateCollaboration)

export { router as collaborationRouter };