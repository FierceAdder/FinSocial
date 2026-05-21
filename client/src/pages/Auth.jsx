import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import useStore from '../store';
import apiClient from '../api/client';
import { APP_BASE } from '../constants/routes';

const Auth = () => {
  const [tab, setTab] = useState('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useStore(state => state.setAuth);
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('beginner');
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated) return <Navigate to={APP_BASE} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const endpoint = tab === 'login' ? '/auth/login' : '/auth/register';
      const payload = tab === 'login'
        ? { email, password }
        : { email, password, firstName, lastName, experienceLevel };

      const response = await apiClient.post(endpoint, payload, { skipAuthRedirect: true });
      const { token, user } = response.data;
      setAuth(user, token);
      navigate(APP_BASE);
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong. Is the backend running?';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page fade-in" id="authPage">
      <div className="auth-container">
        <Link to="/" className="auth-back-link">← Back to home</Link>
        <Link to="/" className="auth-brand auth-brand-link">
          <svg viewBox="0 0 28 28" fill="none" width="28" height="28">
            <rect width="28" height="28" rx="6" fill="#111"/>
            <path d="M7 20V12l5-4v12M16 20V8l5-4v16" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>FinSocial</span>
        </Link>
        <p className="auth-tagline">Community-driven investing. Collective intelligence as a feature.</p>
        
        <div className="auth-card">
          <div className="auth-tabs">
            <button 
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`} 
              onClick={() => { setTab('login'); setError(''); setShowPassword(false); }}
            >
              Sign In
            </button>
            <button 
              className={`auth-tab ${tab === 'register' ? 'active' : ''}`} 
              onClick={() => { setTab('register'); setError(''); setShowPassword(false); }}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', margin: '0 24px', borderRadius: '8px',
              background: '#fef2f2', color: '#dc2626', fontSize: '.85rem',
              border: '1px solid #fecaca'
            }}>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            {tab === 'register' && (
              <div className="auth-form-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input className="form-input" type="text" placeholder="Ashmit" required 
                    value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input className="form-input" type="text" placeholder="K." required 
                    value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="you@example.com" required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">Password</label>
              <div className="auth-password-wrap">
                <input
                  id="auth-password"
                  className="form-input auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={tab === 'login' ? '••••••••' : 'Min. 8 characters'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </div>

            {tab === 'login' ? (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <label style={{fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text2)'}}>
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
                <a href="#" style={{fontSize: '.82rem', color: 'var(--blue)', textDecoration: 'none'}}>Forgot password?</a>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Experience Level</label>
                <select className="form-input" value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}>
                  <option value="beginner">🌱 Beginner — Just getting started</option>
                  <option value="intermediate">📈 Intermediate — Some experience</option>
                  <option value="advanced">🎯 Advanced — Experienced trader</option>
                </select>
              </div>
            )}

            <button className="btn btn-primary auth-submit" type="submit" disabled={isLoading}>
              {isLoading ? (tab === 'login' ? 'Signing in...' : 'Creating account...') : (tab === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="auth-divider"><span>or continue with</span></div>
          <div className="auth-social">
            <button className="auth-social-btn">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg> 
              Google
            </button>
            <button className="auth-social-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#333">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg> 
              GitHub
            </button>
          </div>
          
          <div className="auth-security">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Secure sign-in · traffic encrypted in transit</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
