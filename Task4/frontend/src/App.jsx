import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { verifyToken } from "./api";
import AdminPanel from "./components/AdminPanel";
import StudentPanel from "./components/StudentPanel";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsersPage from "./pages/AdminUsersPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import SignupPage from "./pages/SignupPage";
import StartTimedTestPage from "./pages/StartTimedTestPage";
import StudentSubmissionsPage from "./pages/StudentSubmissionsPage";
import TakeTimedTestPage from "./pages/TakeTimedTestPage";
import "./styles.css";

const TOKEN_KEY = "task4_react_token";
const THEME_KEY = "task4_theme";

function getHomeByRole(role) {
  return role === "admin" ? "/admin/dashboard" : "/student/dashboard";
}

function RequireAuth({ user, children }) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RequireRole({ user, role, children }) {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return <Navigate to={getHomeByRole(user.role)} replace />;
  }
  return children;
}

function AuthTopbar({ theme, onToggleTheme }) {
  return (
    <header className="topbar">
      <div className="topbar-row">
        <div>
          <h1>Interview Preparation Platform</h1>
          <p>Task 4 Product Flow</p>
        </div>
        <nav className="topnav-links">
          <button type="button" className="theme-toggle" onClick={onToggleTheme}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <Link to="/login">Login</Link>
          <Link to="/signup">Signup</Link>
        </nav>
      </div>
    </header>
  );
}

function UserTopbar({ user, onLogout, theme, onToggleTheme, testingNavigationLocked }) {
  const home = getHomeByRole(user.role);

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div>
          <h1>Interview Preparation Platform</h1>
          <p>
            {user.name} ({user.role})
          </p>
        </div>

        <nav className="topnav-links">
          <button type="button" className="theme-toggle" onClick={onToggleTheme}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          {testingNavigationLocked ? (
            <span className="nav-lock-indicator">Timed test in progress. Navigation locked.</span>
          ) : (
            <>
              <Link to={home}>Dashboard</Link>
              {user.role === "student" && <Link to="/student/submissions">Submissions</Link>}
              {user.role === "student" && <Link to="/student/test/new">Take Timed Test</Link>}
              {user.role === "admin" && <Link to="/admin/questions">Manage Questions</Link>}
              {user.role === "admin" && <Link to="/admin/users">Manage Users</Link>}
              <Link to="/profile">Profile</Link>
              <button type="button" className="danger" onClick={onLogout}>
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function App() {
  const location = useLocation();
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || "dark");

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function handleToggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const data = await verifyToken(token);
        setUser(data.user);
      } catch (error) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    void restoreSession();
  }, [token]);

  const authApi = useMemo(
    () => ({
      onAuthSuccess(newToken, newUser) {
        localStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
        setUser(newUser);
      }
    }),
    []
  );

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  }

  if (loading) {
    return (
      <>
        <AuthTopbar theme={theme} onToggleTheme={handleToggleTheme} />
        <main className="container">
          <section className="card">Loading session...</section>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AuthTopbar theme={theme} onToggleTheme={handleToggleTheme} />
        <main className="container">
          <Routes>
            <Route path="/login" element={<LoginPage onAuthSuccess={authApi.onAuthSuccess} />} />
            <Route path="/signup" element={<SignupPage onAuthSuccess={authApi.onAuthSuccess} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </>
    );
  }

  const testingNavigationLocked =
    user.role === "student" && /^\/student\/test\/[^/]+$/.test(location.pathname);

  return (
    <>
      <UserTopbar
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        testingNavigationLocked={testingNavigationLocked}
      />
      <main className="container">
        <Routes>
          <Route
            path="/student/dashboard"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="student">
                  <StudentPanel token={token} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/student/submissions"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="student">
                  <StudentSubmissionsPage token={token} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/student/test/new"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="student">
                  <StartTimedTestPage token={token} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/student/test/:sessionId"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="student">
                  <TakeTimedTestPage token={token} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="admin">
                  <AdminDashboard token={token} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/questions"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="admin">
                  <AdminPanel token={token} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/admin/users"
            element={
              <RequireAuth user={user}>
                <RequireRole user={user} role="admin">
                  <AdminUsersPage token={token} currentUser={user} />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/profile"
            element={
              <RequireAuth user={user}>
                <ProfilePage token={token} user={user} onProfileUpdate={setUser} />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to={getHomeByRole(user.role)} replace />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
