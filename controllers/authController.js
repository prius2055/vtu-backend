const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

const generateToken = (user, jwtSecret, expiresIn) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn }
  );
};

const register = async (req, res) => {
  try {
    const { firstname, lastname, email, password, confirmPassword } = req.body;
    if (!firstname || !lastname || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered.' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = await User.create({ firstname, lastname, email, password: hash, confirmPassword: hash });

    const token = generateToken(user, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);

    res.status(201).json({
      message: 'Registration successful',
      user: { id: user._id, firstname: user.firstname, lastname:user.lastname, email: user.email, profilePicture: user.userImage },
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }

};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

    const token = generateToken(user, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);

    res.json({ message: 'Login successful', token, user: { id: user._id, firstname: user.firstname, email: user.email, profilePicture: user.userImage } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// const me = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select('-password');
//     if (!user) return res.status(404).json({ message: 'User not found' });
//     res.json({ user });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
//   }
// };

module.exports = {
  register,
  login
};