const User = require('../model/User');

const {
  VALIDATOR,
  HTTP_STATUS_CODE,
  BCRYPT,
  TOKEN_EXPIRY,
  PATH,
  uuidv4,
} = require('../../config/constants');
const { VALIDATION_RULES } = require('../../config/validationRules');
const { generateToken } = require('../helpers/auth/generateToken');

module.exports = {
  /**
   * @name login
   * @file AuthController.js
   * @param {Request} req
   * @param {Response} res
   * @throwsF
   * @description User Login(User Panel)
   */
  login: async (req, res) => {
    try {
      //get email password from body
      let { email, password } = req.body;

      /* The code block you mentioned is performing validation on the `email` and `password` fields
         received in the request body. */
      let validationObject = {
        email: VALIDATION_RULES.USERS.EMAIL,
        password: VALIDATION_RULES.USERS.PASSWORD,
      };

      let validationData = {
        email,
        password,
      };

      let validation = new VALIDATOR(validationData, validationObject);

      if (validation.fails()) {
        //if any rule is violated
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Validation error',
          data: '',
          error: validation.errors.all(),
        });
      }

      /* The code is using the `findOne` method to find a user in the `Users` collection
        based on role. */
      let user = await User.findOne({
        where: {
          email: email.toLowerCase(),
          isDeleted: false,
        },
        attributes: ['id', 'password', 'isActive', 'name', 'city'],
      });

      /* This code block is checking if the user is found in the database or not. If the user is not
         found, it returns a response with a status code of 400 (Bad Request) */
      if (!user) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Invalid email or password',
          data: '',
          error: '',
        });
      }

      //if user is not active then send error response
      if (!user.isActive) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'User is not active',
          data: '',
          error: '',
        });
      }

      /* This code is comparing the password entered by the user with the hashed password stored in the
         database for the user. */
      const comparePassword = await BCRYPT.compare(password, user.password);

      /* This code block is checking if the entered password matches the hashed password stored in the
      database for the user. If the passwords do not match, it returns a response with a status code
      of 400 (Bad Request) */
      if (!comparePassword) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Invalid Password',
          data: '',
          error: '',
        });
      }

      /* The `payload` object is used to store the user data that will be used to generate a token.*/
      const payload = {
        id: user.id,
        email: email.toLowerCase(),
        name: user.name,
        city: user.city,
      };

      /* This code is generating access and refresh tokens for the user.*/
      const token = await generateToken(
        payload,
        TOKEN_EXPIRY.USER_ACCESS_TOKEN
      );

      /* The code is updating the user's token and last
         login timestamp in the database. */
      await user.update({ token, lastLoginAt: Math.floor(Date.now() / 1000) });

      //return response
      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Login successful',
        data: { user: payload, token },
        error: '',
      });
    } catch (error) {
      //log error
      console.error('Login error:', error);
      //return error response
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: '',
        data: '',
        error: error.message,
      });
    }
  },

  /**
   * @name logout
   * @file AuthController.js
   * @param {Request} req
   * @param {Response} res
   * @description User Logout(User Panel)
   */
  logout: async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(HTTP_STATUS_CODE.UNAUTHORIZED).json({
          status: HTTP_STATUS_CODE.UNAUTHORIZED,
          message: 'Unauthorized',
          data: '',
          error: '',
        });
      }

      await user.update({ token: null });

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Logout successful',
        data: '',
        error: '',
      });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: '',
        data: '',
        error: error.message,
      });
    }
  },

  /**
   * @name register
   * @file AuthController.js
   * @param {Request} req
   * @param {Response} res
   * @throwsF
   * @description User Registration(User Panel)
   */
  register: async (req, res) => {
    try {
      let { name, email, password, city } = req.body;

      // Validation
      let validationObject = {
        name: VALIDATION_RULES.USERS.NAME,
        email: VALIDATION_RULES.USERS.EMAIL,
        password: VALIDATION_RULES.USERS.PASSWORD,
        city: VALIDATION_RULES.USERS.CITY,
      };

      let validationData = { name, email, password, city };

      let validation = new VALIDATOR(validationData, validationObject);

      if (validation.fails()) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'Validation error',
          data: '',
          error: validation.errors.all(),
        });
      }

      // 🔍 Check if user already exists
      let existingUser = await User.findOne({
        where: {
          email: email.toLowerCase(),
          isDeleted: false,
        },
      });

      if (existingUser) {
        return res.status(HTTP_STATUS_CODE.BAD_REQUEST).json({
          status: HTTP_STATUS_CODE.BAD_REQUEST,
          message: 'User already registered',
          data: '',
          error: '',
        });
      }

      // 🔐 Hash password
      const hashedPassword = await BCRYPT.hash(password, 10);

      // 🆔 Generate UUID
      const userId = uuidv4();

      // 🎟️ Generate token
      const payload = {
        id: userId,
        email: email.toLowerCase(),
        name: name,
        city: city,
      };

      const token = await generateToken(
        payload,
        TOKEN_EXPIRY.USER_ACCESS_TOKEN
      );

      // 🧾 Create new user
      await User.create({
        id: userId,
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        city,
        isActive: true,
        isDeleted: false,
        createdAt: Math.floor(Date.now() / 1000),
        createdBy: userId,
        token: token,
      });

      // Response
      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'User registered successfully',
        data: {
          user: payload,
          token,
        },
        error: '',
      });
    } catch (error) {
      console.log(error);
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: '',
        data: '',
        error: error.message,
      });
    }
  },

  /**
   * @name updateProfile
   * @file AuthController.js
   * @param {Request} req
   * @param {Response} res
   * @description Update User Profile (User Panel)
   */
  updateProfile: async (req, res) => {
    try {
      const user = req.user;
      const { name, city } = req.body;

      if (!user) {
        return res.status(HTTP_STATUS_CODE.UNAUTHORIZED).json({
          status: HTTP_STATUS_CODE.UNAUTHORIZED,
          message: 'Unauthorized',
          data: '',
          error: '',
        });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (city !== undefined) updates.city = city;

      await user.update(updates);

      const payload = {
        id: user.id,
        email: user.email,
        name: user.name,
        city: user.city,
      };

      return res.status(HTTP_STATUS_CODE.OK).json({
        status: HTTP_STATUS_CODE.OK,
        message: 'Profile updated successfully',
        data: { user: payload },
        error: '',
      });
    } catch (error) {
      console.error('Update profile error:', error);
      return res.status(HTTP_STATUS_CODE.SERVER_ERROR).json({
        status: HTTP_STATUS_CODE.SERVER_ERROR,
        message: '',
        data: '',
        error: error.message,
      });
    }
  },
};
