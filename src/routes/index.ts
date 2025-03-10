import { Router } from 'express';
import { tagsRouter } from './tags';
import { categoryRouter } from './category';
import { productRouter } from './product';
import { shopifyRouter } from './shopify';
const router = Router()

router.use('/', productRouter)

router.use('/category', categoryRouter)

router.use('/tags', tagsRouter)

router.use('/shopify', shopifyRouter)

export { router }