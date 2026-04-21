import { useState } from "react";
import { signin, signup } from "../api";

function AuthPanel({ onAuthSuccess }) {
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");

  const [signinForm, setSigninForm] = useState({
    email: "",
    password: ""
  });

  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    adminKey: ""
  });

  async function handleSignin(event) {
    event.preventDefault();
    setMessage("");

    try {
      const data = await signin(signinForm);
      onAuthSuccess(data.token, data.user);
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = {
        name: signupForm.name,
        email: signupForm.email,
        password: signupForm.password,
        role: signupForm.role
      };

      if (signupForm.role === "admin") {
        payload.adminKey = signupForm.adminKey;
      }

      const data = await signup(payload);
      setMessageColor("#047857");
      setMessage("Signup success");
      onAuthSuccess(data.token, data.user);
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card">
      <h2>Login and Signup</h2>
      <div className="grid-two">
        <form className="form-block" onSubmit={handleSignin}>
          <h3>Signin</h3>
          <label htmlFor="signinEmail">Email</label>
          <input
            id="signinEmail"
            type="email"
            value={signinForm.email}
            onChange={(event) =>
              setSigninForm((prev) => ({ ...prev, email: event.target.value }))
            }
            required
          />
          <label htmlFor="signinPassword">Password</label>
          <input
            id="signinPassword"
            type="password"
            value={signinForm.password}
            onChange={(event) =>
              setSigninForm((prev) => ({ ...prev, password: event.target.value }))
            }
            required
          />
          <button type="submit">Signin</button>
        </form>

        <form className="form-block" onSubmit={handleSignup}>
          <h3>Signup</h3>
          <label htmlFor="signupName">Name</label>
          <input
            id="signupName"
            type="text"
            value={signupForm.name}
            onChange={(event) =>
              setSignupForm((prev) => ({ ...prev, name: event.target.value }))
            }
            required
          />
          <label htmlFor="signupEmail">Email</label>
          <input
            id="signupEmail"
            type="email"
            value={signupForm.email}
            onChange={(event) =>
              setSignupForm((prev) => ({ ...prev, email: event.target.value }))
            }
            required
          />
          <label htmlFor="signupPassword">Password</label>
          <input
            id="signupPassword"
            type="password"
            value={signupForm.password}
            onChange={(event) =>
              setSignupForm((prev) => ({ ...prev, password: event.target.value }))
            }
            required
          />
          <label htmlFor="signupRole">Role</label>
          <select
            id="signupRole"
            value={signupForm.role}
            onChange={(event) =>
              setSignupForm((prev) => ({ ...prev, role: event.target.value }))
            }
          >
            <option value="student">student</option>
            <option value="admin">admin</option>
          </select>
          <label htmlFor="signupAdminKey">Admin key (only for admin role)</label>
          <input
            id="signupAdminKey"
            type="text"
            value={signupForm.adminKey}
            onChange={(event) =>
              setSignupForm((prev) => ({ ...prev, adminKey: event.target.value }))
            }
          />
          <button type="submit">Signup</button>
        </form>
      </div>
      <p className="message" style={{ color: messageColor }}>
        {message}
      </p>
    </section>
  );
}

export default AuthPanel;
