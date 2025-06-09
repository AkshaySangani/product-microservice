import { Router } from 'express';
import { creatorAuthMiddleware } from '../../middleware/creatorAuth.middleware';
import { creatorAnalytics, creatorAnalyticsPageState, productAndVendorSearchResultsForCreator } from '../../controller/analytics/creatorAnalytics.controller';
const router = Router();

router.use('/list',creatorAuthMiddleware, creatorAnalytics); // list of analytics

router.use('/page-state',creatorAuthMiddleware, creatorAnalyticsPageState); // page state

router.use('/product-and-vendor-search-results',creatorAuthMiddleware, productAndVendorSearchResultsForCreator); // product and vendor search results

export { router as creatorAnalyticsRouter };