/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import ClientApp from './views/ClientApp';
import AdminApp from './views/AdminApp';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'client' | 'admin'>('client');
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        console.error("Firestore connection test failed:", error);
        if (error.message.includes('the client is offline') || error.code === 'unavailable' || error.code === 'failed-precondition') {
          setConnectionError("שגיאת חיבור ל-Firebase. ייתכן שהמסד נתונים עדיין לא מוכן או שיש בעיית אינטרנט. נסה לרענן את הדף.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Simple check for admin - in real app, check custom claims or a user doc
      // For this demo, we'll use the provided credentials in the AdminApp login
      setIsAdmin(!!user && user.email?.toLowerCase() === 'ybaron36@gmail.com');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Check URL hash for routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#admin') {
        setView('admin');
      } else {
        setView('client');
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-brand-cream">
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-6xl md:text-8xl font-display text-brand-red font-bold tracking-widest"
        >
          איה בר-און
        </motion.div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
          className="text-2xl md:text-4xl font-display text-brand-blue font-bold tracking-[0.2em] mt-2"
        >
          פשוט. מבשלת.
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream text-[#1a1a1a] font-sans selection:bg-brand-red/20" dir="rtl">
      {connectionError && (
        <div className="fixed top-4 left-4 right-4 z-[100] bg-red-500 text-white p-4 rounded-xl shadow-2xl text-center font-bold">
          {connectionError}
          <button 
            onClick={() => window.location.reload()} 
            className="mr-4 underline"
          >
            נסה שוב
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'client' ? (
          <motion.div
            key="client"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <ClientApp />
          </motion.div>
        ) : (
          <motion.div
            key="admin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <AdminApp />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin toggle for dev/demo */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => {
            const nextView = view === 'client' ? 'admin' : 'client';
            window.location.hash = nextView === 'admin' ? 'admin' : '';
          }}
          className="p-3 bg-white/80 backdrop-blur-sm border border-brand-red/20 rounded-2xl text-[12px] font-bold uppercase tracking-widest shadow-lg hover:bg-white transition-all text-brand-red"
        >
          {view === 'client' ? 'ניהול מטבח' : 'חזרה לתפריט'}
        </button>
      </div>
    </div>
  );
}

