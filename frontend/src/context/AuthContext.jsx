import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/api/auth/me')
      .then((response) => setUser(response.data.data.user))
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    const { token, user: signedInUser } = response.data.data;
    sessionStorage.setItem(TOKEN_KEY, token);
    setUser(signedInUser);
    return signedInUser;
  };

  const register = async (name, email, password) => {
    const response = await api.post('/api/auth/register', { name, email, password });
    const { token, user: registeredUser } = response.data.data;
    sessionStorage.setItem(TOKEN_KEY, token);
    setUser(registeredUser);
    return registeredUser;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  };

  const value = useMemo(() => ({ user, loading, login, register, logout, updateUser: setUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
