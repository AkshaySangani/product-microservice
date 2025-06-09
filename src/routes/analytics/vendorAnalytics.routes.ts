import { Router } from 'express';
import { analyticsPageState, productAndCreatorSearchResultsForVendor, vendorAnalytics } from '../../controller/analytics/vendorAnalytics.controller';
import { VendorAuthMiddleware } from '../../middleware/vendorAuth.middleware';

const router = Router();

router.use('/list',VendorAuthMiddleware, vendorAnalytics); // list of analytics

router.use('/page-state',VendorAuthMiddleware, analyticsPageState); // page state

router.use('/product-and-creator-search-results',VendorAuthMiddleware, productAndCreatorSearchResultsForVendor); // product and vendor search results

export { router as vendorAnalyticsRouter };