// const mongoose = require("mongoose");

// const epinSchema = new mongoose.Schema(
//   {
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },

//     network: String,
//     amount: Number,

//     pin: {
//       type: String,
//       unique: true,
//       required: true,
//     },

//     serial: String,

//     batchRef: String, // purchase batch

//     status: {
//       type: String,
//       enum: ["available", "printed", "sold"],
//       default: "available",
//     },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("Epin", epinSchema);

const mongoose = require("mongoose");

const epinSchema = new mongoose.Schema(
  {
    /* ─────────────────────────────
     * OWNERSHIP
     * Each pin belongs to the user
     * who purchased it, scoped to
     * their marketer platform.
     * ───────────────────────────── */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    marketerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Marketer",
      required: true,
      index: true,
    },

    /* ─────────────────────────────
     * PIN DETAILS
     * ───────────────────────────── */
    network: {
      type: String,
      enum: ["MTN", "AIRTEL", "GLO", "9MOBILE"],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      index: true,
    },

    pin: {
      type: String,
      required: true,
      unique: true,        // ✅ kept from your original — pins are globally unique
    },

    serial: {
      type: String,
    },

    /* ─────────────────────────────
     * BATCH REFERENCE
     * Groups pins from the same
     * purchase together.
     * batchRef matches the
     * Transaction.reference for
     * the purchase that created them.
     * ───────────────────────────── */
    batchRef: {
      type: String,
      index: true,
    },

    /* ─────────────────────────────
     * LIFECYCLE STATUS
     *
     * available → pin purchased, ready to use
     * printed   → pin sent/printed to customer
     * used      → pin redeemed (replaces "sold"
     *             from your original — matches
     *             epinsController markUsed fn)
     * ───────────────────────────── */
    status: {
      type: String,
      enum: ["available", "printed", "used"],  // ✅ "sold" → "used" to match controller
      default: "available",
      index: true,
    },

    // Auto-set when status transitions — see pre-save middleware below
    printedAt: {
      type: Date,
      default: null,
    },

    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ─────────────────────────────────────────────────────────────
 * COMPOUND INDEXES
 *
 * 1. Primary query pattern in getEPins:
 *    user + marketerId + network + amount + status
 *
 * 2. Batch summary in getEPinBatches:
 *    batchRef + status
 * ───────────────────────────────────────────────────────────── */
epinSchema.index({ user: 1, marketerId: 1, network: 1, amount: 1, status: 1 });
epinSchema.index({ batchRef: 1, status: 1 });

/* ─────────────────────────────────────────────────────────────
 * PRE-SAVE MIDDLEWARE
 * Auto-timestamps when status changes — avoids having to
 * manually set printedAt/usedAt in every controller call.
 * Only fires on .save() not on findOneAndUpdate/updateMany.
 * ───────────────────────────────────────────────────────────── */
epinSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    if (this.status === "printed" && !this.printedAt) {
      this.printedAt = new Date();
    }
    if (this.status === "used" && !this.usedAt) {
      this.usedAt = new Date();
    }
  }
  next();
});

module.exports = mongoose.model("Epin", epinSchema);