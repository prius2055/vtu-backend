const mongoose = require("mongoose");
const Store = require("../models/storeModel");
const User = require("../models/userModel");
require("dotenv").config();

const seedStore = async () => {
  try {
    // 1. Connect to database
    await mongoose.connect(process.env.DB);
    console.log("✅ Connected to database");

    let store = await Store.findOne({ isDefault: true });
    if (store) {
      console.log("✅ Default store already exists");
      return process.exit();
    }

    const superAdmin = await User.findOne({ role: "superadmin" });

    if (!superAdmin) {
      throw new Error("Super Admin user not found. Seed Super admin first.");
    }

    await Store.create({
      name: "Default Store",
      // domains: ["localhost", "127.0.0.1", "vtuvend.com"],
      domains: ["main.local"],
      isDefault: true,
      owner: superAdmin._id,
    });

    console.log("🚀 Default store seeded successfully");

    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedStore();
