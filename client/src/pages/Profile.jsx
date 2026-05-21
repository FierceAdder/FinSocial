import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserCheck, UserPlus, TrendingUp, BarChart2, Award, ArrowLeft } from 'lucide-react';
import apiClient from '../api/client';
import useStore from '../store';
import { APP_BASE } from '../constants/routes';

/* ── helpers ─────────────────────────────────────────── */
const initials = (u) =>
  u ? ((u.firstName?.[0] ?? '') + (u.lastName?.[0] ?? '')).toUpperCase() : '?';

const levelLabel = (lvl) =>
  lvl === 'advanced' ? 'Advanced Trader' : lvl === 'intermediate' ? 'Intermediate' : 'Beginner';

const levelColor = (lvl) =>
  lvl === 'advanced' ? 'badge-green' : lvl === 'intermediate' ? 'badge-blue' : 'badge-gray';

function StatPill({ label, value, sub }) {
  return (
    <div className="profile-stat-pill">
      <div className="profile-stat-val">{value}</div>
      <div className="profile-stat-label">{label}</div>
      {sub && <div className="profile-stat-sub">{sub}</div>}
    </div>
  );
}

/* ── component ───────────────────────────────────────── */
const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentUser = useStore((s) => s.user);
  const isOwnProfile = currentUser?.id === userId;

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, statsRes] = await Promise.all([
        apiClient.get(`/social/users/${userId}`),
        apiClient.get(`/social/users/${userId}/stats`).catch(() => ({ data: { snapshot: null, isFollowing: false } })),
      ]);
      setProfile(profileRes.data);
      setStats(statsRes.data.snapshot);
      setIsFollowing(statsRes.data.isFollowing);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleFollow = async () => {
    if (!currentUser) { navigate('/auth'); return; }
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await apiClient.delete(`/social/users/${userId}/follow`);
        setIsFollowing(false);
        setProfile((p) => p ? { ...p, _count: { ...p._count, followers: Math.max(0, (p._count?.followers ?? 1) - 1) } } : p);
        showToast('Unfollowed');
      } else {
        await apiClient.post(`/social/users/${userId}/follow`);
        setIsFollowing(true);
        setProfile((p) => p ? { ...p, _count: { ...p._count, followers: (p._count?.followers ?? 0) + 1 } } : p);
        showToast(`Following ${profile?.firstName}!`);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Action failed');
    } finally {
      setFollowLoading(false);
    }
  };

  /* ── loading / error states ─────────────────────────── */
  if (loading) {
    return (
      <div className="page fade-in" id="profilePage">
        <div className="profile-loading">
          <div className="profile-loading-av" />
          <div className="profile-loading-line" style={{ width: 140 }} />
          <div className="profile-loading-line" style={{ width: 90 }} />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page fade-in" id="profilePage">
        <button className="stock-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text3)' }}>
          {error || 'User not found'}
        </div>
      </div>
    );
  }

  const {
    firstName, lastName, username, bio, mentorBio,
    experienceLevel, isVerified, verifiedReason, createdAt,
    _count, holdings,
  } = profile;

  const fullName = `${firstName} ${lastName}`;
  const joinDate = new Date(createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const returnsPct = stats?.returnsPct ?? null;
  const winRate = stats?.winRate != null ? Math.round(stats.winRate * 100) : null;
  const tradeCount = stats?.tradeCount ?? _count?.trades ?? 0;
  const portfolioValue = stats?.portfolioValue ?? null;

  /* public holdings — only show ticker + current alloc sense */
  const publicHoldings = (holdings ?? []).filter((h) => h.stock);

  return (
    <div className="page fade-in" id="profilePage">
      {toast && <div className="trade-toast">{toast}</div>}

      <button className="stock-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Back
      </button>

      {/* ── Hero card ── */}
      <div className="card profile-hero">
        <div className="profile-hero-left">
          <div className="profile-hero-av">
            {initials(profile)}
          </div>
          <div className="profile-hero-info">
            <div className="profile-hero-name">
              {fullName}
              {isVerified && (
                <span className="verified-badge" title={verifiedReason || 'Verified Trader'}>✓</span>
              )}
            </div>
            <div className="profile-hero-username">@{username}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${levelColor(experienceLevel)}`}>
                {levelLabel(experienceLevel)}
              </span>
              <span style={{ fontSize: '.72rem', color: 'var(--text3)' }}>Joined {joinDate}</span>
            </div>
            <div className="profile-follow-counts">
              <span><strong>{_count?.followers ?? 0}</strong> followers</span>
              <span><strong>{_count?.following ?? 0}</strong> following</span>
            </div>
          </div>
        </div>

        {!isOwnProfile && currentUser && (
          <button
            className={`btn ${isFollowing ? '' : 'btn-primary'} profile-follow-btn`}
            onClick={handleFollow}
            disabled={followLoading}
          >
            {isFollowing
              ? <><UserCheck size={14} /> Following</>
              : <><UserPlus size={14} /> Follow</>}
          </button>
        )}
        {isOwnProfile && (
          <span style={{ fontSize: '.78rem', color: 'var(--text3)', fontStyle: 'italic' }}>This is you</span>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="profile-stats-row">
        <StatPill
          label="All-time Return"
          value={returnsPct != null ? `${returnsPct >= 0 ? '+' : ''}${returnsPct.toFixed(2)}%` : '—'}
          sub={returnsPct != null ? (returnsPct >= 0 ? '▲ Profitable' : '▼ In loss') : 'No data yet'}
        />
        <StatPill
          label="Win Rate"
          value={winRate != null ? `${winRate}%` : '—'}
          sub={winRate != null ? `${tradeCount} total trades` : undefined}
        />
        <StatPill
          label="Total Trades"
          value={tradeCount}
        />
        {portfolioValue != null && (
          <StatPill
            label="Portfolio Value"
            value={`₹${(portfolioValue / 100000).toFixed(1)}L`}
          />
        )}
      </div>

      {/* ── Bio / Mentor bio ── */}
      {(bio || mentorBio) && (
        <div className="card profile-bio-card">
          {bio && (
            <div className="profile-bio-section">
              <div className="profile-bio-label">About</div>
              <p className="profile-bio-text">{bio}</p>
            </div>
          )}
          {mentorBio && (
            <div className="profile-bio-section">
              <div className="profile-bio-label" style={{ color: 'var(--blue)' }}>
                <Award size={12} style={{ display: 'inline', marginRight: 4 }} />
                Mentor note
              </div>
              <p className="profile-bio-text">{mentorBio}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Holdings ── */}
      {publicHoldings.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={15} />
            Current Holdings
            <span style={{ fontSize: '.72rem', color: 'var(--text3)', fontWeight: 400 }}>
              ({publicHoldings.length} position{publicHoldings.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div className="profile-holdings-grid">
            {publicHoldings.map((h) => {
              const pnlPct = h.averageCost > 0
                ? ((h.stock.price - h.averageCost) / h.averageCost) * 100
                : 0;
              return (
                <div
                  key={h.id}
                  className="profile-holding-chip"
                  onClick={() => navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(h.stock.ticker || '')}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(h.stock.ticker || '')}`)}
                >
                  <div className="profile-holding-ticker mono">{h.stock.displayTicker}</div>
                  <div className="profile-holding-qty">{h.totalQuantity} shares</div>
                  <div className={`profile-holding-pnl mono ${pnlPct >= 0 ? 'positive' : 'negative'}`}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state if brand new user ── */}
      {publicHoldings.length === 0 && tradeCount === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text3)' }}>
          <TrendingUp size={32} style={{ margin: '0 auto 12px', opacity: .3 }} />
          <div style={{ fontSize: '.9rem' }}>No trading activity yet</div>
        </div>
      )}
    </div>
  );
};

export default Profile;
