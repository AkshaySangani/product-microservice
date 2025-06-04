import { Router } from 'express';
import { authenticateMiddleware } from '../middleware/userVerify.middleware';
import { addToWishList } from '../controller/wishlist/wishlist.controller';

const router = Router();

router.post('/add-remove', authenticateMiddleware, addToWishList); // create utm

export { router as wishListRouter };
