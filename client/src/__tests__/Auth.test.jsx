/**
 * Smoke tests for Auth page. Tests that the UI renders correctly.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the API client
vi.mock('../api/client', () => ({
  default: {
    post: vi.fn().mockRejectedValue({ response: { data: { error: 'Test error' } } }),
    get: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Mock zustand store
vi.mock('../store', () => ({
  default: vi.fn((selector) => selector({
    user: null, token: null, isAuthenticated: false,
    setAuth: vi.fn(), logout: vi.fn(), unreadCount: 0, setUnreadCount: vi.fn(),
  })),
}));

import Auth from '../pages/Auth';

const renderAuth = () =>
  render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>
  );

describe('Auth Page', () => {
  it('renders login form by default', () => {
    renderAuth();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();
    const submitBtns = screen.getAllByRole('button', { name: /sign in$/i });
    expect(submitBtns.some((b) => b.getAttribute('type') === 'submit')).toBe(true);
  });

  it('shows registration fields when Register tab is clicked', () => {
    renderAuth();
    const registerTabs = screen.getAllByRole('button', { name: /^create account$/i });
    const tab = registerTabs.find((b) => b.classList.contains('auth-tab'));
    expect(tab).toBeTruthy();
    fireEvent.click(tab);
    expect(screen.getByPlaceholderText(/^ashmit$/i)).toBeTruthy();
  });

  it('renders FinSocial branding', () => {
    renderAuth();
    expect(screen.getAllByText(/finsocial/i).length).toBeGreaterThan(0);
  });

  it('shows error on failed login without redirecting', async () => {
    const apiClient = (await import('../api/client')).default;
    renderAuth();
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrongpass' },
    });
    const submit = screen.getAllByRole('button', { name: /^sign in$/i })
      .find((b) => b.getAttribute('type') === 'submit');
    fireEvent.click(submit);
    expect(await screen.findByText('Test error')).toBeTruthy();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/auth/login',
      { email: 'bad@example.com', password: 'wrongpass' },
      { skipAuthRedirect: true },
    );
  });

  it('toggles password visibility', () => {
    renderAuth();
    const input = screen.getByPlaceholderText('••••••••');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
