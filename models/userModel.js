const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  phone: { type: Number, unique: true, required: true },
  address: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  referralCode: { type: String, unique: true },
    userImage: {
    type: String,
    default: null,
  },
  role: { type: String, enum: ['user','admin','agent'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;
