const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  confirmPassword: { type: String, required: true },
    userImage: {
    type: String,
    default: null,
  },
  role: { type: String, enum: ['user','admin','agent'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;
