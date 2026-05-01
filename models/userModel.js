const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },

    username: { type: String, required: true },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true, // ✅ keep for fast lookup, but NOT unique alone
    },

    phone: {
      type: String,
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

    transactionPin: {
      type: String,
      select: false,
    },

    pinIsSet: {
      type: Boolean,
      default: false,
    },

    pinAttempts: {
      type: Number,
      default: 0,
    },

    pinLockedUntil: {
      type: Date,
      default: null,
    },

    /* ─────────────────────────────────────────
     * MULTI-TENANT LINK
     * Every user belongs to exactly one marketer.
     * null = direct platform user (superadmin use only)
     * ───────────────────────────────────────── */
    marketerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Marketer",
      default: null,
      index: true,
    },

    /* ─────────────────────────────────────────
     * ROLES
     * user        → regular end user
     * reseller    → user who can resell services
     * marketer    → affiliate marketer (has own Marketer doc)
     * superadmin  → platform owner
     * ───────────────────────────────────────── */
    role: {
      type: String,
      enum: ["user", "reseller", "marketer", "superadmin"],
      default: "user",
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },

    upgradedToResellerAt: Date,

    /* ─────────────────────────────────────────
     * WALLET
     * ───────────────────────────────────────── */
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ─────────────────────────────────────────
     * REFERRAL SYSTEM
     * referralCode is unique across the whole platform.
     * referredBy links to the user who referred them.
     * ───────────────────────────────────────── */
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // allows multiple null values safely
      index: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    referralsCount: { type: Number, default: 0 },
    referralEarnings: { type: Number, default: 0 },
    commissionEarnings: { type: Number, default: 0 },

    hasFunded: { type: Boolean, default: false },

    /* ─────────────────────────────────────────
     * PASSWORD RESET
     * ───────────────────────────────────────── */
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: Date,
  },
  {
    timestamps: true,
  },
);

/* ─────────────────────────────────────────────────────────────
 * INDEXES
 *
 * Scoped uniqueness: email and phone must be unique PER marketer,
 * not globally. This means the same email/phone can exist on
 * different marketer platforms without conflicts.
 *
 * NOTE: The old indexes used { store: 1, ... } — replaced with
 * { marketerId: 1, ... } to match the multi-tenant field.
 * ───────────────────────────────────────────────────────────── */
UserSchema.index({ marketerId: 1, email: 1 }, { unique: true });
UserSchema.index({ marketerId: 1, phone: 1 }, { unique: true });
UserSchema.index({ marketerId: 1, username: 1 }, { unique: true });

/* ─────────────────────────────────────────────────────────────
 * METHODS
 * ───────────────────────────────────────────────────────────── */

// Check if password was changed after a JWT was issued
UserSchema.methods.passwordChangedAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

/* ─────────────────────────────────────────
 * TRANSACTION PIN METHODS
 * ───────────────────────────────────────── */

// Set PIN (hash it)
UserSchema.methods.setTransactionPin = async function (pin) {
  this.transactionPin = await bcrypt.hash(pin, 12);
  this.pinIsSet = true;
};

// Compare PIN
UserSchema.methods.correctPin = async function (enteredPin) {
  return await bcrypt.compare(enteredPin, this.transactionPin);
};

module.exports = mongoose.model("User", UserSchema);
