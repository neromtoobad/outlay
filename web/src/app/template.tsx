'use client';
import { motion } from 'motion/react';

// Every route change fades and lifts the new page in.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
