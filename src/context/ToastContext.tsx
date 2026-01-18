import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'progress';

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    progress?: number; // 0-100
    total?: string;
    speed?: string;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => string;
    updateToast: (id: string, updates: Partial<ToastMessage>) => void;
    hideToast: (id: string) => void;
    toasts: ToastMessage[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3000) => {
        const id = Date.now().toString();
        const newToast = { id, message, type, duration };

        setToasts((prev) => {
            // If a progress toast exists, remove it to avoid stacking multiple progress bars if not handled
            if (type === 'progress') {
                return [...prev.filter(t => t.type !== 'progress'), newToast];
            }
            return [...prev, newToast];
        });

        if (duration > 0) {
            setTimeout(() => {
                hideToast(id);
            }, duration);
        }
        return id;
    }, []);

    const updateToast = useCallback((id: string, updates: Partial<ToastMessage>) => {
        setToasts((prev) => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    }, []);

    const hideToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, updateToast, hideToast, toasts }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
