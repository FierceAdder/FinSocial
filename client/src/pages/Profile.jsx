import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserCheck, UserPlus, TrendingUp, BarChart2, Award, ArrowLeft, Pencil, X } from 'lucide-react';
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

/** Full API ticker (e.g. RELIANCE.NS) for stocks deep-link; profile API may only send displayTicker. */
const holdingStockTicker = (stock) => {
  if (!stock) return '';
  if (stock.ticker) return stock.ticker;
  const d = stock.displayTicker?.trim();
  if (!d) return '';
  return d.includes('.') ? d : `${d}.NS`;
};

function StatPill({ label, value, sub }) {
  return (
    <div className="profile-stat-pill">
      <div className="profile-stat-val">{value}</div>
      <div className="profile-stat-label">{label}</div>
      {sub && <div className="profile-stat-sub">{sub}</div>}
    </div>
  );
}

function FollowListModal({ title, users, loading, onClose, onSelectUser }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card profile-follow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-follow-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden />
        </button>
        <h3 id="profile-follow-modal-title" style={{ marginBottom: 16 }}>{title}</h3>
        {loading ? (
          <p style={{ color: 'var(--text3)', fontSize: '.88rem' }}>Loading…</p>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: '.88rem' }}>No one here yet.</p>
        ) : (
          <ul className="profile-follow-list">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="profile-follow-list-item"
                  onClick={() => onSelectUser(u.id)}
                >
                  <span className="profile-follow-list-av">{initials(u)}</span>
                  <span className="profile-follow-list-meta">
                    <strong>{u.firstName} {u.lastName}</strong>
                    <span className="mono">@{u.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BioEditModal({ bio, saving, onClose, onChange, onSave }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card profile-bio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-bio-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden />
        </button>
        <h3 id="profile-bio-modal-title" style={{ marginBottom: 12 }}>Edit about</h3>
        <p style={{ fontSize: '.8rem', color: 'var(--text3)', marginBottom: 12 }}>
          Tell others how you trade. Max 500 characters.
        </p>
        <textarea
          className="form-input profile-bio-textarea"
          rows={5}
          maxLength={500}
          value={bio}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Swing trader focused on NSE large-caps…"
        />
        <div className="profile-bio-modal-footer">
          <span className="mono" style={{ fontSize: '.72rem', color: 'var(--text3)' }}>
            {bio.length}/500
          </span>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── component ───────────────────────────────────────── */
const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentUser = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const isOwnProfile = currentUser?.id === userId;

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');

  const [bioEditOpen, setBioEditOpen] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [bioSaving, setBioSaving] = useState(false);

  const [followModal, setFollowModal] = useState(/** @type {null | 'followers' | 'following'} */ (null));
  const [followList, setFollowList] = useState([]);
  const [followListLoading, setFollowListLoading] = useState(false);

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

  const openFollowModal = async (kind) => {
    setFollowModal(kind);
    setFollowList([]);
    setFollowListLoading(true);
    try {
      const path = kind === 'followers'
        ? `/social/users/${userId}/followers`
        : `/social/users/${userId}/following`;
      const res = await apiClient.get(path);
      setFollowList(Array.isArray(res.data) ? res.data : []);
    } catch {
      showToast('Could not load list');
      setFollowModal(null);
    } finally {
      setFollowListLoading(false);
    }
  };

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

  const openBioEdit = () => {
    setBioDraft(profile?.bio ?? '');
    setBioEditOpen(true);
  };

  const saveBio = async () => {
    setBioSaving(true);
    try {
      const res = await apiClient.patch('/social/users/me/profile', { bio: bioDraft });
      setProfile((p) => (p ? { ...p, bio: res.data.bio } : p));
      if (isOwnProfile && currentUser) {
        setUser({ ...currentUser, bio: res.data.bio });
      }
      setBioEditOpen(false);
      showToast('About updated');
    } catch (err) {
      showToast(err.response?.data?.error || 'Could not save');
    } finally {
      setBioSaving(false);
    }
  };

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
  const closedSellCount = stats?.closedSellCount ?? 0;
  const winRatioPct = stats?.winRate != null ? Math.round(stats.winRate * 100) : null;
  const tradeCount = stats?.tradeCount ?? _count?.trades ?? 0;
  const portfolioValue = stats?.portfolioValue ?? null;

  const publicHoldings = (holdings ?? []).filter((h) => h.stock);
  const showAboutCard = Boolean(bio || mentorBio || isOwnProfile);

  return (
    <div className="page fade-in" id="profilePage">
      {toast && <div className="trade-toast">{toast}</div>}

      {followModal && (
        <FollowListModal
          title={followModal === 'followers' ? 'Followers' : 'Following'}
          users={followList}
          loading={followListLoading}
          onClose={() => setFollowModal(null)}
          onSelectUser={(id) => {
            setFollowModal(null);
            if (id !== userId) navigate(`${APP_BASE}/profile/${id}`);
          }}
        />
      )}

      {bioEditOpen && (
        <BioEditModal
          bio={bioDraft}
          saving={bioSaving}
          onClose={() => setBioEditOpen(false)}
          onChange={setBioDraft}
          onSave={saveBio}
        />
      )}

      <button className="stock-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Back
      </button>

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
              <button
                type="button"
                className="profile-follow-count-btn"
                onClick={() => openFollowModal('followers')}
              >
                <strong>{_count?.followers ?? 0}</strong> followers
              </button>
              <button
                type="button"
                className="profile-follow-count-btn"
                onClick={() => openFollowModal('following')}
              >
                <strong>{_count?.following ?? 0}</strong> following
              </button>
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

      <div className="profile-stats-row">
        <StatPill
          label="All-time Return"
          value={returnsPct != null ? `${returnsPct >= 0 ? '+' : ''}${returnsPct.toFixed(2)}%` : '—'}
          sub={returnsPct != null ? (returnsPct >= 0 ? '▲ Profitable' : '▼ In loss') : 'No data yet'}
        />
        <StatPill
          label="Win Ratio"
          value={winRatioPct != null ? `${winRatioPct}%` : '—'}
          sub={
            closedSellCount > 0
              ? `${closedSellCount} closed sell${closedSellCount !== 1 ? 's' : ''}`
              : 'No closed sells yet'
          }
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

      {showAboutCard && (
        <div className="card profile-bio-card">
          <div className="profile-bio-card-head">
            <div className="profile-bio-label">About</div>
            {isOwnProfile && (
              <button type="button" className="profile-bio-edit-btn" onClick={openBioEdit}>
                <Pencil size={13} aria-hidden />
                {bio ? 'Edit' : 'Add'}
              </button>
            )}
          </div>
          {bio ? (
            <p className="profile-bio-text">{bio}</p>
          ) : isOwnProfile ? (
            <p className="profile-bio-text profile-bio-placeholder">
              Add a short bio so others know your style and focus.
            </p>
          ) : null}
          {mentorBio && (
            <div className="profile-bio-section" style={{ marginTop: bio || isOwnProfile ? 14 : 0 }}>
              <div className="profile-bio-label" style={{ color: 'var(--blue)' }}>
                <Award size={12} style={{ display: 'inline', marginRight: 4 }} />
                Mentor note
              </div>
              <p className="profile-bio-text">{mentorBio}</p>
            </div>
          )}
        </div>
      )}

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
              const stockTicker = holdingStockTicker(h.stock);
              const goToStock = () => {
                if (!stockTicker) return;
                navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(stockTicker)}`);
              };
              return (
                <div
                  key={h.id}
                  className="profile-holding-chip"
                  onClick={goToStock}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && goToStock()}
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
