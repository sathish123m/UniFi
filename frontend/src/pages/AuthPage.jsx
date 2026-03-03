import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../lib/api";

const registerInit = {
  email: "",
  phone: "",
  password: "",
  firstName: "",
  lastName: "",
  role: "BORROWER",
};

const portalLabel = (role) => {
  if (role === "PROVIDER") return "Provider";
  if (role === "ADMIN") return "Admin";
  return "Borrower";
};

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, verifyOtp, resendOtp, loading } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [tab, setTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginPortal, setLoginPortal] = useState("");
  const [registerForm, setRegisterForm] = useState(registerInit);
  const [otpForm, setOtpForm] = useState({
    email: "",
    otp: "",
    purpose: "EMAIL_VERIFY",
    requestedRole: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [universities, setUniversities] = useState([]);
  const allowedDomains = universities.map((u) => u.emailDomain);
  const allowedDomain = allowedDomains[0] || "lpu.in";
  const allowedDomainsText =
    allowedDomains.length > 1 ? allowedDomains.join(" or ") : allowedDomain;

  const roleFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const role = (params.get("role") || "").toUpperCase();
    if (["BORROWER", "PROVIDER", "ADMIN"].includes(role)) return role;
    return "";
  }, [location.search]);

  const modeFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("mode") || "").toLowerCase();
  }, [location.search]);

  useEffect(() => {
    if (modeFromUrl === "register") {
      setTab("register");
      if (roleFromUrl === "BORROWER" || roleFromUrl === "PROVIDER") {
        setRegisterForm((p) => ({ ...p, role: roleFromUrl }));
      }
    } else if (modeFromUrl === "login") {
      setTab("login");
    } else if (roleFromUrl === "BORROWER" || roleFromUrl === "PROVIDER") {
      setTab("register");
      setRegisterForm((p) => ({ ...p, role: roleFromUrl }));
    }

    if (roleFromUrl) setLoginPortal(roleFromUrl);
  }, [roleFromUrl, modeFromUrl]);

  useEffect(() => {
    api
      .get("/auth/universities")
      .then((res) => setUniversities(res?.data || []))
      .catch(() => setUniversities([]));
  }, []);

  const parseError = (err) => {
    const details = err?.payload?.errors;
    if (Array.isArray(details) && details.length) {
      return details[0]?.message || err.message;
    }
    return err.message;
  };

  const isStrongPassword = (value) => {
    if (value.length < 8) return false;
    if (!/[A-Z]/.test(value)) return false;
    if (!/[a-z]/.test(value)) return false;
    if (!/[0-9]/.test(value)) return false;
    if (!/[^A-Za-z0-9]/.test(value)) return false;
    return true;
  };

  const isValidPhone = (value) =>
    /^\+[1-9]\d{9,14}$/.test(String(value || "").trim());

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setDevOtp("");
    try {
      await login({ ...loginForm, requestedRole: loginPortal || undefined });
      navigate("/portal");
    } catch (err) {
      setError(parseError(err));
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setDevOtp("");

    const normalizedEmail = String(registerForm.email || "")
      .trim()
      .toLowerCase();
    const isValidDomain = allowedDomains.some((domain) =>
      normalizedEmail.endsWith(`@${domain}`),
    );
    if (!isValidDomain) {
      setError(`Only @${allowedDomainsText} emails are allowed.`);
      return;
    }
    if (registerForm.phone && !isValidPhone(registerForm.phone)) {
      setError("Phone must be in format like +919876543210.");
      return;
    }
    if (!isStrongPassword(registerForm.password)) {
      setError(
        "Password must include uppercase, lowercase, number, special char, and be at least 8 chars.",
      );
      return;
    }

    try {
      const response = await register(registerForm);
      setOtpForm((p) => ({
        ...p,
        email: registerForm.email,
        requestedRole: registerForm.role,
      }));
      setTab("verify");
      setMessage(
        "Registration created. Check Inbox/Spam/Quarantine for OTP, then verify.",
      );
      if (response?.data?.devOtp) setDevOtp(response.data.devOtp);
    } catch (err) {
      setError(parseError(err));
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      await verifyOtp({
        ...otpForm,
        requestedRole: otpForm.requestedRole || loginPortal || undefined,
        otp: otpForm.otp.trim(),
      });
      setMessage("Email verified. Login now.");
      setTab("login");
      setLoginForm((p) => ({ ...p, email: otpForm.email }));
      if (otpForm.requestedRole) setLoginPortal(otpForm.requestedRole);
      setDevOtp("");
    } catch (err) {
      setError(parseError(err));
    }
  };

  const handleResend = async () => {
    setError("");
    setMessage("");
    try {
      const response = await resendOtp(
        otpForm.email,
        otpForm.requestedRole || loginPortal || undefined,
      );
      setMessage("OTP sent again. Check Inbox/Spam/Quarantine.");
      if (response?.data?.devOtp) setDevOtp(response.data.devOtp);
    } catch (err) {
      setError(parseError(err));
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-head">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Link to="/" className="logo">
              UniFi
            </Link>
            <button
              type="button"
              className="btn btn-ghost theme-toggle"
              onClick={toggleTheme}
            >
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
          <h1>Secure Campus Lending Access</h1>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={tab === "login" ? "active" : ""}
            onClick={() => setTab("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={tab === "register" ? "active" : ""}
            onClick={() => setTab("register")}
          >
            Register
          </button>
          <button
            type="button"
            className={tab === "verify" ? "active" : ""}
            onClick={() => setTab("verify")}
          >
            Verify OTP
          </button>
        </div>

        {tab === "login" && (
          <form className="auth-form" onSubmit={handleLogin}>
            {roleFromUrl ? (
              <p
                style={{
                  margin: 0,
                  color: "var(--muted)",
                  fontSize: "0.83rem",
                }}
              >
                Portal lock: <b>{portalLabel(roleFromUrl)}</b> login
              </p>
            ) : null}

            <input
              value={loginForm.email}
              onChange={(e) =>
                setLoginForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="University email"
              type="email"
              required
            />

            <input
              value={loginForm.password}
              onChange={(e) =>
                setLoginForm((p) => ({ ...p, password: e.target.value }))
              }
              placeholder="Password"
              type="password"
              required
            />

            {!roleFromUrl ? (
              <label>
                Portal (optional)
                <select
                  value={loginPortal}
                  onChange={(e) => setLoginPortal(e.target.value)}
                >
                  <option value="">Auto detect</option>
                  <option value="BORROWER">Borrower</option>
                  <option value="PROVIDER">Provider</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
            ) : null}

            <button
              className="btn btn-primary"
              disabled={loading}
              type="submit"
            >
              {loading ? "Please wait..." : "Login"}
            </button>
          </form>
        )}

        {tab === "register" && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-row">
              <input
                value={registerForm.firstName}
                onChange={(e) =>
                  setRegisterForm((p) => ({ ...p, firstName: e.target.value }))
                }
                placeholder="First name"
                required
              />
              <input
                value={registerForm.lastName}
                onChange={(e) =>
                  setRegisterForm((p) => ({ ...p, lastName: e.target.value }))
                }
                placeholder="Last name"
                required
              />
            </div>

            <input
              value={registerForm.email}
              onChange={(e) =>
                setRegisterForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="University email"
              type="email"
              required
            />

            <input
              value={registerForm.phone}
              onChange={(e) =>
                setRegisterForm((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="Phone (optional) e.g. +919876543210"
              type="tel"
            />

            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.8rem" }}>
              University email required: @{allowedDomainsText}. Same email can
              be used for Borrower and Provider by creating separate accounts.
            </p>

            <input
              value={registerForm.password}
              onChange={(e) =>
                setRegisterForm((p) => ({ ...p, password: e.target.value }))
              }
              placeholder="Strong password"
              type="password"
              required
            />

            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.8rem" }}>
              Password rule: 8+ chars, uppercase, lowercase, number, special
              character.
            </p>

            <select
              value={registerForm.role}
              onChange={(e) =>
                setRegisterForm((p) => ({ ...p, role: e.target.value }))
              }
            >
              <option value="BORROWER">Borrower</option>
              <option value="PROVIDER">Provider</option>
            </select>

            <button
              className="btn btn-primary"
              disabled={loading}
              type="submit"
            >
              {loading ? "Please wait..." : "Register"}
            </button>
          </form>
        )}

        {tab === "verify" && (
          <form className="auth-form" onSubmit={handleVerify}>
            <input
              value={otpForm.email}
              onChange={(e) =>
                setOtpForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="Registered email"
              type="email"
              required
            />
            <input
              value={otpForm.otp}
              onChange={(e) =>
                setOtpForm((p) => ({
                  ...p,
                  otp: e.target.value.replace(/\D/g, ""),
                }))
              }
              placeholder="6 digit OTP"
              maxLength={6}
              required
            />

            <label>
              OTP account type
              <select
                value={otpForm.requestedRole}
                onChange={(e) =>
                  setOtpForm((p) => ({ ...p, requestedRole: e.target.value }))
                }
              >
                <option value="">Auto</option>
                <option value="BORROWER">Borrower</option>
                <option value="PROVIDER">Provider</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>

            {devOtp ? (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setOtpForm((p) => ({ ...p, otp: devOtp }))}
              >
                Use Dev OTP
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              disabled={loading}
              type="submit"
            >
              {loading ? "Please wait..." : "Verify OTP"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleResend}
              disabled={loading || !otpForm.email}
            >
              Resend OTP
            </button>
          </form>
        )}

        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}
        {devOtp && (
          <p className="success-text">
            Dev OTP: <b>{devOtp}</b>
          </p>
        )}
      </div>
    </div>
  );
}
