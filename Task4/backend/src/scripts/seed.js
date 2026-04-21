const { connectDb } = require("../shared/db");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Question = require("../models/Question");
const Submission = require("../models/Submission");
const TestSession = require("../models/TestSession");

function getSeedAdminConfig() {
  const email = String(process.env.SEED_ADMIN_EMAIL || "admin@team27.local")
    .trim()
    .toLowerCase();

  return {
    name: String(process.env.SEED_ADMIN_NAME || "Seeder Admin").trim(),
    email,
    password: String(process.env.SEED_ADMIN_PASSWORD || "admin123")
  };
}

async function upsertSeedAdmin() {
  const seedAdmin = getSeedAdminConfig();
  const passwordHash = await bcrypt.hash(seedAdmin.password, 10);

  await User.findOneAndUpdate(
    { email: seedAdmin.email },
    {
      $set: {
        name: seedAdmin.name,
        email: seedAdmin.email,
        role: "admin",
        passwordHash
      }
    },
    { upsert: true, new: true }
  );

  return seedAdmin.email;
}

async function runSeed() {
  await connectDb();

  const seedAdminEmail = await upsertSeedAdmin();

  await Promise.all([
    User.deleteMany({ email: { $ne: seedAdminEmail } }),
    Question.deleteMany({}),
    Submission.deleteMany({}),
    TestSession.deleteMany({})
  ]);

  await upsertSeedAdmin();

  console.log(
    `Data reset complete. Seed admin (${seedAdminEmail}) is preserved permanently.`
  );
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("Seed failed", err);
  process.exit(1);
});
