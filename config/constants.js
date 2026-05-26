require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const JWT = require('jsonwebtoken');
const BCRYPT = require('bcrypt');
const { Op, QueryTypes } = require('sequelize');
const { DataTypes } = require('sequelize');
const PATH = require('path');
const VALIDATOR = require('validatorjs');
const FS = require('fs');
const MULTER = require('multer');

// Response Codes
const HTTP_STATUS_CODE = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  SERVER_ERROR: 500,
};

const STATUS = {
  MEDIA: {
    UPLOADED: 'uploaded',
    FAIL: 'failed',
    ATTACHED: 'attached',
  },
  SQS: {
    PENDING: 'P',
    IN_PROGRESS: 'IP',
    ERROR: 'E',
  },
};

// JWT Expiry
const TOKEN_EXPIRY = {
  USER_ACCESS_TOKEN: '1d',
  ADMIN_ACCESS_TOKEN: '1d',
  USER_FORGOT_PASSWORD_TOKEN: 60 * 60, // 1 hour
  ADMIN_FORGOT_PASSWORD_TOKEN: 5 * 60, // 5 minutes
};

const REGEX = {
  PASSWORD:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,16}$/,
};

// Export constants
module.exports = {
  uuidv4,
  JWT,
  BCRYPT,
  Op,
  QueryTypes,
  DataTypes,
  PATH,
  VALIDATOR,
  FS,
  STATUS,
  REGEX,
  TOKEN_EXPIRY,
  HTTP_STATUS_CODE,
  MULTER,
};
