const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const Wallet = require('../models/walletModel');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;
  user.confirmPassword = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    user,
  });
};

const register = async (req, res) => {
  try {
    const { fullName, username, email, phone, address, referralCode, password} = req.body;

    console.log(req.body)

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: 'fail',
        message: 'User already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      fullName,
      username,
      email,
      phone,
      address,
      referralCode,
      password: hashedPassword
    });

    // Create wallet for user
    await Wallet.create({
      user: user._id,
      balance: 0
    });

    createSendToken(user, 201, res);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect email or password'
      });
    }

    createSendToken(user, 200, res);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

const getMe = async (req, res) => {
  try {
    // req.user is set by the protect middleware
    const user = await User.findById(req.user.id).select('-password');
    
    res.status(200).json({
      status: 'success',
      user
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
};

// Verify token endpoint
const verify = async (req, res) => {
  try {
    res.status(200).json({
      status: 'success',
      message: 'Token is valid',
      user: req.user
    });
  } catch (error) {
    res.status(401).json({
      status: 'fail',
      message: 'Invalid token'
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  verify,
};