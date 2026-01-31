const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },

    username: { type: String, required: true },

    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      unique: true,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    userImage: {
      type: String,
      default: null,
    },

    role: {
      type: String,
      enum: ["user", "reseller", "admin"],
      default: "user",
      index: true,
    },

    upgradedToResellerAt: {
      type: Date,
      default: null,
    },

    /* =====================
       REFERRAL SYSTEM
    ====================== */

    referralCode: {
      type: String,
      unique: true,
      index: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    referralsCount: {
      type: Number,
      default: 0,
    },

    referralEarnings: {
      type: Number,
      default: 0,
    },

    commissionEarnings: {
      type: Number,
      default: 0,
    },

    hasFunded: {
      type: Boolean,
      default: false,
    },

    passwordResetToken: String,
    passwordResetExpires: Date,
    passwordChangedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", UserSchema);
