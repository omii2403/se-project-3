import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../api";

function homePathForRole(role) {
  return role === "admin" ? "/admin/dashboard" : "/student/dashboard";
}

function SignupPage({ onAuthSuccess }) {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    adminKey: ""
  });
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role
      };

      if (form.role === "admin") {
        payload.adminKey = form.adminKey;
      }

      const data = await signup(payload);
      onAuthSuccess(data.token, data.user);
      navigate(homePathForRole(data.user.role), { replace: true });
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card auth-card">
      <h2>Signup</h2>
      <form className="form-block" onSubmit={handleSubmit}>
        <label htmlFor="signupName">Name</label>
        <input
          id="signupName"
          type="text"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />

        <label htmlFor="signupEmail">Email</label>
        <input
          id="signupEmail"
          type="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />

        <label htmlFor="signupPassword">Password</label>
        <input
          id="signupPassword"
          type="password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          required
        />

        <label htmlFor="signupRole">Role</label>
        <select
          id="signupRole"
          value={form.role}
          onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
        >
          <option value="student">student</option>
          <option value="admin">admin</option>
        </select>

        {form.role === "admin" && (
          <>
            <label htmlFor="signupAdminKey">Admin signup key</label>
            <input
              id="signupAdminKey"
              type="text"
              value={form.adminKey}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, adminKey: event.target.value }))
              }
              required
            />
          </>
        )}

        <button type="submit">Create Account</button>
      </form>

      <p className="message" style={{ color: messageColor }}>
        {message}
      </p>

      <p className="meta">
        Already registered? <Link to="/login">Go to login</Link>
      </p>
    </section>
  );
}

export default SignupPage;
