/**
 * MARKETER SEEDER
 *
 * Creates marketer platforms with owners and wallets.
 * Safe to run multiple times — skips existing records.
 * All marketers use PaymentPoint as the payment gateway.
 *
 * Run:
 *   node scripts/seedMarketers.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/userModel");
const Marketer = require("../models/marketerModel");
const Wallet = require("../models/walletModel");
const { encrypt } = require("../utils/tokenEncryption");

/* ─────────────────────────────────────────────────────────────
 * MARKETERS
 *
 * apiTokens — paste plain text values here before seeding.
 * The seeder encrypts sensitive fields before saving to DB.
 * Leave null to fall back to platform .env tokens at runtime.
 *
 * Token fields:
 *   vtuToken       — VTU provider token (geodnatechsub etc.)
 *   gatewaySecret  — PaymentPoint Bearer token       [encrypted]
 *   gatewayPublic  — PaymentPoint api-key            [plain text — safe to expose]
 *   gatewayWebhook — PaymentPoint webhook secret     [encrypted]
 * ───────────────────────────────────────────────────────────── */
const MARKETERS = [
  {
    marketer: {
      name: "Prince VTU",
      brandName: "PrinceVTU",
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
      commission: { referralPercent: 2, resellerPercent: 3 },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
      apiTokens: {
        vtuToken: "3511591c93907798464ca20ba3bff2b8f0d9a9b1",
        gatewaySecret:
          "48c1bccb6bf18a29277c3a582f6d38601eb7fa1274f4c36c6e418d4ead6bc85d836591719f1ea4e153da7abdea4fb2c9199b2fb65e8fed25681cb740",
        gatewayPublic: "cf84127122feb9cca17eed1f3ea255d77d9c29a4",
        paymentPointBusinessId: "5bb4ab634c3d8002d696c012159263a65b57d96d",
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
      commission: { referralPercent: 1, resellerPercent: 2 },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: false,
        maintenanceMode: false,
      },
      apiTokens: {
        vtuToken: "3511591c93907798464ca20ba3bff2b8f0d9a9b1",
        gatewaySecret:
          "48c1bccb6bf18a29277c3a582f6d38601eb7fa1274f4c36c6e418d4ead6bc85d836591719f1ea4e153da7abdea4fb2c9199b2fb65e8fed25681cb740",
        gatewayPublic: "cf84127122feb9cca17eed1f3ea255d77d9c29a4",
        paymentPointBusinessId: "5bb4ab634c3d8002d696c012159263a65b57d96d",
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
      name: "Awapay Nigeria",
      brandName: "Awapay",
      domains: ["awapaya.com.ng", "www.awapaya.com.ng", "api.awapaya.com.ng"],
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
      commission: { referralPercent: 0, resellerPercent: 0 },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
      apiTokens: {
        vtuToken: "3511591c93907798464ca20ba3bff2b8f0d9a9b1",
        gatewaySecret:
          "48c1bccb6bf18a29277c3a582f6d38601eb7fa1274f4c36c6e418d4ead6bc85d836591719f1ea4e153da7abdea4fb2c9199b2fb65e8fed25681cb740",
        gatewayPublic: "cf84127122feb9cca17eed1f3ea255d77d9c29a4",
        paymentPointBusinessId: "5bb4ab634c3d8002d696c012159263a65b57d96d",
      },
    },
    owner: {
      fullName: "Favour Prince-Nwuke",
      username: "awapaya_admin",
      email: "pc.nwuke@gmail.com",
      phone: "09034365585",
      address: "Police Estate, Abuja, Nigeria",
      password: "@Server1410",
      role: "marketer",
    },
  },

  {
    marketer: {
      name: "Adesina",
      brandName: "Subadex",
      domains: ["subadex.com", "www.subadex.com", "api.subadex.com"],
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
      commission: { referralPercent: 0, resellerPercent: 0 },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
      apiTokens: {
        vtuToken: "2434410872493894eadc896a069ab0efdb04427d",
        gatewaySecret:
          "aa6355271d20ea4131b0cf684e9cace204b16bfecfecb9804ac0bd0d18f71317fe6b85faa06133d2572d7f1c809bc2fb2135fbae589bfcc01c12e689",
        gatewayPublic: "3c20da5ad8b86a742abee5400531e9d5a59857aa",
        paymentPointBusinessId: "e33cd05c62fed9fb61b515bb13bb08515b539379",
      },
    },
    owner: {
      fullName: "Adesina Subadex",
      username: "subadex_marketer",
      email: "admin@subadex.com",
      phone: "+2347044859310",
      address: "6 Itelorun Close off Adeniyi Jones, Ikeja, Lagos State",
      password: "@Subadex@711", // ← change immediately after seeding
      role: "marketer",
    },
  },
  {
    marketer: {
      name: "Erijane",
      brandName: "Erijane Data Hub",
      domains: [
        "erijanedata.com",
        "www.erijanedata.com",
        "api.erijanedata.com",
      ],
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
      commission: { referralPercent: 0, resellerPercent: 0 },
      settings: {
        allowRegistration: true,
        allowWalletFunding: true,
        allowWithdrawals: true,
        maintenanceMode: false,
      },
      apiTokens: {
        vtuToken: "fb09f4ea48adf4be4565c07382c650e22114c29c",
        gatewaySecret:
          "baf26956c65ec60dbbc8ec8b6140d938861adab51a09da9dee9da31ec2346bc416b3a51170ca7436651189921d80e250a2ffdc729f4e67d29454b72f",
        gatewayPublic: "5bbbb22d53fd4140bcba9d3d4d5baa01d9663d1b",
        paymentPointBusinessId: "900b4d7576b774e3a5415c072db5045e104dca08",
      },
    },
    owner: {
      fullName: "Blessing Adebayo",
      username: "erijane_marketer",
      email: "adebayosamson@gmail.com",
      phone: "+2347065442300",
      address: "No 65 Oronna Street Madakeke, Ife, Osun state",
      password: "Erijane@1411", // ← change immediately after seeding
      role: "marketer",
    },
  },
];

/* ─────────────────────────────────────────────────────────────
 * HELPER — create one marketer + owner + wallet
 * ───────────────────────────────────────────────────────────── */
// const createMarketer = async ({ marketer: marketerData, owner: ownerData }) => {
//   console.log(`\n📦 Processing: ${marketerData.brandName}`);

//   /* ── Skip if already exists ── */
//   const existing = await Marketer.findOne({ name: marketerData.name });
//   if (existing) {
//     console.log(
//       `  ℹ️  Marketer "${marketerData.name}" already exists — skipping`,
//     );
//     return existing;
//   }

//   /* ── Create or reuse owner user ── */
//   let owner = await User.findOne({ email: ownerData.email });

//   if (owner) {
//     console.log(`  ℹ️  Owner "${ownerData.email}" already exists — reusing`);
//   } else {
//     const hashedPassword = await bcrypt.hash(ownerData.password, 12);
//     owner = await User.create({
//       ...ownerData,
//       password: hashedPassword,
//       status: "active",
//       marketerId: new mongoose.Types.ObjectId(), // placeholder — updated below
//     });
//     console.log(`  ✅ Owner created: ${owner.email}`);
//   }

//   /* ── Encrypt API tokens before saving ── */
//   const { apiTokens, ...restMarketerData } = marketerData;

//   const encryptedTokens = {
//     // ── Sensitive — encrypted ──
//     vtuToken: apiTokens?.vtuToken ? encrypt(apiTokens.vtuToken) : null,
//     gatewaySecret: apiTokens?.gatewaySecret
//       ? encrypt(apiTokens.gatewaySecret)
//       : null,
//     gatewayWebhook: apiTokens?.gatewayWebhook
//       ? encrypt(apiTokens.gatewayWebhook)
//       : null,
//     // ── Public — stored as plain text ──
//     gatewayPublic: apiTokens?.gatewayPublic || null,
//   };

//   /* ── Create marketer ── */
//   const marketer = await Marketer.create({
//     ...restMarketerData,
//     marketerDetail: owner._id,
//     apiTokens: encryptedTokens,
//   });

//   console.log(`  ✅ Marketer created: ${marketer._id}`);

//   /* ── Log token status ── */
//   if (apiTokens?.vtuToken) console.log(`  🔐 VTU token encrypted and saved`);
//   if (apiTokens?.gatewaySecret)
//     console.log(`  🔐 PaymentPoint secret encrypted and saved`);
//   if (apiTokens?.gatewayWebhook)
//     console.log(`  🔐 PaymentPoint webhook secret encrypted and saved`);
//   if (apiTokens?.gatewayPublic) console.log(`  🔑 PaymentPoint api-key saved`);
//   if (
//     !apiTokens?.vtuToken &&
//     !apiTokens?.gatewaySecret &&
//     !apiTokens?.gatewayWebhook
//   ) {
//     console.log(`  ⚠️  No API tokens set — will use platform .env fallback`);
//   }

//   /* ── Webhook URL reminder ── */
//   const primaryDomain = marketer.domains?.[0];
//   const apiSubdomain = primaryDomain
//     ? `api.${primaryDomain.replace(/^www\./, "")}`
//     : process.env.API_DOMAIN || "api.subadex.com";

//   console.log(`  🌐 PaymentPoint webhook URL:`);
//   console.log(
//     `     https://${apiSubdomain}/api/v1/wallet/webhook/${marketer._id}`,
//   );

//   /* ── Link owner to marketer ── */
//   await User.findByIdAndUpdate(owner._id, { marketerId: marketer._id });
//   console.log(`  ✅ Owner linked to marketer`);

//   /* ── Create owner wallet ── */
//   await Wallet.findOneAndUpdate(
//     { user: owner._id, marketerId: marketer._id },
//     { user: owner._id, marketerId: marketer._id, balance: 0, status: "active" },
//     { upsert: true, new: true },
//   );
//   console.log(`  ✅ Wallet created for owner`);

//   return marketer;
// };

const createMarketer = async ({ marketer: marketerData, owner: ownerData }) => {
  console.log(`\n📦 Syncing: ${marketerData.brandName}`);

  /* ── Find marketer using domains ── */
  let marketer = await Marketer.findOne({
    domains: { $in: marketerData.domains },
  });

  if (marketer) {
    console.log(`  ℹ️ Found existing marketer via domain match`);
  }

  /* ── Create or reuse owner ── */
  let owner = await User.findOne({ email: ownerData.email });

  if (!owner) {
    const hashedPassword = await bcrypt.hash(ownerData.password, 12);

    owner = await User.create({
      ...ownerData,
      password: hashedPassword,
      status: "active",
    });

    console.log(`  ✅ Owner created: ${owner.email}`);
  } else {
    console.log(`  ℹ️ Owner exists: ${owner.email}`);
  }

  /* ── Prepare tokens ── */
  const { apiTokens, ...restMarketerData } = marketerData;

  const encryptedTokens = {};

  if (apiTokens?.vtuToken)
    encryptedTokens["apiTokens.vtuToken"] = encrypt(apiTokens.vtuToken);

  if (apiTokens?.gatewaySecret)
    encryptedTokens["apiTokens.gatewaySecret"] = encrypt(
      apiTokens.gatewaySecret,
    );

  if (apiTokens?.gatewayWebhook)
    encryptedTokens["apiTokens.gatewayWebhook"] = encrypt(
      apiTokens.gatewayWebhook,
    );

  if (apiTokens?.gatewayPublic)
    encryptedTokens["apiTokens.gatewayPublic"] = apiTokens.gatewayPublic;

  if (apiTokens?.paymentPointBusinessId)
    encryptedTokens["apiTokens.paymentPointBusinessId"] =
      apiTokens.paymentPointBusinessId;

  /* ── CREATE ── */
  if (!marketer) {
    const tokenObject = {
      vtuToken: apiTokens?.vtuToken ? encrypt(apiTokens.vtuToken) : null,
      gatewaySecret: apiTokens?.gatewaySecret
        ? encrypt(apiTokens.gatewaySecret)
        : null,
      gatewayWebhook: apiTokens?.gatewayWebhook
        ? encrypt(apiTokens.gatewayWebhook)
        : null,
      gatewayPublic: apiTokens?.gatewayPublic || null,
      paymentPointBusinessId: apiTokens?.paymentPointBusinessId || null,
    };

    marketer = await Marketer.create({
      ...restMarketerData,
      marketerDetail: owner._id,
      apiTokens: tokenObject,
    });

    console.log(`  ✅ Marketer created: ${marketer._id}`);
  } else {
    /* ── UPDATE ── */
    console.log(`  🔄 Updating marketer`);

    await Marketer.updateOne(
      { _id: marketer._id },
      {
        $set: {
          name: marketerData.name,
          domains: marketerData.domains,
          status: marketerData.status,
          isDefault: marketerData.isDefault,
          pricing: marketerData.pricing,
          commission: marketerData.commission,
          settings: marketerData.settings,
          marketerDetail: owner._id,
          ...encryptedTokens,
        },
      },
    );

    marketer = await Marketer.findById(marketer._id);

    console.log(`  ✅ Marketer updated`);
  }

  /* ── Link owner ── */
  if (!owner.marketerId || !owner.marketerId.equals(marketer._id)) {
    owner.marketerId = marketer._id;
    await owner.save();
    console.log(`  ✅ Owner linked to marketer`);
  }

  /* ── Ensure wallet ── */
  await Wallet.findOneAndUpdate(
    { user: owner._id, marketerId: marketer._id },
    {
      user: owner._id,
      marketerId: marketer._id,
      balance: 0,
      status: "active",
    },
    { upsert: true },
  );

  console.log(`  ✅ Wallet ensured`);

  /* ── Webhook reminder ── */
  const primaryDomain = marketer.domains?.[0];

  const apiSubdomain = primaryDomain
    ? `api.${primaryDomain.replace(/^www\./, "")}`
    : process.env.API_DOMAIN || "api.subadex.com";

  console.log(`  🌐 PaymentPoint webhook URL:`);

  console.log(
    `     https://${apiSubdomain}/api/v1/wallet/webhook/${marketer._id}`,
  );

  return marketer;
};

/* ─────────────────────────────────────────────────────────────
 * MAIN
 * ───────────────────────────────────────────────────────────── */
const seed = async () => {
  try {
    await mongoose.connect(process.env.DB);
    console.log("✅ Connected to MongoDB");
    console.log("🌱 Seeding marketers...\n");

    const results = [];

    for (const entry of MARKETERS) {
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

    results.forEach((r) => {
      console.log(`Brand    : ${r.brand}`);
      console.log(`ID       : ${r.id}`);
      console.log(`Domains  : ${r.domains.join(", ")}`);
      console.log(`Login    : ${r.owner} / ${r.password}`);
      console.log(`Header   : X-Marketer-ID: ${r.id}`);
      console.log("─────────────────────────────────────────────────────");
    });

    console.log("\nDev /etc/hosts entries:");
    console.log("  127.0.0.1   prince.localhost");
    console.log("  127.0.0.1   emeka.localhost");
    console.log("  127.0.0.1   fastsub.localhost\n");

    console.log("⚠️  After seeding production marketers:");
    console.log("   1. Register webhook URL in PaymentPoint dashboard");
    console.log("   2. Blank out plain-text tokens from this file");
    console.log("   3. Add this file to .gitignore\n");
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
