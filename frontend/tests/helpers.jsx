import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext';

export const student = { id: 'u1', name: 'Test Student', email: 't@example.com', goalId: null, subTrack: null, hoursPerWeek: null, targetWeeks: null, onboardingComplete: false };

// Renders a page the way the app does: a router, and a signed-in student in the auth context.
export function renderPage(ui, { path = '/', user = student, routes = [] } = {}) {
  const auth = { user, token: 'token', loading: false, login: async () => {}, register: async () => {}, logout: async () => {}, refreshUser: async () => {} };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={ui} />
          {routes.map(({ path: to, text }) => <Route key={to} path={to} element={<p>{text}</p>} />)}
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

// A promise you resolve or reject yourself, to hold a request "in flight" while checking what the page shows.
export function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
