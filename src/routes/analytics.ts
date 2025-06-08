import { Router } from 'express';
import { creatorAnalyticsRouter } from './analytics/creatorAnalytics.routes';
import { vendorAnalyticsRouter } from './analytics/vendorAnalytics.routes';
const router = Router();

router.use('/creator', creatorAnalyticsRouter); // creator analytics

router.use('/vendor', vendorAnalyticsRouter); // vendor analytics

export { router as analyticsRouter };