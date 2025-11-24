import React from 'react';
import { Inventory } from './Inventory';

export function App() {
    return (
        <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000
        }}>
            <Inventory />
        </div>
    );
}

