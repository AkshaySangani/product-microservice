import { Router } from 'express';
import { collaborationController } from '../controller';
import { creatorAuthMiddleware } from '../middleware/creatorAuth.middleware';
const router = Router();

router.post('/creator/request', creatorAuthMiddleware, collaborationController.creatorCollaborationRequest); // creator request for collaboration

export { router as collaborationRouter };