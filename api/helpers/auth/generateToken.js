const { JWT, PATH } = require('../../../config/constants');

const generateToken = async function (payload, expiry) {
  try {
    const token = await JWT.sign(
      //payload
      payload,

      //secret key
      process.env.JWT_SECRET,

      //expiration time
      {
        expiresIn: expiry,
      }
    );

    return token;
  } catch (error) {
    //log error in database

    throw error;
  }
};

module.exports = { generateToken };
