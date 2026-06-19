"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export default function RadarScan({ trigger }: { trigger: string | number }) {
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    // Deliberate one-shot: start the scan beam when `trigger` changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsScanning(true);
    const t = setTimeout(() => setIsScanning(false), 1200);
    return () => clearTimeout(t);
  }, [trigger]);

  return (
    <AnimatePresence>
      {isScanning && (
        <motion.div
          initial={{ top: "-10%", opacity: 0 }}
          animate={{ top: "110%", opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 1.2, ease: "linear" }}
          className="absolute left-0 right-0 h-32 pointer-events-none z-20 overflow-hidden"
          style={{
            background: "linear-gradient(to bottom, transparent, rgba(16, 185, 129, 0.05) 50%, rgba(16, 185, 129, 0.4) 95%, rgba(16, 185, 129, 0.8) 100%)",
            borderBottom: "2px solid rgba(16, 185, 129, 0.8)",
            boxShadow: "0 10px 30px rgba(16, 185, 129, 0.3)"
          }}
        />
      )}
    </AnimatePresence>
  );
}
