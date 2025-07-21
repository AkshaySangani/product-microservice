import { Router } from 'express';
import { categoryController } from '../controller';
import { createCategoryMapping, getMappingList } from '../controller/category/categoryMapping.controller';
const router = Router();

router.post('/add', categoryController.addCategory); // add new category

router.get('/list', categoryController.getCategoryList); // get category list

router.delete('/:categoryId', categoryController.deleteCategory); // delete category

router.post('/mapping/create', createCategoryMapping); // create category mapping

router.get('/mapping/list', getMappingList); // get category mapping list

export { router as categoryRouter };