// require("dotenv").config();
// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");
// const User = require("../models/userModel");

// const seedSuperAdmin = async () => {
//   try {

//     await mongoose.connect(process.env.DB, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//     });
//     console.log("✅ Connected to database");

//     const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
//     const existingSuperAdmin = await User.findOne({ email: superAdminEmail });
//     if (existingSuperAdmin) {
//       console.log("⚠️ Super Admin already exists");
//       process.exit(0);
//     }

//     const password = process.env.SUPER_ADMIN_PASSWORD;
//     const salt = await bcrypt.genSalt(12);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     const superAdmin = await User.create({
//       fullName: "Super Admin User",
//       username: "superadmin",
//       email:superAdminEmail,
//       phone: "08033172026",
//       address: "Admin HQ",
//       password: hashedPassword,
//       role: "superadmin",
//     });

//     console.log("✅ Super Admin user created:", superAdmin.email);

//     process.exit(0);
//   } catch (error) {
//     console.error("❌ Error seeding super admin:", error);
//     process.exit(1);
//   }
// };

// seedSuperAdmin();

/**
 * SUPERADMIN SEEDER
 *
 * Creates the platform's default superadmin user and the
 * default marketer platform they belong to.
 *
 * Run once to bootstrap the system:
 *   node scripts/seedSuperAdmin.js
 *
 * Safe to run multiple times — checks for existing records
 * before creating anything.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");
const Wallet = require("../models/walletModel");

const SUPER_ADMIN = {
  fullName: process.env.SUPER_ADMIN_NAME || "Platform Super Admin",
  username: process.env.SUPER_ADMIN_USERNAME || "superadmin",
  email: process.env.SUPER_ADMIN_EMAIL || "superadmin@vtuvend.com",
  phone: process.env.SUPER_ADMIN_PHONE || "08033172137",
  address: process.env.SUPER_ADMIN_ADDRESS || "Platform HQ",
  password: process.env.SUPER_ADMIN_PASSWORD || "@Superadmin123456",
};

const DEFAULT_MARKETER = {
  name: process.env.PLATFORM_NAME || "Main Platform",
  brandName: process.env.PLATFORM_BRAND || "Main Platform",
  domains: process.env.PLATFORM_DOMAIN
    ? [process.env.PLATFORM_DOMAIN]
    : ["localhost:3000", "localhost:5000"],
  isDefault: true,
  status: "active",
};

const seed = async () => {
  try {
    /* ── Connect to DB ── */
    await mongoose.connect(process.env.DB);
    console.log("✅ Connected to MongoDB");

    /* ─────────────────────────────────────────
     * STEP 1: Create or find default marketer
     * ───────────────────────────────────────── */
    let marketer = await Marketer.findOne({ isDefault: true });

    if (marketer) {
      console.log("ℹ️  Default marketer already exists:", marketer.name);
    } else {
      console.log("🏪 Creating default marketer platform...");

      // Temporarily create without marketerDetail (circular dep)
      // We'll update it after the user is created
      marketer = await Marketer.create({
        ...DEFAULT_MARKETER,
        marketerDetail: new mongoose.Types.ObjectId(), // temp placeholder
        pricing: {
          markupType: "flat",
          airtimeMarkup: 0,
          dataMarkup: 0,
          cableMarkup: 0,
          electricityMarkup: 0,
          epinMarkup: 0,
        },
        commission: {
          referralPercent: 1,
          resellerPercent: 2,
        },
        settings: {
          allowRegistration: true,
          allowWalletFunding: true,
          allowWithdrawals: true,
          maintenanceMode: false,
        },
      });

      console.log("✅ Default marketer created:", marketer._id);
    }

    /* ─────────────────────────────────────────
     * STEP 2: Create or find superadmin user
     * ───────────────────────────────────────── */
    let superAdmin = await User.findOne({
      email: SUPER_ADMIN.email,
      marketerId: marketer._id,
    });

    if (superAdmin) {
      console.log("ℹ️  SuperAdmin already exists:", superAdmin.email);
    } else {
      console.log("👤 Creating superadmin user...");

      const hashedPassword = await bcrypt.hash(SUPER_ADMIN.password, 12);

      superAdmin = await User.create({
        fullName: SUPER_ADMIN.fullName,
        username: SUPER_ADMIN.username,
        email: SUPER_ADMIN.email,
        phone: SUPER_ADMIN.phone,
        address: SUPER_ADMIN.address,
        password: hashedPassword,
        role: "superadmin",
        status: "active",
        marketerId: marketer._id,
      });

      console.log("✅ SuperAdmin created:", superAdmin._id);
    }

    /* ─────────────────────────────────────────
     * STEP 3: Link marketer → superadmin
     * ───────────────────────────────────────── */
    if (
      !marketer.marketerDetail ||
      marketer.marketerDetail.toString() !== superAdmin._id.toString()
    ) {
      await Marketer.findByIdAndUpdate(marketer._id, {
        marketerDetail: superAdmin._id,
      });
      console.log("✅ Marketer linked to superadmin");
    }

    /* ─────────────────────────────────────────
     * STEP 4: Create superadmin wallet
     * ───────────────────────────────────────── */
    const existingWallet = await Wallet.findOne({
      user: superAdmin._id,
      marketerId: marketer._id,
    });

    if (existingWallet) {
      console.log("ℹ️  Wallet already exists for superadmin");
    } else {
      await Wallet.create({
        user: superAdmin._id,
        marketerId: marketer._id,
        balance: 0,
        status: "active",
      });
      console.log("✅ Wallet created for superadmin");
    }

    /* ─────────────────────────────────────────
     * DONE
     * ───────────────────────────────────────── */
    console.log("\n🎉 Seeding complete!");
    console.log("─────────────────────────────────────");
    console.log("Platform  :", marketer.brandName);
    console.log("Marketer  :", marketer._id);
    console.log("Email     :", SUPER_ADMIN.email);
    console.log("Password  :", SUPER_ADMIN.password);
    console.log("Role      :", superAdmin.role);
    console.log("─────────────────────────────────────");
    console.log(
      "⚠️  Change the default password immediately after first login!\n",
    );
  } catch (err) {
    console.error("🔥 Seeder error:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
};

seed();
