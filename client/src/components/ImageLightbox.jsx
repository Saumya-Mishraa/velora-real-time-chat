import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";

/**
 * Full-screen lightbox for a tapped/clicked chat image. Closes on
 * backdrop click or Escape. Rendered from MessageBubble, one instance
 * per open image (mounted only while `src` is set).
 */
const ImageLightbox = ({ src, alt, onClose }) => {
  useEffect(() => {
    if (!src) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.img
            key={src}
            src={src}
            alt={alt || "Shared image"}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg object-contain shadow-2xl"
          />

          <button
            onClick={onClose}
            aria-label="Close image"
            className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 sm:top-6 sm:right-6 p-2.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <X size={20} />
          </button>

          <a
            href={src}
            download
            onClick={(e) => e.stopPropagation()}
            aria-label="Download image"
            className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] left-4 sm:top-6 sm:left-6 p-2.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <Download size={20} />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageLightbox;
