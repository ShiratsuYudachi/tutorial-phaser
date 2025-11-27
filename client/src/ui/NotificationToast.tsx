import React from 'react';
import { useNotifications } from './GameStore';

export const NotificationToast: React.FC = () => {
    const notifications = useNotifications();

    return (
        <div style={{
            position: 'absolute',
            top: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            zIndex: 2000,
            pointerEvents: 'none'
        }}>
            {notifications.map((note) => (
                <div key={note.id} style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: note.color,
                    padding: '10px 20px',
                    borderRadius: '5px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    textShadow: '1px 1px 2px black',
                    animation: 'fadeInOut 3s ease-in-out forwards'
                }}>
                    {note.text}
                </div>
            ))}
            <style>{`
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-20px); }
                    10% { opacity: 1; transform: translateY(0); }
                    90% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-20px); }
                }
            `}</style>
        </div>
    );
};
