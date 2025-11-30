import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Client, Room, getStateCallbacks } from 'colyseus.js';
import { Schema, MapSchema, type } from '@colyseus/schema';
import { BACKEND_URL, BACKEND_HTTP_URL } from '../backend';
import { Settings } from './Settings';

interface User {
    userId: string;
    username: string;
}

// Define Lobby State Schema locally since it's not in shared
class LobbyPlayerSchema extends Schema {
    @type("string") username: string = "";
    @type("boolean") isReady: boolean = false;
    @type("string") teamPreference: string = "";
}

class LobbyState extends Schema {
    @type({ map: LobbyPlayerSchema }) players = new MapSchema<LobbyPlayerSchema>();
    @type("number") countdown: number = 0;
    @type("string") status: string = "";
}

interface LobbyPlayer {
    username: string;
    isReady: boolean;
    teamPreference: string;
}

interface FrontPageProps {
    onGameStart: (options: { username: string; userId: string; team?: string }) => void;
}

type PageState = 'landing' | 'login' | 'register' | 'lobby';

interface LobbyPlayerSchema {
    username: string;
    isReady: boolean;
    teamPreference: string;
}

interface GameStartingData {
    roomId: string;
    teams: { sessionId: string; username: string; team: string }[];
}

export const FrontPage: React.FC<FrontPageProps> = ({ onGameStart }) => {
    const [pageState, setPageState] = useState<PageState>('landing');
    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string>('');
    const [loading, setLoading] = useState(false);
    
    // Form states
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    // Lobby states
    const [lobbyRoom, setLobbyRoom] = useState<Room<LobbyState> | null>(null);
    const [lobbyPlayers, setLobbyPlayers] = useState<Map<string, LobbyPlayer>>(new Map());
    const [isReady, setIsReady] = useState(false);
    const [teamPreference, setTeamPreference] = useState<string>('any');
    const [countdown, setCountdown] = useState(0);
    const [lobbyStatus, setLobbyStatus] = useState<string>('waiting');
    const [chatMessages, setChatMessages] = useState<Array<{ username: string; message: string }>>([]);
    const [chatInput, setChatInput] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Check for stored user on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('bedwars_user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
            } catch (e) {
                localStorage.removeItem('bedwars_user');
            }
        }
    }, []);

    // Handle login
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${BACKEND_HTTP_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            if (data.success) {
                const userData = { userId: data.userId, username: data.username };
                setUser(userData);
                localStorage.setItem('bedwars_user', JSON.stringify(userData));
                setPageState('landing');
                setUsername('');
                setPassword('');
            } else {
                setError(data.message);
            }
        } catch (e) {
            setError('Connection error. Please try again.');
        }
        setLoading(false);
    };

    // Handle registration
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${BACKEND_HTTP_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            if (data.success) {
                // Auto-login after registration
                const userData = { userId: data.userId, username };
                setUser(userData);
                localStorage.setItem('bedwars_user', JSON.stringify(userData));
                setPageState('landing');
                setUsername('');
                setPassword('');
                setConfirmPassword('');
            } else {
                setError(data.message);
            }
        } catch (e) {
            setError('Connection error. Please try again.');
        }
        setLoading(false);
    };

    // Handle logout
    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('bedwars_user');
        if (lobbyRoom) {
            lobbyRoom.leave();
            setLobbyRoom(null);
        }
    };

    // Join lobby for matchmaking
    const joinLobby = async () => {
        if (!user) {
            setPageState('login');
            return;
        }

        try {
            const client = new Client(BACKEND_URL);
            const room = await client.joinOrCreate<LobbyState>('lobby_room', {
                username: user.username,
                userId: user.userId
            });

            setLobbyRoom(room);
            setPageState('lobby');

            // Use getStateCallbacks for proper Colyseus 0.16.x API
            const $ = getStateCallbacks(room);

            // Listen for player updates
            $(room.state).players.onAdd((player: LobbyPlayerSchema, sessionId: string) => {
                setLobbyPlayers(prev => {
                    const next = new Map(prev);
                    next.set(sessionId, {
                        username: player.username,
                        isReady: player.isReady,
                        teamPreference: player.teamPreference
                    });
                    return next;
                });

                // Listen to individual player changes
                $(player).onChange(() => {
                    setLobbyPlayers(prev => {
                        const next = new Map(prev);
                        next.set(sessionId, {
                            username: player.username,
                            isReady: player.isReady,
                            teamPreference: player.teamPreference
                        });
                        return next;
                    });
                });
            });

            $(room.state).players.onRemove((player: LobbyPlayerSchema, sessionId: string) => {
                setLobbyPlayers(prev => {
                    const next = new Map(prev);
                    next.delete(sessionId);
                    return next;
                });
            });

            // Listen for state changes
            $(room.state).listen("countdown", (value: number) => {
                setCountdown(value);
            });

            $(room.state).listen("status", (value: string) => {
                setLobbyStatus(value);
            });

            // Listen for chat messages
            room.onMessage("chat", (data: { username: string; message: string }) => {
                setChatMessages(prev => [...prev.slice(-49), data]);
            });

            // Listen for game start
            room.onMessage("game_starting", (data: GameStartingData) => {
                const myTeam = data.teams.find(t => t.sessionId === room.sessionId);
                onGameStart({
                    username: user.username,
                    userId: user.userId,
                    team: myTeam?.team
                });
            });

        } catch (e) {
            console.error('Failed to join lobby:', e);
            setError('Failed to connect to lobby. Please try again.');
        }
    };

    // Leave lobby
    const leaveLobby = () => {
        if (lobbyRoom) {
            lobbyRoom.leave();
            setLobbyRoom(null);
        }
        setLobbyPlayers(new Map());
        setIsReady(false);
        setCountdown(0);
        setLobbyStatus('waiting');
        setChatMessages([]);
        setPageState('landing');
    };

    // Toggle ready state
    const toggleReady = () => {
        if (lobbyRoom) {
            lobbyRoom.send("toggle_ready");
            setIsReady(!isReady);
        }
    };

    // Set team preference
    const handleSetTeam = (team: string) => {
        if (lobbyRoom) {
            lobbyRoom.send("set_team", { team });
            setTeamPreference(team);
        }
    };

    // Send chat message
    const sendChat = (e: React.FormEvent) => {
        e.preventDefault();
        if (lobbyRoom && chatInput.trim()) {
            lobbyRoom.send("chat", { message: chatInput.trim() });
            setChatInput('');
        }
    };

    // Quick play (skip lobby for testing)
    const quickPlay = () => {
        const guestName = `Guest_${Math.random().toString(36).substring(2, 6)}`;
        onGameStart({
            username: user?.username || guestName,
            userId: user?.userId || 'guest'
        });
    };

    // Styles
    const containerStyle: React.CSSProperties = {
        height: '100vh',
        width: '100%',
        display: 'block', // Use block instead of flex for container to ensure normal document flow
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        color: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '40px 20px',
        pointerEvents: 'auto',
        overflowY: 'auto',
        boxSizing: 'border-box'
    };

    const cardStyle: React.CSSProperties = {
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        padding: '40px',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        margin: '0 auto', // Center horizontally
        // Add min-height logic indirectly via content
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '14px 18px',
        borderRadius: '10px',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#ffffff',
        fontSize: '16px',
        marginBottom: '15px',
        outline: 'none',
        transition: 'border-color 0.3s',
        boxSizing: 'border-box' as const
    };

    const buttonStyle: React.CSSProperties = {
        width: '100%',
        padding: '14px',
        borderRadius: '10px',
        border: 'none',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#ffffff',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        marginTop: '10px'
    };

    const secondaryButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        background: 'transparent',
        border: '2px solid rgba(255, 255, 255, 0.3)'
    };

    // Render Landing Page
    if (pageState === 'landing') {
        return (
            <div style={containerStyle}>
               	{/* Settings Button */}
               	<button
                   	onClick={() => setIsSettingsOpen(true)}
                   	style={{
                       	position: 'fixed',
                       	top: '20px',
                       	right: '20px',
                       	padding: '10px 15px',
                       	background: 'rgba(255, 255, 255, 0.1)',
                       	border: '1px solid rgba(255, 255, 255, 0.2)',
                       	borderRadius: '8px',
                       	color: '#ffffff',
                       	cursor: 'pointer',
                       	fontSize: '16px',
                       	display: 'flex',
                       	alignItems: 'center',
                       	gap: '8px',
                       	transition: 'background 0.2s',
                       	zIndex: 1000
                   	}}
                   	onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                   	onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
               	>
                   	<Icon icon="mdi:cog" width="20" height="20" />
                   	Settings
               	</button>

               	<Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

                <div style={{ ...cardStyle, maxWidth: '700px' }}>
                    {/* Logo/Title */}
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <h1 style={{ 
                            fontSize: '48px', 
                            fontWeight: 'bold',
                            background: 'linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            marginBottom: '10px'
                        }}>
                            ⚔️ Mini Bed Wars ⚔️
                        </h1>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '18px' }}>
                            Multiplayer PvP Battle Arena
                        </p>
                    </div>

                    {/* Game Description */}
                    <div style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        borderRadius: '15px', 
                        padding: '20px',
                        marginBottom: '25px'
                    }}>
                        <h3 style={{ marginTop: 0, color: '#feca57' }}>🎮 How to Play</h3>
                        <ul style={{ 
                            textAlign: 'left', 
                            paddingLeft: '20px',
                            lineHeight: '1.8',
                            color: 'rgba(255,255,255,0.9)'
                        }}>
                            <li><strong>Objective:</strong> Destroy the enemy team's bed and eliminate all opponents!</li>
                            <li><strong>Building Phase:</strong> Collect resources and build defenses around your bed</li>
                            <li><strong>Combat Phase:</strong> Attack the enemy base while protecting your own</li>
                            <li><strong>Deathmatch:</strong> All beds destroyed - last team standing wins!</li>
                        </ul>
                        
                        <h3 style={{ color: '#48dbfb' }}>🎯 Controls</h3>
                        <ul style={{ 
                            textAlign: 'left', 
                            paddingLeft: '20px',
                            lineHeight: '1.8',
                            color: 'rgba(255,255,255,0.9)'
                        }}>
                            <li><strong>WASD:</strong> Move your character</li>
                            <li><strong>Mouse:</strong> Aim and shoot / place blocks</li>
                            <li><strong>Space:</strong> Melee attack</li>
                            <li><strong>1-9:</strong> Select inventory slots</li>
                            <li><strong>Q:</strong> Drop item</li>
                            <li><strong>TAB:</strong> Switch between your two characters</li>
                            <li style={{ color: '#ff6b6b', marginTop: '5px' }}>
                                <strong>Cheats:</strong> use "T" to open chat window, type <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: '3px' }}>/cheat</code> in chat to enable GOD MODE (100x damage + unlimited resources)
                            </li>
                        </ul>
                    </div>

                    {/* User status */}
                    {user && (
                        <div style={{ 
                            textAlign: 'center', 
                            marginBottom: '20px',
                            padding: '10px',
                            background: 'rgba(72, 219, 251, 0.2)',
                            borderRadius: '10px'
                        }}>
                            <span style={{ color: '#48dbfb' }}>Welcome back, </span>
                            <strong>{user.username}</strong>
                            <button 
                                onClick={handleLogout}
                                style={{ 
                                    marginLeft: '15px',
                                    padding: '5px 15px',
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    color: '#fff',
                                    borderRadius: '5px',
                                    cursor: 'pointer'
                                }}
                            >
                                Logout
                            </button>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <button 
                        onClick={joinLobby}
                        style={{
                            ...buttonStyle,
                            background: 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)',
                            fontSize: '20px',
                            padding: '18px'
                        }}
                    >
                        🎮 Find Match
                    </button>

                    <button onClick={quickPlay} style={secondaryButtonStyle}>
                        ⚡ Quick Play (Practice)
                    </button>

                    {!user && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button 
                                onClick={() => setPageState('login')}
                                style={{ ...secondaryButtonStyle, flex: 1 }}
                            >
                                Sign In
                            </button>
                            <button 
                                onClick={() => setPageState('register')}
                                style={{ ...secondaryButtonStyle, flex: 1 }}
                            >
                                Register
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Render Login Page
    if (pageState === 'login') {
        return (
            <div style={containerStyle}>
                <div style={cardStyle}>
                    <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Sign In</h2>
                    
                    {error && (
                        <div style={{ 
                            background: 'rgba(255, 107, 107, 0.2)', 
                            color: '#ff6b6b',
                            padding: '12px',
                            borderRadius: '10px',
                            marginBottom: '20px',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            style={inputStyle}
                            disabled={loading}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            style={inputStyle}
                            disabled={loading}
                        />
                        <button type="submit" style={buttonStyle} disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>

                    <button 
                        onClick={() => { setPageState('landing'); setError(''); }}
                        style={{ ...secondaryButtonStyle }}
                    >
                        ← Back
                    </button>

                    <p style={{ textAlign: 'center', marginTop: '20px', color: 'rgba(255,255,255,0.6)' }}>
                        Don't have an account?{' '}
                        <span 
                            onClick={() => { setPageState('register'); setError(''); }}
                            style={{ color: '#667eea', cursor: 'pointer' }}
                        >
                            Register
                        </span>
                    </p>
                </div>
            </div>
        );
    }

    // Render Register Page
    if (pageState === 'register') {
        return (
            <div style={containerStyle}>
                <div style={cardStyle}>
                    <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Create Account</h2>
                    
                    {error && (
                        <div style={{ 
                            background: 'rgba(255, 107, 107, 0.2)', 
                            color: '#ff6b6b',
                            padding: '12px',
                            borderRadius: '10px',
                            marginBottom: '20px',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleRegister}>
                        <input
                            type="text"
                            placeholder="Username (3-20 characters)"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            style={inputStyle}
                            disabled={loading}
                        />
                        <input
                            type="password"
                            placeholder="Password (min 4 characters)"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            style={inputStyle}
                            disabled={loading}
                        />
                        <input
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            style={inputStyle}
                            disabled={loading}
                        />
                        <button type="submit" style={buttonStyle} disabled={loading}>
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    <button 
                        onClick={() => { setPageState('landing'); setError(''); }}
                        style={{ ...secondaryButtonStyle }}
                    >
                        ← Back
                    </button>

                    <p style={{ textAlign: 'center', marginTop: '20px', color: 'rgba(255,255,255,0.6)' }}>
                        Already have an account?{' '}
                        <span 
                            onClick={() => { setPageState('login'); setError(''); }}
                            style={{ color: '#667eea', cursor: 'pointer' }}
                        >
                            Sign In
                        </span>
                    </p>
                </div>
            </div>
        );
    }

    // Render Lobby Page
    if (pageState === 'lobby') {
        const playersArray = Array.from(lobbyPlayers.entries());
        const readyCount = playersArray.filter(([_, p]) => p.isReady).length;

        return (
            <div style={containerStyle}>
                <div style={{ ...cardStyle, maxWidth: '700px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ margin: 0 }}>🎯 Game Lobby</h2>
                        <button onClick={leaveLobby} style={{ 
                            padding: '8px 16px',
                            background: 'rgba(255, 107, 107, 0.3)',
                            border: '1px solid #ff6b6b',
                            color: '#ff6b6b',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}>
                            Leave Lobby
                        </button>
                    </div>

                    {/* Status */}
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '15px',
                        background: countdown > 0 ? 'rgba(0, 184, 148, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '10px',
                        marginBottom: '20px'
                    }}>
                        {countdown > 0 ? (
                            <div>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00b894' }}>
                                    Game starting in {countdown}...
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ color: 'rgba(255,255,255,0.7)' }}>
                                    Waiting for players... ({readyCount}/{playersArray.length} ready)
                                </div>
                                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginTop: '5px' }}>
                                    Need at least 2 players ready to start
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Players List */}
                    <div style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        borderRadius: '10px',
                        padding: '15px',
                        marginBottom: '20px',
                        maxHeight: '200px',
                        overflowY: 'auto'
                    }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#feca57' }}>Players ({playersArray.length})</h4>
                        {playersArray.length === 0 ? (
                            <div style={{ color: 'rgba(255,255,255,0.5)' }}>No players yet...</div>
                        ) : (
                            playersArray.map(([sessionId, player]) => (
                                <div key={sessionId} style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '5px',
                                    marginBottom: '5px'
                                }}>
                                    <span>{player.username}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ 
                                            fontSize: '12px',
                                            color: player.teamPreference === 'red' ? '#ff6b6b' : 
                                                   player.teamPreference === 'blue' ? '#48dbfb' : '#888'
                                        }}>
                                            {player.teamPreference === 'any' ? '' : `Team ${player.teamPreference}`}
                                        </span>
                                        <span style={{ 
                                            padding: '4px 10px',
                                            borderRadius: '15px',
                                            fontSize: '12px',
                                            background: player.isReady ? '#00b894' : 'rgba(255,255,255,0.2)',
                                            color: player.isReady ? '#fff' : 'rgba(255,255,255,0.6)'
                                        }}>
                                            {player.isReady ? '✓ Ready' : 'Not Ready'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Team Selection */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>Team Preference</h4>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {['any', 'red', 'blue'].map(team => (
                                <button
                                    key={team}
                                    onClick={() => handleSetTeam(team)}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: teamPreference === team ? '2px solid #fff' : '2px solid transparent',
                                        background: team === 'red' ? 'rgba(255, 107, 107, 0.3)' :
                                                   team === 'blue' ? 'rgba(72, 219, 251, 0.3)' :
                                                   'rgba(255, 255, 255, 0.1)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {team === 'any' ? 'Any Team' : `${team} Team`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ready Button */}
                    <button
                        onClick={toggleReady}
                        style={{
                            ...buttonStyle,
                            background: isReady ? 'linear-gradient(135deg, #ff6b6b, #ff8787)' : 'linear-gradient(135deg, #00b894, #00cec9)',
                            fontSize: '18px'
                        }}
                    >
                        {isReady ? '✗ Cancel Ready' : '✓ Ready to Play!'}
                    </button>

                    {/* Simple Chat */}
                    <div style={{ 
                        marginTop: '20px',
                        background: 'rgba(0,0,0,0.3)', 
                        borderRadius: '10px',
                        padding: '15px'
                    }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>💬 Chat</h4>
                        <div style={{ 
                            height: '100px', 
                            overflowY: 'auto',
                            marginBottom: '10px',
                            padding: '10px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '5px',
                            fontSize: '14px'
                        }}>
                            {chatMessages.length === 0 ? (
                                <div style={{ color: 'rgba(255,255,255,0.4)' }}>No messages yet...</div>
                            ) : (
                                chatMessages.map((msg, i) => (
                                    <div key={i}>
                                        <strong style={{ color: '#feca57' }}>{msg.username}:</strong> {msg.message}
                                    </div>
                                ))
                            )}
                        </div>
                        <form onSubmit={sendChat} style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                placeholder="Type a message..."
                                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                            />
                            <button type="submit" style={{ 
                                padding: '10px 20px',
                                background: '#667eea',
                                border: 'none',
                                borderRadius: '10px',
                                color: '#fff',
                                cursor: 'pointer'
                            }}>
                                Send
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
