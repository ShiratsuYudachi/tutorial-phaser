import React from 'react';
import { Icon } from '@iconify/react';
import { Inventory } from './Inventory';
import { Shop } from './Shop';
import { gameStore, useShopState } from './GameStore';

export function App() {
    const { isOpen, isNearBed } = useShopState();

    const handleOpenShop = () => {
        gameStore.openShop();
    };

    return (
        <>
            {/* Inventory at bottom */}
            <div style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000
            }}>
                <Inventory />
            </div>

            {/* Shop button (left side, when near bed) */}
            {isNearBed && !isOpen && (
                <div style={{
                    position: 'absolute',
                    left: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 1000
                }}>
                    <button
                        onClick={handleOpenShop}
                        style={{
                            background: 'rgba(255, 215, 0, 0.2)',
                            border: '3px solid rgba(255, 215, 0, 0.6)',
                            borderRadius: '12px',
                            color: '#FFD700',
                            padding: '16px 24px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 215, 0, 0.4)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 215, 0, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 215, 0, 0.2)';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.3)';
                        }}
                    >
                        <Icon icon="game-icons:shop" width="32" height="32" />
                        <span>Open Shop</span>
                    </button>
                </div>
            )}

            {/* Shop modal */}
            {isOpen && <Shop />}
        </>
    );
}

