import { Router } from 'express';
import { creatorAuthMiddleware } from '../../middleware/creatorAuth.middleware';
import { cancelCollaborationRequestByCreator, sendCollaborationRequestToVendor, collaborationList, creatorSeenCollaboration } from '../../controller/collaboration/creator/creatorCollaboration.controller';
const router = Router();

router.post('/request-creator', creatorAuthMiddleware, sendCollaborationRequestToVendor); // send bid to creator

router.delete('/cancel-request/:collaborationId', creatorAuthMiddleware, cancelCollaborationRequestByCreator); // cancel collaboration request

router.get('/list', creatorAuthMiddleware, collaborationList); // get collaboration list

router.post('/seen/:collaborationId', creatorAuthMiddleware, creatorSeenCollaboration); // mark collaboration as seen

export { router as creatorCollaborationRouter };