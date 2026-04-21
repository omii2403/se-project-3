const express = require("express");
const mongoose = require("mongoose");
const Submission = require("../models/Submission");
const User = require("../models/User");
const Question = require("../models/Question");
const requireAuth = require("../shared/middleware/requireAuth");
const requireRole = require("../shared/middleware/requireRole");
const {
  getCached,
  setCached,
  studentSummaryKey,
  adminOverviewKey
} = require("../shared/summaryCache");

const router = express.Router();

router.get("/student/summary", requireAuth, async (req, res) => {
  try {
    const targetUserId =
      req.user.role === "admin" && req.query.userId ? req.query.userId : req.user.userId;

    const cacheKey = studentSummaryKey(targetUserId);
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const userObjectId = new mongoose.Types.ObjectId(targetUserId);

    const groupedByTopic = await Submission.aggregate([
      { $match: { userId: userObjectId, status: "COMPLETED" } },
      {
        $group: {
          _id: "$topic",
          attempts: { $sum: 1 },
          passed: { $sum: { $cond: ["$passed", 1, 0] } },
          avgScore: { $avg: "$score" }
        }
      },
      {
        $project: {
          _id: 0,
          topic: "$_id",
          attempts: 1,
          passed: 1,
          avgScore: { $round: ["$avgScore", 2] },
          accuracy: {
            $round: [
              {
                $multiply: [
                  {
                    $cond: [
                      { $eq: ["$attempts", 0] },
                      0,
                      { $divide: ["$passed", "$attempts"] }
                    ]
                  },
                  100
                ]
              },
              2
            ]
          }
        }
      },
      { $sort: { accuracy: 1 } }
    ]);

    const totals = await Submission.aggregate([
      { $match: { userId: userObjectId, status: "COMPLETED" } },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          avgScore: { $avg: "$score" }
        }
      }
    ]);

    const weakTopics = groupedByTopic.filter((topic) => topic.accuracy < 60);

    const response = {
      totals: totals[0]
        ? {
            totalSubmissions: totals[0].totalSubmissions,
            avgScore: Number(totals[0].avgScore.toFixed(2))
          }
        : { totalSubmissions: 0, avgScore: 0 },
      weakTopics,
      topicBreakdown: groupedByTopic
    };

    setCached(cacheKey, response);
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admin/overview", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const cacheKey = adminOverviewKey();
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const [userCount, questionCount, totalSubmissions, statusCounts, topWeakTopics] = await Promise.all([
      User.countDocuments(),
      Question.countDocuments({ isActive: true }),
      Submission.countDocuments(),
      Submission.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      Submission.aggregate([
        { $match: { status: "COMPLETED" } },
        {
          $group: {
            _id: "$topic",
            attempts: { $sum: 1 },
            passed: { $sum: { $cond: ["$passed", 1, 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            topic: "$_id",
            attempts: 1,
            accuracy: {
              $round: [
                {
                  $multiply: [
                    {
                      $cond: [
                        { $eq: ["$attempts", 0] },
                        0,
                        { $divide: ["$passed", "$attempts"] }
                      ]
                    },
                    100
                  ]
                },
                2
              ]
            }
          }
        },
        { $sort: { accuracy: 1 } },
        { $limit: 5 }
      ])
    ]);

    const response = {
      totals: {
        users: userCount,
        activeQuestions: questionCount,
        submissions: totalSubmissions
      },
      submissionStatus: statusCounts,
      weakestTopics: topWeakTopics
    };

    setCached(cacheKey, response);
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
