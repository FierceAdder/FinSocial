import { NavLink, useNavigate } from 'react-router-dom';
import useStore from '../store';
import { useLogout } from '../hooks/useLogout';
import { Home, Users, MessageSquare, Briefcase, TrendingUp, LogOut, Bell, Clock, UserCircle } from 'lucide-react';
import { APP_BASE } from '../constants/routes';


const Sidebar = ({ onNotifClick, mobileOpen }) => {
  const { user, unreadCount } = useStore();
  const handleLogout = useLogout();
  const navigate = useNavigate();


  const navItems = [
    { to: APP_BASE, icon: <Home size={18} />, label: 'Home' },
    { to: `${APP_BASE}/tribe`, icon: <Users size={18} />, label: 'Tribe Rooms' },
    { to: `${APP_BASE}/forum`, icon: <MessageSquare size={18} />, label: 'Q&A Forum' },
    { to: `${APP_BASE}/portfolio`, icon: <Briefcase size={18} />, label: 'Portfolio' },
    { to: `${APP_BASE}/stocks`, icon: <TrendingUp size={18} />, label: 'Stocks' },
    { to: `${APP_BASE}/hindsight`, icon: <Clock size={18} />, label: 'Hindsight' },
    ...(user ? [{ to: `${APP_BASE}/profile/${user.id}`, icon: <UserCircle size={18} />, label: 'My Profile' }] : []),
  ];


  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} id="sidebar">
      <div className="sidebar-top">
        <div className="logo">
          <svg viewBox="0 0 28 28" fill="none" width="28" height="28">
            <rect width="28" height="28" rx="6" fill="#111"/>
            <path d="M7 20V12l5-4v12M16 20V8l5-4v16" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>FinSocial</span>
        </div>
        <div className="sidebar-top-actions">
          <button className="notif-bell" onClick={onNotifClick} aria-label="Notifications">
            <Bell size={18} />
            {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
        </div>
      </div>

      <nav className="nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === APP_BASE}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {user && (
        <div
          className="sidebar-profile"
          id="sidebarProfile"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`${APP_BASE}/profile/${user.id}`)}
          title="View my profile"
        >
          <div className="profile-av">{user.firstName?.[0]}{user.lastName?.[0]}</div>
          <div className="profile-meta">
            <strong>
              {user.firstName} {user.lastName}
              {user.isVerified && <span className="verified-badge" title="Verified Trader">✓</span>}
            </strong>
            <span>{user.experienceLevel === 'advanced' ? 'Verified Trader' : user.experienceLevel === 'intermediate' ? 'Intermediate' : 'Beginner'}</span>
          </div>
          <button
            className="logout-btn"
            onClick={(e) => { e.stopPropagation(); handleLogout(); }}
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}

    </aside>
  );
};

export default Sidebar;
