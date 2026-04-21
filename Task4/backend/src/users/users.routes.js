const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const requireRole = require("../shared/middleware/requireRole");
const { sanitizeUser } = require("../shared/auth");

const router = express.Router();

function getSeedAdminEmail() {
  return String(process.env.SEED_ADMIN_EMAIL || "admin@team27.local")
    .trim()
    .toLowerCase();
}

function isSeedAdminUser(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return email === getSeedAdminEmail();
}

router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const role = String(req.query.role || "").trim().toLowerCase();
    const query = {};

    if (["admin", "student"].includes(role)) {
      query.role = role;
    }

    const users = await User.find(query).sort({ createdAt: -1 });
    return res.json({ users: users.map(sanitizeUser) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const nextName = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    const nextEmail = req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
    const nextRole = req.body?.role !== undefined ? String(req.body.role).trim().toLowerCase() : undefined;
    const nextPassword =
      req.body?.newPassword !== undefined ? String(req.body.newPassword) : undefined;

    if (nextRole && !["admin", "student"].includes(nextRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    if (isSeedAdminUser(user)) {
      if (nextRole && nextRole !== "admin") {
        return res.status(400).json({ error: "Seed admin role cannot be changed" });
      }

      if (nextEmail && nextEmail !== getSeedAdminEmail()) {
        return res.status(400).json({ error: "Seed admin email cannot be changed" });
      }
    }

    if (nextName) {
      user.name = nextName;
    }

    if (nextEmail && nextEmail !== user.email) {
      const existing = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }
      user.email = nextEmail;
    }

    if (nextRole) {
      user.role = nextRole;
    }

    if (nextPassword && nextPassword.trim().length > 0) {
      user.passwordHash = await bcrypt.hash(nextPassword, 10);
    }

    await user.save();
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (String(user._id) === String(req.user.userId)) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    if (isSeedAdminUser(user)) {
      return res.status(400).json({ error: "Seed admin cannot be deleted" });
    }

    await User.deleteOne({ _id: user._id });
    return res.json({ message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
