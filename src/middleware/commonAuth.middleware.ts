import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import sendApiResponse from '../common';
import { SECRET_KEY } from '../config';
import { AccountModel, CreatorModel, VendorModel } from '../database/model';
import { AuthRequest } from '../types/authRequest';

/**
 * Middleware function for authenticating API requests.
 * Supports both Creators and Vendors dynamically.
 * 
 * @param req - Authenticated request object
 * @param res - Express response object
 * @param next - Next function to call the next middleware
 */
export const commonAuthMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Extract token from the "Authorization" header (Bearer <token>)
    const token = req.header("Authorization")?.split(" ")[1];
    
    if (!token) {
        return sendApiResponse(res, 401, "Access Denied. No token provided.");
    }

    try {
        // Verify and decode the JWT token
        const decoded: any = jwt.verify(token, SECRET_KEY);
        console.log("Decoded token:", decoded);

        // Find the account by ID
        const account = await AccountModel.findById(decoded._id);
        if (!account) {
            return sendApiResponse(res, 401, "Invalid credentials");
        }

        // Check user role and fetch user details accordingly
        let user: any = null;

        if (account.type === "creator") {
            user = await CreatorModel.findOne({ accountId: account._id });
        } else if (account.type === "vendor") {
            user = await VendorModel.findOne({ accountId: account._id });
        }

        // If no user found in either model, return unauthorized response
        if (!user) {
            return sendApiResponse(res, 401, "Invalid credentials");
        }

        // Attach user info to request object
        req.user = user;
        req.userRole = account.type; // Store role for further authorization checks if needed

        // Proceed to the next middleware or route handler
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return sendApiResponse(res, 401, "Token expired. Please login again.");
        }
        return sendApiResponse(res, 401, "Invalid credentials.");
    }
};
