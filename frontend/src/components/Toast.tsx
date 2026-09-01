import React, { useEffect } from 'react';
import { AlertTriangle, X, CheckCircle, Info } from 'lucide-react';

export interface ToastData {
  text: string;
  type: 'error' | 'info' | 'success';
  id: number;
}

interface ToastProps {
  toast: ToastData | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 3200); // Disappears cleanly after 3.2 seconds
    return () => clearTimeout(timer);
  }, [toast?.id, onClose]);

  if (!toast) return null;

  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md max-w-md ${
          isError
            ? 'bg-pulse-red/15 border-pulse-red text-white shadow-[0_0_20px_rgba(255,0,85,0.25)]'
            : isSuccess
            ? 'bg-pulse-green/15 border-pulse-green text-white shadow-[0_0_20px_rgba(0,255,102,0.25)]'
            : 'bg-pulse-card border-pulse-accent text-white shadow-[0_0_20px_rgba(0,240,255,0.25)]'
        }`}
      >
        <div className="shrink-0">
          {isError ? (
            <AlertTriangle className="w-4 h-4 text-pulse-red" />
          ) : isSuccess ? (
            <CheckCircle className="w-4 h-4 text-pulse-green" />
          ) : (
            <Info className="w-4 h-4 text-pulse-accent" />
          )}
        </div>

        <div className="flex-1 text-xs font-mono font-medium leading-relaxed">
          {toast.text}
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-pulse-muted hover:text-white transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
