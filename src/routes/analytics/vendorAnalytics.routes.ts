import { Router } from 'express';
import { vendorAnalytics } from '../../controller/analytics/vendorAnalytics.controller';
import { VendorAuthMiddleware } from '../../middleware/vendorAuth.middleware';
const router = Router();

router.use('/list',VendorAuthMiddleware, vendorAnalytics); // add new category

export { router as vendorAnalyticsRouter };