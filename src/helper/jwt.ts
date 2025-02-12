import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import sendApiResponse from '../common';
import { AdminModel } from '../database';
import { UserModel } from '../database/model/account';

// Define your secret key for JWT
const secretKey = process.env.TOKEN_KEY || '';

// Middleware function for authenticating API requests
export const authenticateMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // Get the token from the request headers
    const { authorization } = req.headers;

    if (!authorization) {
        return sendApiResponse(res, 401, "Invalid credentials");
    }

    try {
        // Verify and decode the token
        const decoded: any = jwt.verify(authorization, secretKey);
        if (decoded?._id) {
            const user: any = decoded.type === 'admin' ? await AdminModel.findOne({ _id: decoded._id }) : await UserModel.findOne({ _id: decoded._id });
            if (!user) {
                return sendApiResponse(res, 401, "Invalid credentials");
            }
            req.headers.user = user; // Correctly assign email and _id

            // Call the next middleware or route handler
            next();
        } else {
            return sendApiResponse(res, 401, "Invalid credentials");
        }
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return sendApiResponse(res, 401, "Invalid credentials");
        }
        return sendApiResponse(res, 401, "Invalid credentials");
    }
};