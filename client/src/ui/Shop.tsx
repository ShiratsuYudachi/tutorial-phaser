import React, { useEffect } from "react";
import { Icon } from "@iconify/react";
import { gameStore, useCurrentPlayer, useGameEnded } from "./GameStore";
import { SHOP_TRADES, ITEM_DEFINITIONS, ItemType } from "../../../server/src/shared/Constants";

export const Shop: React.FC = () => {
    const player = useCurrentPlayer();
    const isGameEnded = useGameEnded();

    // Close shop if game ends
    useEffect(() => {
        if (isGameEnded) {
            gameStore.closeShop();
        }
    }, [isGameEnded]);

    if (!player) return null;

    const handleTrade = (tradeId: string) => {
        gameStore.executeTrade(tradeId);
    };

    const handleClose = () => {
        gameStore.closeShop();
    };

    // ESC key to close shop
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Calculate how much of each item the player has
    const getItemCount = (itemType: ItemType): number => {
        let total = 0;
        if (player && player.inventory) {
            for (const item of player.inventory) {
                if (item && item.itemId === itemType) {
                    total += item.count;
                }
            }
        }
        return total;
    };

    const canAfford = (costItemType: ItemType, costCount: number): boolean => {
        return getItemCount(costItemType) >= costCount;
    };

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(20, 20, 20, 0.95)',
            padding: '30px',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 2000,
            width: '800px',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '2px solid rgba(255, 215, 0, 0.3)',
            pointerEvents: 'auto'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                borderBottom: '2px solid rgba(255, 215, 0, 0.3)',
                paddingBottom: '15px'
            }}>
                <h2 style={{
                    margin: 0,
                    color: '#FFD700',
                    fontSize: '28px',
                    fontWeight: 'bold',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
                }}>
                    <Icon icon="game-icons:shop" width="32" height="32" style={{ verticalAlign: 'middle', marginRight: '10px' }} />
                    Shop
                </h2>
                <button
                    onClick={handleClose}
                    style={{
                        background: 'rgba(255, 0, 0, 0.2)',
                        border: '2px solid rgba(255, 0, 0, 0.5)',
                        borderRadius: '8px',
                        color: '#ff6666',
                        padding: '10px 20px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 0, 0, 0.4)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 0, 0, 0.2)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    ✕ Close
                </button>
            </div>

            {/* Player's Gold Display */}
            <div style={{
                background: 'rgba(255, 215, 0, 0.15)',
                padding: '16px',
                borderRadius: '12px',
                marginBottom: '24px',
                border: '2px solid rgba(255, 215, 0, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(255, 215, 0, 0.2)'
            }}>
                <Icon icon={ITEM_DEFINITIONS[ItemType.GOLD_INGOT].icon} width="32" height="32" />
                <span style={{
                    marginLeft: '12px',
                    color: '#FFD700',
                    fontSize: '22px',
                    fontWeight: 'bold',
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
                }}>
                    Your Gold: {getItemCount(ItemType.GOLD_INGOT)}
                </span>
            </div>

            {/* Trade Grid - 3 columns */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '16px' 
            }}>
                {SHOP_TRADES.map((trade) => {
                    const affordable = canAfford(trade.cost.itemType, trade.cost.count);
                    const costDef = ITEM_DEFINITIONS[trade.cost.itemType];
                    const rewardDef = ITEM_DEFINITIONS[trade.reward.itemType];

                    return (
                        <div
                            key={trade.id}
                            style={{
                                background: affordable ? 'rgba(0, 100, 0, 0.15)' : 'rgba(60, 60, 60, 0.3)',
                                border: `3px solid ${affordable ? 'rgba(0, 255, 0, 0.4)' : 'rgba(100, 100, 100, 0.4)'}`,
                                borderRadius: '12px',
                                padding: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                transition: 'all 0.2s',
                                cursor: affordable ? 'pointer' : 'not-allowed',
                                opacity: affordable ? 1 : 0.6
                            }}
                            onClick={() => affordable && handleTrade(trade.id)}
                            onMouseEnter={(e) => {
                                if (affordable) {
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 255, 0, 0.3)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (affordable) {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }
                            }}
                        >
                            {/* Reward Item (Large Icon) */}
                            <div style={{
                                marginBottom: '12px',
                                position: 'relative'
                            }}>
                                <Icon 
                                    icon={rewardDef.icon} 
                                    width="64" 
                                    height="64"
                                    style={{
                                        filter: affordable ? 'drop-shadow(0 0 8px rgba(0, 255, 0, 0.5))' : 'grayscale(0.5)'
                                    }}
                                />
                                {/* Reward Count Badge */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: '-6px',
                                    right: '-6px',
                                    background: 'rgba(0, 200, 0, 0.9)',
                                    borderRadius: '50%',
                                    width: '28px',
                                    height: '28px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '2px solid rgba(0, 255, 0, 0.6)',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    color: '#fff'
                                }}>
                                    {trade.reward.count}
                                </div>
                            </div>

                            {/* Item Name */}
                            <div style={{
                                color: '#fff',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                marginBottom: '8px',
                                textAlign: 'center'
                            }}>
                                {rewardDef.name}
                            </div>

                            {/* Divider */}
                            <div style={{
                                width: '100%',
                                height: '2px',
                                background: 'rgba(255, 215, 0, 0.3)',
                                marginBottom: '12px'
                            }} />

                            {/* Cost */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(255, 215, 0, 0.1)',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 215, 0, 0.3)'
                            }}>
                                <Icon icon={costDef.icon} width="24" height="24" />
                                <span style={{ 
                                    color: '#FFD700', 
                                    fontSize: '18px',
                                    fontWeight: 'bold'
                                }}>
                                    {trade.cost.count}
                                </span>
                            </div>

                            {/* Status Text */}
                            <div style={{
                                marginTop: '12px',
                                fontSize: '12px',
                                color: affordable ? '#0f0' : '#f66',
                                fontWeight: 'bold',
                                textAlign: 'center'
                            }}>
                                {affordable ? '✓ Click to Buy' : '✗ Not Enough Gold'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

