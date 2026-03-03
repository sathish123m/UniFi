import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { openRazorpayCheckout } from "../lib/razorpay";

const sections = [
  { key: "overview", label: "Dashboard" },
  { key: "marketplace", label: "Marketplace" },
  { key: "wallet", label: "Wallet & Earnings" },
  { key: "portfolio", label: "Portfolio" },
  { key: "upi", label: "UPI Settings" },
  { key: "alerts", label: "Alerts" },
];

const money = (n = 0) => `INR ${Number(n).toLocaleString("en-IN")}`;
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" })
    : "Not set";

const riskClass = (score = 0) => {
  if (score >= 720) return "risk-low";
  if (score >= 640) return "risk-medium";
  return "risk-high";
};

const riskLabel = (score = 0) => {
  if (score >= 720) return "Low Risk";
  if (score >= 640) return "Medium Risk";
  return "High Risk";
};

export default function ProviderPanel() {
  const { accessToken, user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [dashboard, setDashboard] = useState(null);
  const [marketplace, setMarketplace] = useState([]);
  const [myLoans, setMyLoans] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [upi, setUpi] = useState("");
  const [currentUpi, setCurrentUpi] = useState(null);

  const [filters, setFilters] = useState({
    tenure: "",
    minScore: 300,
    maxAmount: 10000,
  });

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const [d, m, l, n, u] = await Promise.all([
        api.get("/users/dashboard", accessToken),
        api.get("/loans/marketplace", accessToken),
        api.get("/loans/my", accessToken),
        api.get("/users/notifications", accessToken),
        api.get("/users/upi", accessToken),
      ]);
      setDashboard(d.data);
      setMarketplace(m.data || []);
      setMyLoans(l.data || []);
      setNotifications(n.data || []);
      setCurrentUpi(u.data?.upiId || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const filteredMarketplace = useMemo(() => {
    return marketplace.filter((loan) => {
      const tenureMatch = !filters.tenure || loan.tenure === filters.tenure;
      const scoreMatch = loan.creditScore >= Number(filters.minScore);
      const amountMatch = loan.principalAmount <= Number(filters.maxAmount);
      return tenureMatch && scoreMatch && amountMatch;
    });
  }, [marketplace, filters]);

  const walletTransactions = useMemo(() => {
    return myLoans.slice(0, 12).map((loan) => {
      const isCredit = loan.status === "REPAID";
      return {
        id: loan.id,
        title: loan.publicId,
        sub: `${loan.status} · ${dateLabel(loan.updatedAt || loan.createdAt)}`,
        amount: isCredit
          ? Number(loan.providerEarning || 0)
          : Number(loan.principalAmount || 0),
        type: isCredit ? "credit" : "debit",
      };
    });
  }, [myLoans]);

  const providerStats = [
    {
      label: "Total Fundings",
      value: dashboard?.totalFundings || 0,
      tone: "green",
    },
    {
      label: "Principal Deployed",
      value: money(dashboard?.principalDeployed || 0),
      tone: "gold",
    },
    {
      label: "Earnings Received",
      value: money(dashboard?.earned || 0),
      tone: "green",
    },
    {
      label: "Unread Alerts",
      value: notifications.filter((n) => !n.isRead).length,
      tone: "blue",
    },
  ];

  const fundLoan = async (loanId) => {
    setError("");
    setMessage("");
    try {
      await api.post(`/loans/${loanId}/fund`, {}, accessToken);
      const order = await api.post(`/payments/fund/${loanId}`, {}, accessToken);
      if (order.data.provider === "MOCK") {
        await api.post(`/payments/fund/${loanId}/confirm`, {}, accessToken);
      } else if (order.data.provider === "RAZORPAY") {
        const payment = await openRazorpayCheckout({
          key: order.data.keyId,
          orderId: order.data.orderId,
          amount: order.data.amount,
          description: `Funding for ${order.data.publicId}`,
          prefill: { email: user?.email },
        });

        await api.post(
          "/payments/verify",
          {
            orderId: payment.razorpay_order_id,
            paymentId: payment.razorpay_payment_id,
            signature: payment.razorpay_signature,
            loanId,
            type: "FUNDING",
          },
          accessToken,
        );
      }
      setMessage("Loan funded successfully and disbursal completed.");
      await reload();
    } catch (err) {
      if (err.message === "Payment popup closed") {
        try {
          await api.post(`/payments/fund/${loanId}/release`, {}, accessToken);
          setMessage(
            "Payment canceled. Funding slot released back to marketplace.",
          );
          await reload();
          return;
        } catch {
          setError(
            "Payment canceled. Reservation release failed, please retry funding.",
          );
          return;
        }
      }
      setError(err.message);
    }
  };

  const markRead = async (id) => {
    try {
      await api.patch(`/users/notifications/${id}/read`, {}, accessToken);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const linkUpi = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.post("/users/upi", { upiId: upi }, accessToken);
      setMessage("UPI linked successfully.");
      setUpi("");
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AppShell
      user={user}
      onLogout={logout}
      title="Provider Workspace"
      subtitle="Marketplace discovery, wallet view, and portfolio tracking."
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      stats={providerStats}
    >
      {loading ? <p>Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      {!loading && activeSection === "overview" && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-p">⚡ Provider Dashboard</div>
            <h2>Live Requests and Portfolio Snapshot</h2>
          </div>

          <div className="portal-motion provider-motion">
            <div className="portal-motion-track">
              <span>Discover Requests</span>
              <span>Assess Risk</span>
              <span>Fund via UPI</span>
              <span>Earn Returns</span>
            </div>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Quick Marketplace View</h3>
              <div className="stack-sm">
                {filteredMarketplace.slice(0, 4).map((loan) => (
                  <div className="portal-row" key={loan.id}>
                    <div className="portal-row-main">
                      <strong>{loan.publicId}</strong>
                      <small>
                        {money(loan.principalAmount)} · Score {loan.creditScore}{" "}
                        · {loan.tenure}
                      </small>
                    </div>
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => fundLoan(loan.id)}
                    >
                      Fund
                    </button>
                  </div>
                ))}
                {!filteredMarketplace.length ? (
                  <p>No loans match current filter.</p>
                ) : null}
              </div>
            </article>

            <article className="portal-panel-card">
              <h3>Portfolio Health</h3>
              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Active Loans</span>
                  <strong>
                    {myLoans.filter((l) => l.status === "ACTIVE").length}
                  </strong>
                </div>
                <div className="portal-kv-row">
                  <span>Repaid Loans</span>
                  <strong>
                    {myLoans.filter((l) => l.status === "REPAID").length}
                  </strong>
                </div>
                <div className="portal-kv-row">
                  <span>Expected Earnings</span>
                  <strong>
                    {money(
                      myLoans.reduce(
                        (sum, l) => sum + Number(l.providerEarning || 0),
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setActiveSection("wallet")}
                >
                  Open Wallet
                </button>
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === "marketplace" && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-p">🏪 Loan Marketplace</div>
            <h2>Filter and Fund Borrower Requests</h2>
          </div>

          <div className="portal-panel-card filter-row">
            <label>
              Tenure
              <select
                value={filters.tenure}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, tenure: e.target.value }))
                }
              >
                <option value="">All</option>
                <option value="SEVEN">7 days</option>
                <option value="FOURTEEN">14 days</option>
                <option value="THIRTY">30 days</option>
              </select>
            </label>
            <label>
              Min Score
              <input
                type="number"
                value={filters.minScore}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, minScore: e.target.value }))
                }
              />
            </label>
            <label>
              Max Amount
              <input
                type="number"
                value={filters.maxAmount}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, maxAmount: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="portal-panel-card stack-sm">
            {filteredMarketplace.map((loan) => (
              <div key={loan.id} className="portal-row">
                <div className="portal-row-main">
                  <strong>{loan.publicId}</strong>
                  <small>
                    Score {loan.creditScore} · {money(loan.principalAmount)} to{" "}
                    {money(loan.totalRepayAmount)} · {loan.tenure}
                  </small>
                </div>
                <div className="portal-row-end">
                  <span
                    className={`portal-pill-risk ${riskClass(loan.creditScore)}`}
                  >
                    {riskLabel(loan.creditScore)}
                  </span>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => fundLoan(loan.id)}
                  >
                    Fund Loan
                  </button>
                </div>
              </div>
            ))}
            {!filteredMarketplace.length ? (
              <p>No open requests available currently.</p>
            ) : null}
          </div>
        </section>
      )}

      {!loading && activeSection === "wallet" && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-p">💰 Wallet & Earnings</div>
            <h2>Balance, Earnings, and Activity</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Wallet Summary</h3>
              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Available Balance</span>
                  <strong>{money(dashboard?.earned || 0)}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Total Deployed</span>
                  <strong>{money(dashboard?.principalDeployed || 0)}</strong>
                </div>
                <div className="portal-kv-row">
                  <span>Total Returns</span>
                  <strong>
                    {money(
                      myLoans.reduce(
                        (sum, l) => sum + Number(l.totalRepayAmount || 0),
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <div className="portal-chip-list">
                  <button type="button" className="portal-chip">
                    Withdraw to UPI
                  </button>
                  <button type="button" className="portal-chip">
                    Reinvest
                  </button>
                </div>
              </div>
            </article>

            <article className="portal-panel-card">
              <h3>Recent Activity</h3>
              <div className="stack-sm">
                {walletTransactions.map((tx) => (
                  <div key={tx.id} className="portal-row compact">
                    <div className="portal-row-main">
                      <strong>{tx.title}</strong>
                      <small>{tx.sub}</small>
                    </div>
                    <span
                      className={
                        tx.type === "credit" ? "tone-green" : "tone-gold"
                      }
                    >
                      {tx.type === "credit" ? "+" : "-"}
                      {money(tx.amount)}
                    </span>
                  </div>
                ))}
                {!walletTransactions.length ? (
                  <p>No wallet activity yet.</p>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      )}

      {!loading && activeSection === "upi" && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-p">💳 UPI Settings</div>
            <h2>Manage Your UPI for Withdrawals</h2>
          </div>

          <div className="portal-grid portal-grid-two">
            <article className="portal-panel-card">
              <h3>Current UPI</h3>
              <div className="stack-sm">
                <div className="portal-kv-row">
                  <span>Linked UPI ID</span>
                  <strong>{currentUpi || "Not linked"}</strong>
                </div>
                <p className="portal-note">
                  This UPI will be used for receiving loan repayments from
                  borrowers.
                </p>
              </div>
            </article>

            <form className="portal-panel-card form" onSubmit={linkUpi}>
              <h3>Link New UPI</h3>
              <label>
                UPI ID
                <input
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  placeholder="name@upi"
                  required
                />
              </label>
              <button className="btn btn-primary" type="submit">
                Save UPI
              </button>
            </form>
          </div>
        </section>
      )}

      {!loading && activeSection === "portfolio" && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-p">📈 My Portfolio</div>
            <h2>All Funded Loans and Return Tracking</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {myLoans.map((loan) => (
              <div className="portal-row" key={loan.id}>
                <div className="portal-row-main">
                  <strong>{loan.publicId}</strong>
                  <small>
                    {loan.status} · Due {dateLabel(loan.dueAt)} · Principal{" "}
                    {money(loan.principalAmount)}
                  </small>
                  <div className="portal-progress">
                    <div
                      className="portal-progress-fill tone-green"
                      style={{
                        width: `${loan.status === "REPAID" ? 100 : 45}%`,
                      }}
                    ></div>
                  </div>
                </div>
                <strong>{money(loan.providerEarning || 0)}</strong>
              </div>
            ))}
            {!myLoans.length ? <p>No loans in your portfolio yet.</p> : null}
          </div>
        </section>
      )}

      {!loading && activeSection === "alerts" && (
        <section className="portal-section">
          <div className="portal-section-head">
            <div className="portal-label pl-p">🔔 Alerts</div>
            <h2>Notification Stream</h2>
          </div>

          <div className="portal-panel-card stack-sm">
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`portal-row ${n.isRead ? "" : "unread unread-p"}`}
                onClick={() => markRead(n.id)}
              >
                <div className="portal-row-main">
                  <strong>{n.title}</strong>
                  <small>
                    {n.message || "Tap to mark this alert as read."}
                  </small>
                </div>
                <span>{n.isRead ? "Read" : "Mark"}</span>
              </button>
            ))}
            {!notifications.length ? <p>No alerts.</p> : null}
          </div>
        </section>
      )}
    </AppShell>
  );
}
