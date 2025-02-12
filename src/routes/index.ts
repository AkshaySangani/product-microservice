import { Router } from 'express';
import { tagsRouter } from './tags';

const router = Router()

router.use('/tags', tagsRouter)

export { router }