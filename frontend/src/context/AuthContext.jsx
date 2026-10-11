import { createContext, useCallback, useEffect, useState } from 'react';
import { request, setAccessToken } from '../services/api';
export const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [token, setToken] = useState(null); const [loading, setLoading] = useState(true);
  const apply = (data) => { setAccessToken(data.accessToken); setToken(data.accessToken); setUser(data.user); return data.user; };
  const login = useCallback((values) => request('/auth/login', { method:'POST', body:JSON.stringify(values) }).then(apply), []);
  const register = useCallback((values) => request('/auth/register', { method:'POST', body:JSON.stringify(values) }).then(apply), []);
  const logout = useCallback(async () => { try { await request('/auth/logout', { method:'POST' }); } finally { setAccessToken(null); setToken(null); setUser(null); } }, []);
  const refreshUser = useCallback(() => request('/auth/me').then((data) => setUser(data.user)), []);
  useEffect(() => { request('/auth/refresh', { method:'POST' }).then(apply).catch(() => {}).finally(() => setLoading(false)); }, []);
  return <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>{children}</AuthContext.Provider>;
}
