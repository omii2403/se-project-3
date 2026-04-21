import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signin } from "../api";

function homePathForRole(role) {
  return role === "admin" ? "/admin/dashboard" : "/student/dashboard";
}

function LoginPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectFrom = location.state?.from;

  const [form, setForm] = useState({
    email: "",
    password: ""
  });
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const data = await signin(form);
      onAuthSuccess(data.token, data.user);
      navigate(redirectFrom || homePathForRole(data.user.role), { replace: true });
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card auth-card">
      <h2>Signin</h2>
      <form className="form-block" onSubmit={handleSubmit}>
        <label htmlFor="signinEmail">Email</label>
        <input
          id="signinEmail"
          type="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />

        <label htmlFor="signinPassword">Password</label>
        <input
          id="signinPassword"
          type="password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          required
        />

        <button type="submit">Login</button>
      </form>

      <p className="message" style={{ color: messageColor }}>
        {message}
      </p>

      <p className="meta">
        New user? <Link to="/signup">Create account</Link>
      </p>
    </section>
  );
}

export default LoginPage;
