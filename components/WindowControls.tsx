import React from 'react';
import { Minus, Square, X } from './Icons';

const WindowControls: React.FC = () => {
    return (
        <div className="titlebar">
            <div className="drag-region"></div>

            <div className="window-controls">
                <button className="btn-window minimize" onClick={() => window.win?.minimize()}>
                    <Minus size={12} />
                </button>
                <button className="btn-window maximize" onClick={() => window.win?.maximize()}>
                    <Square size={10} />
                </button>
                <button className="btn-window close" onClick={() => window.win?.close()}>
                    <X size={12} />
                </button>
            </div>
        </div>
    );
};

export default WindowControls;
