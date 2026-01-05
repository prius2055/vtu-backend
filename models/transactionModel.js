const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "wallet_funding",
        "airtime",
        "data",
        "meter recharge",
        "cable recharge",
      ],
      required: true,
    },

    // Numeric provider network code (1=MTN, 2=AIRTEL, etc.)
    network: {
      type: Number,
      enum: [1, 2, 3, 4],
      required: function () {
        return ["airtime", "data"].includes(this.type);
      },
    },

    phone: {
      type: String,
      required: function () {
        return ["airtime", "data", "meter recharge", "cable recharge"].includes(
          this.type
        );
      },
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    reference: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    // Provider response
    vtuReference: String,
    vtuResponse: Object,

    description: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Transaction", TransactionSchema);
