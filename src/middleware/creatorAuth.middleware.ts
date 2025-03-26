import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import sendApiResponse from '../common';
import { SECRET_KEY } from '../config';
import { AccountModel, CreatorModel } from '../database/model';
import { AuthRequest } from '../types/authRequest';

// Middleware function for authenticating API requests
export const creatorAuthMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Get the token from the request headers
    const token = req.header("Authorization")?.split(" ")[1]; // Extract token from "Bearer <token>"
    
    if (!token) {
        return sendApiResponse(res, 401, "Access Denied. No token provided.");
    }

    try {
        // Verify and decode the token
        const decoded: any = jwt.verify(token, SECRET_KEY);
        console.log("decoded", decoded);

        const account: any = await AccountModel.findById(decoded._id);
        if (!account) {
            return sendApiResponse(res, 401, "Invalid credentials");
        }
        if (account.type !== "creator") {
            return sendApiResponse(res, 401, "Not authorized to perform this action");
        }
        const creator: any = await CreatorModel.findOne({ accountId: account._id });
        if (!creator) {
            return sendApiResponse(res, 401, "Invalid credentials");
        }
        req.user = creator;

        // Call the next middleware or route handler
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return sendApiResponse(res, 401, "Invalid credentials");
        }
        return sendApiResponse(res, 401, "Invalid credentials");
    }
};