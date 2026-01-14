require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/userModel"); // adjust path

const seedAdmin = async () => {
  try {
    // 1. Connect to database
    await mongoose.connect(process.env.DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to database");

    // 2. Check if admin exists
    const adminEmail = process.env.ADMIN_EMAIL;
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("⚠️ Admin already exists");
      process.exit(0);
    }

    // 3. Hash password
    const password = process.env.ADMIN_PASSWORD;
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Create admin
    const admin = await User.create({
      fullName: "Admin User",
      username: "admin",
      email: "admin@example.com",
      phone: "08000000000",
      address: "Admin HQ",
      password: hashedPassword,
      role: "admin",
    });

    console.log("✅ Admin user created:", admin.email);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding admin:", error);
    process.exit(1);
  }
};

seedAdmin();
