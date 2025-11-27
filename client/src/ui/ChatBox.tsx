import React, { useEffect, useRef, useState } from 'react';
import { gameStore, useChatState } from './GameStore';

export const ChatBox: React.FC = () => {
    const { isOpen, messages } = useChatState();
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (inputValue.trim()) {
                gameStore.sendChatMessage(inputValue);
                setInputValue('');
            }
            // Keep chat open or close it? Minecraft closes it after sending.
            // But user said "shown almost full screen", maybe they want to see history.
            // Usually Enter sends and closes, or stays open.
            // I'll close it after sending for now, as is common in games like Minecraft.
            gameStore.toggleChat(false);
        } else if (e.key === 'Escape') {
            gameStore.toggleChat(false);
        }
        
        e.stopPropagation(); // Prevent game from handling keys
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '80%',
            height: '80%',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            borderRadius: '10px',
            color: 'white',
            fontFamily: 'monospace'
        }}>
            <div style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px'
            }}>
                {messages.map((msg, index) => (
                    <div key={index} style={{
                        color: msg.teamId === 'red' ? '#ff6b6b' : 
                               msg.teamId === 'blue' ? '#4dabf7' : 
                               msg.teamId === 'system' ? '#ffd43b' : 'white'
                    }}>
                        <span style={{ fontWeight: 'bold' }}>[{msg.sender}]: </span>
                        <span>{msg.text}</span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (/cheat for cheat mode)"
                style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '16px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'white',
                    borderRadius: '5px',
                    outline: 'none'
                }}
            />
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#aaa' }}>
                Press ENTER to send, ESC to close.
            </div>
        </div>
    );
};
