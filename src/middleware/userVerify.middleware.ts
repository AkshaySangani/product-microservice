import { NextFunction, Request, Response } from "express";
import sendApiResponse from "../common";
import jwt from "jsonwebtoken";
import { ENCRYPT_DECRYPT_KEY, SECRET_KEY } from "../config";

export const authenticateMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const token = req.headers.authorization?.split(" ")[1]; // Get token from Authorization header
        if (!token) {
            return sendApiResponse(res, 401, "Token missing or invalid");
        }

        const decodedToken: any = jwt.verify(token, SECRET_KEY);

        if (decodedToken?._id) {
            // const user: any = decodedToken.type === 'admin' ? await AdminModel.findOne({ _id: decoded._id }) : await UserModel.findOne({ _id: decoded._id });
            const user: any = decodedToken
            if (!user) {
                return sendApiResponse(res, 401, "Invalid credentials");
            }
            req.headers.account = user; // Correctly assign email and _id

            // Call the next middleware or route handler
            next();
        } else {
            return sendApiResponse(res, 401, "Invalid token");
        }

        next();
    } catch (error) {
        console.error("Error in verifyUserMiddleware:", error);
        res.status(401).json({ message: "Authentication failed" });
    }
};
