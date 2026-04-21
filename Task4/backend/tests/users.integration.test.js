const request = require("supertest");
const app = require("../src/app");
const User = require("../src/models/User");
const { connectTestDb, clearTestDb, disconnectTestDb } = require("./helpers/testDb");

const ADMIN_SIGNUP_KEY = process.env.ADMIN_SIGNUP_KEY || "team27";

async function signupUser(overrides = {}) {
  const payload = {
    name: "Test User",
    email: `user_${Date.now()}_${Math.floor(Math.random() * 10000)}@mail.com`,
    password: "pass1234",
    role: "student",
    ...overrides
  };

  if (payload.role === "admin") {
    payload.adminKey = payload.adminKey || ADMIN_SIGNUP_KEY;
  }

  const response = await request(app).post("/api/auth/signup").send(payload);
  return response.body;
}

describe("Users API integration", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test("rejects users API without valid token", async () => {
    const response = await request(app).get("/api/users");
    expect(response.statusCode).toBe(401);
  });

  test("allows admin to manage users and blocks student from admin users API", async () => {
    const admin = await signupUser({ role: "admin", email: "admin_manage@mail.com" });
    const student = await signupUser({ role: "student", email: "student_manage@mail.com" });

    const studentListResponse = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${student.token}`);

    expect(studentListResponse.statusCode).toBe(403);

    const adminListResponse = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(adminListResponse.statusCode).toBe(200);
    expect(Array.isArray(adminListResponse.body.users)).toBe(true);
    expect(adminListResponse.body.users.length).toBeGreaterThanOrEqual(2);

    const createdStudent = adminListResponse.body.users.find(
      (item) => item.email === "student_manage@mail.com"
    );
    expect(createdStudent).toBeTruthy();

    const updateResponse = await request(app)
      .put(`/api/users/${createdStudent.id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Updated Student", role: "student" });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.user.name).toBe("Updated Student");

    const deleteResponse = await request(app)
      .delete(`/api/users/${createdStudent.id}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(deleteResponse.statusCode).toBe(200);

    const exists = await User.findById(createdStudent.id);
    expect(exists).toBeNull();
  });
});
