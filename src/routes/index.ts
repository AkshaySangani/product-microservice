import { Router } from 'express';
import { tagsRouter } from './tags';
import { categoryRouter } from './category';

const router = Router()

router.use('/category', categoryRouter)

router.use('/tags', tagsRouter)

export { router }