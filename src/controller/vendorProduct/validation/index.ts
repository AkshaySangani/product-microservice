import Joi from "joi";
import mongoose from "mongoose";

const objectId = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
}, "ObjectId Validation");

export const productValidationSchema = Joi.object({
  category: Joi.array().items(objectId).required(),
  subCategory: Joi.array().items(objectId).required(),

  tags: Joi.array().items(Joi.string()).default([]),

  lifeTime: Joi.boolean().default(false),

  startDate: Joi.date().when("lifeTime", {
    is: false,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  endDate: Joi.date().when("lifeTime", {
    is: false,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  status: Joi.string()
    .valid("ACTIVE", "PENDING", "EXPIRED")
    .default("PENDING"),

  commission: Joi.number().required(),
  blockedDays: Joi.number().required(),
  commission_type: Joi.string()
    .valid("PERCENTAGE", "FIXED_AMOUNT")
    .required(),

  referenceLinks: Joi.array().items(Joi.string().uri()).default([]),

  creatorMaterial: Joi.array().items(Joi.string()).optional(),

  videoType: Joi.array().items(Joi.string()).optional(),

  channels: Joi.array()
    .items(Joi.string().valid("youtube", "instagram"))
    .required(),

  notes: Joi.string().allow(""),

  discount: Joi.number().optional(),

  discountType: Joi.string()
    .valid("PERCENTAGE", "FIXED_AMOUNT")
    .optional(),

  couponCode: Joi.string().optional(),
}).options({ stripUnknown: true });
