// src/utils/validators.js
import Joi from "joi";

/**
 * Schemas for validation
 * Use with middleware/validate.js
 */

export const registerSchema = Joi.object({
  name: Joi.string().min(2).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(3).required(), // ⚠️ kept light since plaintext
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const otpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
});

export const quoteSchema = Joi.object({
  from: Joi.string().required(),
  to: Joi.string().required(),
  parcel: Joi.object({
    weight: Joi.number().positive().required(),
    length: Joi.number().positive().required(),
    width: Joi.number().positive().required(),
    height: Joi.number().positive().required(),
    value: Joi.number().min(0).default(0),
    contents: Joi.string().allow(""),
  }).optional(),
  freight: Joi.object({
    mode: Joi.string().valid("air", "sea", "road"),
    pallets: Joi.number().min(1).default(1),
    length: Joi.number().positive(),
    width: Joi.number().positive(),
    height: Joi.number().positive(),
    weight: Joi.number().positive(),
    incoterm: Joi.string(),
  }).optional(),
  serviceLevel: Joi.string().valid("standard", "express", "priority"),
});

export const updateUserSchema = Joi.object({
  name: Joi.string().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  address: Joi.string().optional(),
  role: Joi.string().valid("user", "admin").optional(),
  isVerified: Joi.boolean().optional(),
});
