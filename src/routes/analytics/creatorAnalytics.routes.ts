import { Router } from 'express';
import { creatorAuthMiddleware } from '../../middleware/creatorAuth.middleware';
import { creatorAnalytics, creatorAnalyticsPageState } from '../../controller/analytics/creatorAnalytics.controller';
const router = Router();

router.use('/list',creatorAuthMiddleware, creatorAnalytics); // list of analytics

router.use('/page-state',creatorAuthMiddleware, creatorAnalyticsPageState); // page state

export { router as creatorAnalyticsRouter };