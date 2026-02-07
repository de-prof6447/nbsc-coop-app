import Joi from "joi";

export const loginSchema = Joi.object({
  sap_no: Joi.string().trim().min(3).max(30).required(),
  password: Joi.string().min(6).max(100).required()
});

export const changePasswordSchema = Joi.object({
  current_password: Joi.string().min(6).max(100).required(),
  new_password: Joi.string().min(8).max(100).required()
});

export const memberCreateSchema = Joi.object({
  sap_no: Joi.string().trim().min(3).max(30).required(),
  full_name: Joi.string().trim().min(3).max(120).required(),
  phone_no: Joi.string().trim().allow("").max(30),
  role: Joi.string().valid("ADMIN","MEMBER").required(),
  password: Joi.string().min(8).max(100).required()
});

export const memberUpdateSchema = Joi.object({
  full_name: Joi.string().trim().min(3).max(120).required(),
  phone_no: Joi.string().trim().allow("").max(30),
  role: Joi.string().valid("ADMIN","MEMBER").required()
});

export const tlrCreateSchema = Joi.object({
  sap_no: Joi.string().trim().min(3).max(30).required(),
  // Accept ISO date (YYYY-MM-DD) or common template formats like 25-Dec / 26-Jan (year inferred server-side)
  date: Joi.string().trim().min(3).max(30).required(),
  // Template description like "4588 Thrift loan-KADUNA" or "4589 Thrift MembrshpFee-K"
  description: Joi.string().trim().min(3).max(200).required(),
  // Amount can be negative for loan disbursed (as per template)
  amount: Joi.number().required(),
  remark: Joi.string().allow("").max(300)
});

