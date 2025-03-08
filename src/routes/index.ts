import { Router } from 'express';
import { tagsRouter } from './tags';
import { categoryRouter } from './category';
import { productRouter } from './product';

const router = Router()

router.use('/', productRouter)

router.use('/category', categoryRouter)

router.use('/tags', tagsRouter)

export { router }