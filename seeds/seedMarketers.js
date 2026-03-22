

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");
const Wallet = require("../models/walletModel");

/* ─────────────────────────────────────────────────────────────
 * TEST MARKETERS
 * Each simulates a different affiliate running their own VTU brand.
 * In development, domains are fake localhost ports/subdomains.
 * ───────────────────────────────────────────────────────────── */
const TEST_MARKETERS = [
  {
    marketer: {
      name: "Prince VTU",
      brandName: "PrinceVTU",
      // In dev: identify by X-Marketer-ID header or subdomain
      // In prod: replace with real domains e.g. ["princevtu.com"]
      domains: ["prince.localhost", "princevtu.localhost"],
      status: "active",
      isDefault: false,
      pricing: {
        markupType: "flat",
        airtimeMarkup: 0,
        dataMarkup: 20,
        cableMarkup: 50,
        electricityMarkup: 50,
        epinMarkup: 0,
      },
      commission: {
        referralPercent: 2,
        resellerPercent: 3,
      },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
    },
    owner: {
      fullName: "Prince Okonkwo",
      username: "prince_admin",
      email: "prince@test.com",
      phone: "08111111111",
      address: "Lagos, Nigeria",
      password: "Test@12345",
      role: "marketer",
    },
  },
  {
    marketer: {
      name: "Emeka Data Hub",
      brandName: "EmekaDataHub",
      domains: ["emeka.localhost", "emekadata.localhost"],
      status: "active",
      isDefault: false,
      pricing: {
        markupType: "percentage",
        airtimeMarkup: 2,
        dataMarkup: 5,
        cableMarkup: 3,
        electricityMarkup: 3,
        epinMarkup: 2,
      },
      commission: {
        referralPercent: 1,
        resellerPercent: 2,
      },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: false,
        maintenanceMode: false,
      },
    },
    owner: {
      fullName: "Emeka Chukwu",
      username: "emeka_admin",
      email: "emeka@test.com",
      phone: "08122222222",
      address: "Abuja, Nigeria",
      password: "Test@12345",
      role: "marketer",
    },
  },
  {
    marketer: {
      name: "FastSub Nigeria",
      brandName: "FastSub",
      domains: ["fastsub.localhost"],
      status: "active",
      isDefault: false,
      pricing: {
        markupType: "flat",
        airtimeMarkup: 5,
        dataMarkup: 30,
        cableMarkup: 100,
        electricityMarkup: 0,
        epinMarkup: 10,
      },
      commission: {
        referralPercent: 3,
        resellerPercent: 5,
      },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
    },
    owner: {
      fullName: "Fatima Sule",
      username: "fatima_admin",
      email: "fatima@test.com",
      phone: "08133333333",
      address: "Kano, Nigeria",
      password: "Test@12345",
      role: "marketer",
    },
  },

  {
    marketer: {
      name: "Adesina",
      brandName: "Subadex",
      domains: ["subadex.com", "www.subadex.com"],
      status: "active",
      isDefault: false,
      pricing: {
        markupType: "flat",
        airtimeMarkup: 0,
        dataMarkup: 0,
        cableMarkup: 0,
        electricityMarkup: 0,
        epinMarkup: 0,
      },
      commission: {
        referralPercent: 0,
        resellerPercent: 0,
      },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
    },
    owner: {
      fullName: "Adesina Subadex",
      username: "subadex_marketer",
      email: "admin@subadex.com", // ← update with real email
      phone: "+234 0704 485 9310", // ← update with real phone
      address: "6 Itelorun Close off Adeniyi Jones, Ikeja, Lagos State",
      password: "@Subadex@711", // ← change immediately after seeding
      role: "marketer",
    },
  },
];

/* ─────────────────────────────────────────────────────────────
 * HELPER — create one marketer + owner + wallet
 * ───────────────────────────────────────────────────────────── */
const createMarketer = async ({ marketer: marketerData, owner: ownerData }) => {
  console.log(`\n📦 Processing: ${marketerData.brandName}`);

  /* ── Check if marketer already exists ── */
  const existing = await Marketer.findOne({ name: marketerData.name });
  if (existing) {
    console.log(
      `  ℹ️  Marketer "${marketerData.name}" already exists — skipping`,
    );
    return existing;
  }

  /* ── Create owner user ── */
  let owner = await User.findOne({ email: ownerData.email });

  if (owner) {
    console.log(`  ℹ️  Owner "${ownerData.email}" already exists — reusing`);
  } else {
    const hashedPassword = await bcrypt.hash(ownerData.password, 12);

    // Temporarily use a placeholder marketerId — updated after marketer is created
    owner = await User.create({
      ...ownerData,
      password: hashedPassword,
      status: "active",
      marketerId: new mongoose.Types.ObjectId(), // placeholder
    });

    console.log(`  ✅ Owner created: ${owner.email}`);
  }

  /* ── Create marketer ── */
  const marketer = await Marketer.create({
    ...marketerData,
    marketerDetail: owner._id,
  });

  console.log(`  ✅ Marketer created: ${marketer._id}`);

  /* ── Update owner's marketerId to real marketer ── */
  await User.findByIdAndUpdate(owner._id, { marketerId: marketer._id });
  console.log(`  ✅ Owner linked to marketer`);

  /* ── Create owner wallet ── */
  await Wallet.findOneAndUpdate(
    { user: owner._id, marketerId: marketer._id },
    { user: owner._id, marketerId: marketer._id, balance: 0, status: "active" },
    { upsert: true, new: true },
  );

  console.log(`  ✅ Wallet created for owner`);

  return marketer;
};

/* ─────────────────────────────────────────────────────────────
 * MAIN
 * ───────────────────────────────────────────────────────────── */
const seed = async () => {
  // if (process.env.NODE_ENV === "production") {
  //   console.error("❌ This script cannot run in production.");
  //   process.exit(1);
  // }

  try {
    await mongoose.connect(process.env.DB);
    console.log("✅ Connected to MongoDB");
    console.log("🌱 Seeding test marketers...\n");

    const results = [];

    for (const entry of TEST_MARKETERS) {
      const marketer = await createMarketer(entry);
      results.push({
        brand: marketer.brandName,
        id: marketer._id,
        domains: marketer.domains,
        owner: entry.owner.email,
        password: entry.owner.password,
      });
    }

    /* ── Summary ── */
    console.log("\n🎉 Seeding complete!\n");
    console.log("─────────────────────────────────────────────────────");
    console.log("To test in Postman, pass one of these headers:\n");

    results.forEach((r) => {
      console.log(`Brand    : ${r.brand}`);
      console.log(`ID       : ${r.id}`);
      console.log(`Domains  : ${r.domains.join(", ")}`);
      console.log(`Login    : ${r.owner} / ${r.password}`);
      console.log(`Header   : X-Marketer-ID: ${r.id}`);
      console.log("─────────────────────────────────────────────────────");
    });

    console.log("\nOR configure your /etc/hosts for subdomain testing:");
    console.log("  127.0.0.1   prince.localhost");
    console.log("  127.0.0.1   emeka.localhost");
    console.log("  127.0.0.1   fastsub.localhost\n");
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
