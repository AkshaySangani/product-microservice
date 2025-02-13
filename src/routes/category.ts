import { Router } from 'express';
import { categoryController } from '../controller';
const router = Router();

router.post('/add', categoryController.addCategory); // add new category

router.get('/list', categoryController.getCategoryList); // get category list

router.delete('/:categoryId', categoryController.deleteCategory); // delete category

export { router as categoryRouter };