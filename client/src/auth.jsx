import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

// Knows who is logged in, for every page. Wraps the whole app in App.jsx.
export function AuthProvider({ children }) {
  // undefined while checking the session cookie, then null (logged out) or the user.
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.me().then(
      (data) => setUser(data.user),
      () => setUser(null),
    );
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading: user === undefined,
      setUser,
      async signup(details) {
        const created = await api.signup(details);
        setUser(created);
        return created;
      },
      async login(email, password) {
        const loggedIn = await api.login(email, password);
        setUser(loggedIn);
        return loggedIn;
      },
      async logout() {
        await api.logout();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
