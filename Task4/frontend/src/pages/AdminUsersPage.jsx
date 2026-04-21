import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteUserByAdmin, listUsersByAdmin, updateUserByAdmin } from "../api";

function toEditForm(user) {
  return {
    name: user?.name || "",
    email: user?.email || "",
    role: user?.role || "student",
    newPassword: ""
  };
}

function AdminUsersPage({ token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [message, setMessage] = useState("");
  const [messageColor, setMessageColor] = useState("#b91c1c");

  useEffect(() => {
    void loadUsers(roleFilter);
  }, [roleFilter]);

  async function loadUsers(role = roleFilter) {
    setMessage("");

    try {
      const data = await listUsersByAdmin(token, role);
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error) {
      setUsers([]);
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  function startEdit(user) {
    setEditingId(user.id);
    setEditForm(toEditForm(user));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditForm(null);
  }

  async function handleSaveEdit() {
    if (!editingId || !editForm) {
      return;
    }

    const payload = {
      name: String(editForm.name || "").trim(),
      email: String(editForm.email || "").trim(),
      role: String(editForm.role || "student").trim().toLowerCase()
    };

    if (String(editForm.newPassword || "").trim()) {
      payload.newPassword = String(editForm.newPassword);
    }

    try {
      await updateUserByAdmin(token, editingId, payload);
      setMessageColor("#047857");
      setMessage("User updated");
      setEditingId("");
      setEditForm(null);
      await loadUsers(roleFilter);
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  async function handleDelete(user) {
    const confirmed = window.confirm(
      `Delete account for ${user.email}? This action cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteUserByAdmin(token, user.id);
      setMessageColor("#047857");
      setMessage("User deleted");
      if (editingId === user.id) {
        cancelEdit();
      }
      await loadUsers(roleFilter);
    } catch (error) {
      setMessageColor("#b91c1c");
      setMessage(error.message);
    }
  }

  return (
    <section className="card">
      <div className="row-between">
        <h2>Admin User/Student Management</h2>
        <div className="inline-form">
          <Link className="button-link" to="/admin/dashboard">
            Back to Dashboard
          </Link>
          <Link className="button-link" to="/admin/questions">
            Manage Questions
          </Link>
        </div>
      </div>

      <div className="subcard">
        <div className="row-between">
          <h3>Users List</h3>
          <div className="inline-form">
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">all roles</option>
              <option value="student">students</option>
              <option value="admin">admins</option>
            </select>
            <button type="button" onClick={() => void loadUsers(roleFilter)}>
              Refresh
            </button>
          </div>
        </div>

        {message && (
          <p className="message" style={{ color: messageColor }}>
            {message}
          </p>
        )}

        <div className="table-wrap">
          <table className="question-table compact-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4}>No users found.</td>
                </tr>
              )}

              {users.map((user) => {
                const isEditing = editingId === user.id;
                const isCurrentUser = String(currentUser?.id || "") === String(user.id || "");

                return (
                  <tr key={user.id}>
                    <td>
                      {isEditing ? (
                        <input
                          value={editForm?.name || ""}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      ) : (
                        user.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="email"
                          value={editForm?.email || ""}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                        />
                      ) : (
                        user.email
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={editForm?.role || "student"}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, role: event.target.value }))
                          }
                        >
                          <option value="student">student</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        user.role
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        {isEditing ? (
                          <>
                            <input
                              type="password"
                              placeholder="New password (optional)"
                              value={editForm?.newPassword || ""}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, newPassword: event.target.value }))
                              }
                            />
                            <button type="button" onClick={() => void handleSaveEdit()}>
                              Save
                            </button>
                            <button type="button" className="secondary" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEdit(user)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => void handleDelete(user)}
                              disabled={isCurrentUser}
                              title={
                                isCurrentUser
                                  ? "You cannot delete your own account"
                                  : "Delete user"
                              }
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AdminUsersPage;
