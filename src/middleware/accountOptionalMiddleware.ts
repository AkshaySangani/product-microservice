import { AccountModel, CreatorModel } from "../database/model";
import { AuthRequest } from "../types/authRequest";
import jwt from "jsonwebtoken";
import sendApiResponse from "../common";
import { SECRET_KEY } from "../config";
import { NextFunction, Response } from "express";

// Optional authentication middleware for users
export const accountOptionalAuthMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    const token = req.header("Authorization")?.split(" ")[1];

    // If token is not provided, continue without user
    if (!token) {
      req.user = null;
      return next();
    }
  
    try {
      const decoded: any = jwt.verify(token, SECRET_KEY);
  
      const account: any = await AccountModel.findById(decoded._id);
      if (account ) {
        req.user = account;
      }
      return next();
    } catch (error) {
      console.error("Auth error:", error);
      req.user = null; // gracefully allow unauthenticated access
      next();
    }
  };