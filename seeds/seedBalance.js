require("dotenv").config();
const mongoose = require("mongoose");
const Marketer = require("../models/marketerModel"); // adjust path if needed

mongoose.connect(process.env.DB).then(async () => {
  const marketer = await Marketer.findOne({ name: "Awapay Nigeria" });

  if (!marketer) return console.log("❌ Marketer not found");

  marketer.wallet.fundingBalance = 100000;
  marketer._syncTotalBalance();
  await marketer.save();

  console.log("✅ Balance updated:", marketer.wallet);
  mongoose.disconnect();
});
