import { Router } from 'express';
import { collaborationController } from '../controller';
import { creatorAuthMiddleware } from '../middleware/creatorAuth.middleware';
import { commonAuthMiddleware } from '../middleware/commonAuth.middleware';
const router = Router();

router.post('/creator/request', commonAuthMiddleware, collaborationController.creatorCollaborationRequest); // creator request for collaboration

router.get('/list', commonAuthMiddleware, collaborationController.getCollaborationList); // get creator/vendor wise collaboration list

export { router as collaborationRouter };