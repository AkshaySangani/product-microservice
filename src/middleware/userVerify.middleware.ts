import { NextFunction, Request, Response } from "express";
import sendApiResponse from "../common";
import jwt from "jsonwebtoken";
import { SECRET_KEY } from "../config";

export const authenticateMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return sendApiResponse(res, 401, "Token missing or invalid");
        }

        const decodedToken: any = jwt.verify(token, SECRET_KEY);
        if (!decodedToken?._id) {
            return sendApiResponse(res, 401, "Invalid token");
        }

        // Attach user to headers
        req.headers.account = decodedToken;
        return next(); // ✅ Correctly return from here
    } catch (error) {
        console.error("Error in authenticateMiddleware:", error);
        return sendApiResponse(res, 401, "Authentication failed");
    }
};
