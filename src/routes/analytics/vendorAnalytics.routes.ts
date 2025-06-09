import { Router } from 'express';
import { analyticsPageState, vendorAnalytics } from '../../controller/analytics/vendorAnalytics.controller';
import { VendorAuthMiddleware } from '../../middleware/vendorAuth.middleware';
const router = Router();

router.use('/list',VendorAuthMiddleware, vendorAnalytics); // list of analytics

router.use('/page-state',VendorAuthMiddleware, analyticsPageState); // page state


export { router as vendorAnalyticsRouter };