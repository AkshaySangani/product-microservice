import { Router } from 'express';
import { tagsRouter } from './tags';
import { categoryRouter } from './category';
import { productRouter } from './product';
import { creatorProductRouter } from './creatorProduct';
import { brandProductRouter } from './brandProduct';

const router = Router()

router.use('/', productRouter)

router.use('/category', categoryRouter)

router.use('/tags', tagsRouter)

router.use('/creator-product', creatorProductRouter)

router.use('/vendor-product', brandProductRouter)

export { router }