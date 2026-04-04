import { Router } from 'express';
import { tagsRouter } from './tags';
import { categoryRouter } from './category';
import { productRouter } from './product';
import { creatorProductRouter } from './creatorProduct';
import { brandProductRouter } from './brandProduct';
import { collaborationRouter } from './collaboration/collabration';
import { utmRouter } from './utm';
import { updateCollaborationCrmLink } from '../controller/collaboration/collaboration.controller';
import { wishListRouter } from './wishList';
import { analyticsRouter } from './analytics';
import { uploadMedia } from '../controller/mediaController';
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() }); // Initialize Multer without any storage configuration

const router = Router()

router.use('/', productRouter)

router.use('/category', categoryRouter)

router.use('/tags', tagsRouter)

router.use('/creator-product', creatorProductRouter)

router.use('/vendor-product', brandProductRouter)

router.use('/collaboration', collaborationRouter)

router.use('/utm', utmRouter)

router.put('/generate-crm/:collaborationId', updateCollaborationCrmLink)

router.use('/wishlist', wishListRouter)

router.use('/analytics', analyticsRouter)

router.post('/upload-media', upload.fields([
    { name: "media", maxCount: 10 },
]), uploadMedia)

export { router }