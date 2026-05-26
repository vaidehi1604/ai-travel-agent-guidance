const { REGEX } = require('./constants');

const VALIDATION_RULES = {
  USERS: {
    ID: 'required|string',
    EMAIL: 'required|string|email',
    COUNTRY_CODE: 'required|string',
    PHONE: 'required|string',
    PASSWORD: [
      'required',
      'string',
      'min:8',
      'max:16',
      `regex:${REGEX.PASSWORD}`,
    ],
    FORGOT_PWD_TOKEN: 'required|string',
    CITY:'string|required',
    NAME:'string|required',
  },
}

module.exports = { VALIDATION_RULES };