// models/marketerPricingModel.js
const mongoose = require("mongoose");

const marketerPricingSchema = new mongoose.Schema({
  marketerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Marketer",
    required: true,
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DataPlan",
    required: true,
  },
  sellingPrice: { type: Number },
  resellerPrice: { type: Number },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

marketerPricingSchema.index({ marketerId: 1, planId: 1 }, { unique: true });

module.exports = mongoose.model("MarketerPricing", marketerPricingSchema);