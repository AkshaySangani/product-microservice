import { Request } from "express";
import { CreatorModel, VendorModel } from "../database/model";
import { Document } from "mongoose";

type VendorType = Document & typeof VendorModel.prototype;
type CreatorType = Document & typeof CreatorModel.prototype;

export interface AuthRequest extends Request {
    user?: VendorType | CreatorType;
}