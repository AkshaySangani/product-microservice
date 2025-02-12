import { Router } from 'express';
import { tagsController } from '../controller';
const router = Router();

router.post('/add', tagsController.addTags); // add new category

router.get('/list', tagsController.getTagsList); // get category list

router.delete('/:tagId', tagsController.deleteTag); // delete tag

export { router as tagsRouter };