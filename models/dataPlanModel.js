const mongoose = require("mongoose");

const dataPlanSchema = new mongoose.Schema({
  serviceType: {
    type: String,
    enum: ["data", "airtime", "cable", "electricity"],
    required: true,
  },

  network: {
    type: String, // MTN, AIRTEL, DSTV, IKEJA_ELECTRIC
    required: true,
  },

  providerNetworkId: {
    type: String, // MTN = 1, AIRTEL =2 , GLO = 3, 9MOBILE = 4
    required: true,
  },

  providerPlanId: {
    type: String, // VTU provider plan code
    required: true,
    unique: true,
  },

  planName: {
    type: String,
    required: true,
  },

  planType: {
    type: String,
    required: true,
  },

  providerPrice: {
    type: Number,
    required: true,
  },

  sellingPrice: {
    type: Number,
    required: true,
  },

  resellerPrice: {
    type: Number,
    required: true,
  },

  validity: String,

  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  updatedByAdminAt: {
    type: Date,
  },
});

module.exports = mongoose.model("DataPlan", dataPlanSchema);
