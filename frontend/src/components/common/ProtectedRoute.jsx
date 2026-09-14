import { Navigate } from 'react-router-dom'; import useAuth from '../../hooks/useAuth';
export default function ProtectedRoute({ children }) { const { user, loading } = useAuth(); if (loading) return <div className="min-h-screen bg-cream p-10"><div className="mx-auto h-8 max-w-5xl animate-pulse bg-pale" /></div>; return user ? children : <Navigate to="/login" replace />; }
