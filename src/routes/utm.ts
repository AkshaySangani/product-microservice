import { Router } from 'express';
import { utmController } from '../controller';
import { VendorAuthMiddleware } from '../middleware/vendorAuth.middleware';

const router = Router();

router.post('/create', VendorAuthMiddleware, utmController.createUTM); // create utm

export { router as utmRouter };
