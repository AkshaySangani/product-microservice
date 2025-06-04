import { Router } from 'express';
import { authenticateMiddleware } from '../middleware/userVerify.middleware';
import { addToWishList, getWishlistProducts } from '../controller/wishlist/wishlist.controller';

const router = Router();

router.post('/add-remove', authenticateMiddleware, addToWishList); // create utm

router.get('/list', authenticateMiddleware, getWishlistProducts)

export { router as wishListRouter };
