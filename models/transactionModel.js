// const mongoose = require("mongoose");

// const TransactionSchema = new mongoose.Schema(
//   {
//     /* --------------------------------------------------
//      * USER
//      * -------------------------------------------------- */
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//       index: true,
//     },

//     /* --------------------------------------------------
//      * TRANSACTION TYPE
//      * -------------------------------------------------- */
//     type: {
//       type: String,
//       enum: [
//         "wallet_funding",
//         "airtime",
//         "data",
//         "meter recharge",
//         "cable recharge",
//         "referral_bonus",
//       ],
//       required: true,
//     },

//     /* --------------------------------------------------
//      * SERVICE PLAN (DATA / AIRTIME / CABLE)
//      * -------------------------------------------------- */
//     servicePlan: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "ServicePlan",
//     },

//     /* --------------------------------------------------
//      * NETWORK (VTU PROVIDER CODE)
//      * 1 = MTN, 2 = AIRTEL, 3 = GLO, 4 = 9MOBILE
//      * -------------------------------------------------- */
//     network: {
//       type: String,
//       enum: ["MTN", "AIRTEL", "GLO", "9MOBILE"],
//       required: function () {
//         return ["airtime", "data"].includes(this.type);
//       },
//     },

//     /* --------------------------------------------------
//      * PHONE / SMART CARD / METER NUMBER
//      * -------------------------------------------------- */
//     phone: {
//       type: String,
//       required: function () {
//         return ["airtime", "data", "meter recharge", "cable recharge"].includes(
//           this.type,
//         );
//       },
//     },

//     /* --------------------------------------------------
//      * AMOUNT CHARGED TO USER
//      * -------------------------------------------------- */
//     amount: {
//       type: Number,
//       required: true,
//       min: 0,
//     },

//     /* --------------------------------------------------
//      * PRICING BREAKDOWN (VERY IMPORTANT)
//      * -------------------------------------------------- */
//     providerPrice: {
//       type: Number,
//       default: 0,
//     },

//     sellingPrice: {
//       type: Number,
//       default: 0,
//     },

//     profit: {
//       type: Number,
//       default: 0,
//     },

//     /* --------------------------------------------------
//      * METER / CABLE SPECIFIC FIELDS
//      * -------------------------------------------------- */
//     disco: String, // e.g. Abuja Electric
//     meterNumber: String,
//     meterType: {
//       type: Number,
//       enum: [1, 2], // 1 = PREPAID, 2 = POSTPAID
//     },
//     meterAddress: String,
//     customerName: String,
//     cableName: String,

//     /* --------------------------------------------------
//      * TRANSACTION REFERENCES
//      * -------------------------------------------------- */
//     reference: {
//       type: String,
//       unique: true,
//       required: true,
//       index: true,
//     },

//     vtuReference: String,
//     vtuResponse: Object,

//     /* --------------------------------------------------
//      * STATUS
//      * -------------------------------------------------- */
//     status: {
//       type: String,
//       enum: ["pending", "success", "failed"],
//       default: "pending",
//       index: true,
//     },

//     description: String,
//   },
//   {
//     timestamps: true,
//   },
// );

// module.exports = mongoose.model("Transaction", TransactionSchema);

const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    /* --------------------------------------------------
     * USER
     * -------------------------------------------------- */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* --------------------------------------------------
     * TRANSACTION TYPE
     * -------------------------------------------------- */
    type: {
      type: String,
      enum: [
        "wallet_funding",
        "airtime",
        "data",
        "meter recharge",
        "cable recharge",
        "referral_bonus",
        "upgrade to reseller",
        "commission",
      ],
      required: true,
      index: true,
    },

    /* --------------------------------------------------
     * SERVICE / PLAN
     * -------------------------------------------------- */
    servicePlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServicePlan",
    },

    /* --------------------------------------------------
     * PROVIDER DETAILS
     * -------------------------------------------------- */
    network: {
      type: String,
      enum: ["MTN", "AIRTEL", "GLO", "9MOBILE"],
      required: function () {
        return ["airtime", "data"].includes(this.type);
      },
    },

    disco: {
      type: String,
      required: function () {
        return this.type === "meter recharge";
      },
    },

    cableName: {
      type: String,
      required: function () {
        return this.type === "cable recharge";
      },
    },

    /* --------------------------------------------------
     * IDENTIFIERS (CLEAN & EXPLICIT)
     * -------------------------------------------------- */
    phone: {
      type: String,
      required: function () {
        return ["airtime", "data", "meter recharge", "cable recharge"].includes(
          this.type,
        );
      },
    },

    meterNumber: {
      type: String,
      required: function () {
        return this.type === "meter recharge";
      },
    },

    smartCardNumber: {
      type: String,
      required: function () {
        return this.type === "cable recharge";
      },
    },

    /* --------------------------------------------------
     * CUSTOMER DETAILS
     * -------------------------------------------------- */
    customerName: String,
    meterAddress: String,

    /* --------------------------------------------------
     * METER SPECIFIC
     * -------------------------------------------------- */
    meterType: {
      type: Number,
      enum: [1, 2], // 1 = PREPAID, 2 = POSTPAID
      required: function () {
        return this.type === "meter recharge";
      },
    },

    /* --------------------------------------------------
     * AMOUNTS
     * -------------------------------------------------- */
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    sellingPrice: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },

    /* --------------------------------------------------
     * REFERENCES
     * -------------------------------------------------- */
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    vtuReference: String,
    vtuResponse: mongoose.Schema.Types.Mixed,

    /* --------------------------------------------------
     * STATUS
     * -------------------------------------------------- */
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
      index: true,
    },

    description: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Transaction", TransactionSchema);
