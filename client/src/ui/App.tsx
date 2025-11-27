import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Inventory } from './Inventory';
import { Shop } from './Shop';
import { gameStore, useShopState, useGameTimer, useKillFeed, useGameEnded, useGameEndData, useRematchState, useCurrentPlayer } from './GameStore';

const EndGameScreen: React.FC = () => {
    const { winner, playerStats } = useGameEndData();
    const { rematchReady, rematchCountdown, mySessionId } = useRematchState();
    const currentPlayer = useCurrentPlayer();

    // Sort players by kills
    const sortedPlayers = [...playerStats].sort((a, b) => b.kills - a.kills);

    const getWinnerText = () => {
        if (winner === 'red') return { text: 'RED TEAM WINS!', color: '#ff0000' };
        if (winner === 'blue') return { text: 'BLUE TEAM WINS!', color: '#0000ff' };
        return { text: 'DRAW!', color: '#888888' };
    };

    const winnerInfo = getWinnerText();

    const handleReady = () => {
        console.log('=== handleReady clicked ===');
        console.log('mySessionId:', mySessionId);
        console.log('myReady (from rematchReady map):', rematchReady.get(mySessionId));
        console.log('rematchReady Map:', Array.from(rematchReady.entries()));
        console.log('gameStore.room:', gameStore.room);
        
        // Always allow clicking if not already ready
        const myReady = rematchReady.get(mySessionId) || false;
        if (!myReady) {
            console.log('Sending ready for rematch...');
            gameStore.sendReadyForRematch();
        } else {
            console.log('Already ready, ignoring');
        }
    };

    // Calculate ready counts per team
    // Extract unique session IDs from players
    const getSessionId = (playerId: string) => {
        // playerId format: "sessionId_1" or "sessionId_2"
        return playerId.split('_')[0];
    };

    const redSessions = new Set(
        sortedPlayers
            .filter(p => p.teamId === 'red')
            .map(p => getSessionId(p.id))
    );
    const blueSessions = new Set(
        sortedPlayers
            .filter(p => p.teamId === 'blue')
            .map(p => getSessionId(p.id))
    );

    const redReadyCount = Array.from(redSessions).filter(sessionId => 
        rematchReady.get(sessionId)
    ).length;
    const blueReadyCount = Array.from(blueSessions).filter(sessionId => 
        rematchReady.get(sessionId)
    ).length;
    const redTotalCount = redSessions.size;
    const blueTotalCount = blueSessions.size;

    const myReady = rematchReady.get(mySessionId) || false;

    // Debug logging (only when state changes, not every render)
    useEffect(() => {
        console.log('EndGameScreen state:', {
            mySessionId,
            rematchReady: Array.from(rematchReady.entries()),
            redSessions: Array.from(redSessions),
            blueSessions: Array.from(blueSessions),
            redReadyCount,
            blueReadyCount,
            myReady
        });
    }, [mySessionId, rematchReady.size, redReadyCount, blueReadyCount, myReady]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            pointerEvents: 'auto'
        }}>
            <div style={{
                background: 'rgba(0, 0, 0, 0.9)',
                borderRadius: '12px',
                padding: '30px',
                minWidth: '400px',
                maxWidth: '500px',
                border: '2px solid #444',
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
            }}>
                {/* Title */}
                <div style={{
                    fontSize: '36px',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    textAlign: 'center',
                    marginBottom: '20px',
                    textShadow: '2px 2px 4px #000'
                }}>
                    GAME OVER
                </div>

                {/* Winner */}
                <div style={{
                    fontSize: '28px',
                    fontWeight: 'bold',
                    color: winnerInfo.color,
                    textAlign: 'center',
                    marginBottom: '30px',
                    textShadow: '2px 2px 4px #000'
                }}>
                    {winnerInfo.text}
                </div>

                {/* Player Statistics */}
                <div style={{
                    marginBottom: '30px'
                }}>
                    <div style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#ffffff',
                        textAlign: 'center',
                        marginBottom: '15px'
                    }}>
                        PLAYER STATISTICS
                    </div>

                    <div style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: '#ffff00',
                        marginBottom: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        paddingRight: '10px'
                    }}>
                        <span>Player</span>
                        <span>K   D   Dmg</span>
                    </div>

                    {sortedPlayers.slice(0, 3).map((player, i) => (
                        <div key={player.id} style={{
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            color: player.teamId === 'red' ? '#ff6666' : '#6666ff',
                            marginBottom: '5px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingRight: '10px'
                        }}>
                            <span>{player.username.substring(0, 10)}</span>
                            <span>{player.kills}  {player.deaths}  {player.damage}</span>
                        </div>
                    ))}
                </div>

                {/* Top 3 Players */}
                <div style={{
                    marginBottom: '30px'
                }}>
                    <div style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#ffffff',
                        textAlign: 'center',
                        marginBottom: '15px'
                    }}>
                        TOP 3 PLAYERS
                    </div>

                    {['🥇', '🥈', '🥉'].map((medal, i) => {
                        const player = sortedPlayers[i];
                        if (!player) return null;
                        const colors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                        return (
                            <div key={i} style={{
                                fontSize: '16px',
                                color: colors[i],
                                textAlign: 'center',
                                marginBottom: '8px'
                            }}>
                                {medal} {player.username.substring(0, 12)} - {player.kills}K
                            </div>
                        );
                    })}
                </div>

                {/* Rematch Status */}
                {rematchCountdown > 0 ? (
                    <div style={{
                        textAlign: 'center',
                        marginBottom: '20px'
                    }}>
                        <div style={{
                            fontSize: '24px',
                            fontWeight: 'bold',
                            color: '#00ff00',
                            marginBottom: '10px'
                        }}>
                            Starting in {Math.ceil(rematchCountdown)}...
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Ready Status */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-around',
                            marginBottom: '15px',
                            padding: '10px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#ff6666', fontSize: '16px', fontWeight: 'bold' }}>
                                    RED TEAM
                                </div>
                                <div style={{ color: '#ffffff', fontSize: '20px', marginTop: '5px' }}>
                                    {redReadyCount}/{redTotalCount} READY
                                </div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#6666ff', fontSize: '16px', fontWeight: 'bold' }}>
                                    BLUE TEAM
                                </div>
                                <div style={{ color: '#ffffff', fontSize: '20px', marginTop: '5px' }}>
                                    {blueReadyCount}/{blueTotalCount} READY
                                </div>
                            </div>
                        </div>

                        {/* Ready Button */}
                        <button
                            onClick={handleReady}
                            disabled={myReady}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                color: '#ffffff',
                                background: myReady ? '#555555' : '#00aa00',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: myReady ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                                opacity: myReady ? 0.6 : 1
                            }}
                            onMouseEnter={(e) => {
                                if (!myReady) {
                                    e.currentTarget.style.background = '#00cc00';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!myReady) {
                                    e.currentTarget.style.background = '#00aa00';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }
                            }}
                        >
                            {myReady ? '✓ READY - Waiting for others...' : 'READY FOR REMATCH'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export function App() {
    const { isOpen, isNearBed } = useShopState();
    const { totalTime, phaseTime, phaseName, phaseColor } = useGameTimer();
    const killFeed = useKillFeed();
    const isGameEnded = useGameEnded();

    const handleOpenShop = () => {
        gameStore.openShop();
    };

    return (
        <>
            {/* Timer UI - Top Center */}
            <div style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                textAlign: 'center',
                pointerEvents: 'none'
            }}>
                <div style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    textShadow: '0 0 4px #000, 2px 2px 4px #000, -2px -2px 4px #000',
                    marginBottom: '5px',
                    fontFamily: 'monospace'
                }}>
                    {totalTime}
                </div>
                <div style={{
                    fontSize: '20px',
                    color: phaseColor,
                    textShadow: '0 0 4px #000, 2px 2px 3px #000, -2px -2px 3px #000',
                    marginBottom: '3px',
                    fontWeight: 'bold'
                }}>
                    {phaseName}
                </div>
                <div style={{
                    fontSize: '18px',
                    color: '#ffffff',
                    textShadow: '0 0 3px #000, 1px 1px 2px #000, -1px -1px 2px #000',
                    fontFamily: 'monospace'
                }}>
                    {phaseTime}
                </div>
            </div>

            {/* Kill Feed - Right Top */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '5px',
                pointerEvents: 'none'
            }}>
                {killFeed.map((message, index) => (
                    <div
                        key={index}
                        style={{
                            fontSize: '14px',
                            color: '#ff0000',
                            textShadow: '0 0 3px #000, 1px 1px 2px #000',
                            fontWeight: 'bold',
                            padding: '4px 8px',
                            background: 'rgba(0, 0, 0, 0.5)',
                            borderRadius: '4px',
                            animation: `fadeOut 5s ease-out ${index * 0.1}s forwards`
                        }}
                    >
                        {message}
                    </div>
                ))}
            </div>

            {/* Inventory at bottom - hidden when game ends */}
            {!isGameEnded && (
                <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000
                }}>
                    <Inventory />
                </div>
            )}

            {/* Shop button (left side, when near bed) - hidden when game ends */}
            {!isGameEnded && isNearBed && !isOpen && (
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

            {/* End Game Screen */}
            {isGameEnded && <EndGameScreen />}

            {/* CSS for fade-out animation */}
            <style>{`
                @keyframes fadeOut {
                    0% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `}</style>
        </>
    );
}

