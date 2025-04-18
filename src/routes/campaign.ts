import { Router } from 'express';
import { categoryController } from '../controller';
import { createCampaign, updateCampaign, getCampaignById, getCampaignList } from '../controller/campaign/campaign.controller';
import { VendorAuthMiddleware } from '../middleware/vendorAuth.middleware';
import multer from 'multer';
import { commonAuthMiddleware } from '../middleware/commonAuth.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() }); // Initialize Multer without any storage configuration

router.post('/add', VendorAuthMiddleware,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "images", maxCount: 3 },
  ]), createCampaign); // add new campaign

router.put('/update/:campaignId', VendorAuthMiddleware,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "images", maxCount: 3 },
  ]), updateCampaign); // update  campaign

router.get('/list', VendorAuthMiddleware, getCampaignList)

router.get('/:campaignId', commonAuthMiddleware, getCampaignById); // get campaign by id


export { router as campaignRouter };