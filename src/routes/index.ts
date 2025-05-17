import { Router } from 'express';
import { tagsRouter } from './tags';
import { categoryRouter } from './category';
import { productRouter } from './product';
import { creatorProductRouter } from './creatorProduct';
import { brandProductRouter } from './brandProduct';
import { collaborationRouter } from './collaboration/collabration';
import { utmRouter } from './utm';
import { campaignRouter } from './campaign';
import { updateCollaborationCrmLink } from '../controller/collaboration/collaboration.controller';

const router = Router()

router.use('/', productRouter)

router.use('/category', categoryRouter)

router.use('/tags', tagsRouter)

router.use('/creator-product', creatorProductRouter)

router.use('/vendor-product', brandProductRouter)

router.use('/collaboration', collaborationRouter)

router.use('/utm', utmRouter)

router.use('/campaign', campaignRouter)

router.put('/generate-crm/:collaborationId',updateCollaborationCrmLink)

export { router }