import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "../api";

function ProfilePage({ token, user, onProfileUpdate }) {
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    currentPassword: "",
    newPassword: ""
  });

  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getProfile(token);
        setForm((prev) => ({
          ...prev,
          name: data.user?.name || "",
          email: data.user?.email || ""
        }));
      } catch (error) {
        setMessageColor("#b91c1c");
        setMessage(error.message);
      }
    }

    void loadProfile();
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = {
        name: form.name,
        email: form.email
      };

      if (form.newPassword.trim()) {
        payload.currentPassword = form.currentPassword;
        payload.newPassword = form.newPassword;
      }

      const data = await updateProfile(token, payload);
      onProfileUpdate(data.user);
      setForm((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: ""
      }));
      setMessageColor("#047857");
      setMessage("Profile updated successfully");
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card profile-card">
      <h2>Profile Management</h2>
      <form className="form-block" onSubmit={handleSubmit}>
        <label htmlFor="profileName">Name</label>
        <input
          id="profileName"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />

        <label htmlFor="profileEmail">Email</label>
        <input
          id="profileEmail"
          type="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />

        <label htmlFor="profileCurrentPass">Current password (required only for password change)</label>
        <input
          id="profileCurrentPass"
          type="password"
          value={form.currentPassword}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
          }
        />

        <label htmlFor="profileNewPass">New password</label>
        <input
          id="profileNewPass"
          type="password"
          value={form.newPassword}
          onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
        />

        <button type="submit">Save Profile</button>
      </form>

      <p className="message" style={{ color: messageColor }}>
        {message}
      </p>
    </section>
  );
}

export default ProfilePage;
