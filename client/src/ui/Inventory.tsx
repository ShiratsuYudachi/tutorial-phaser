import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { gameStore, useCurrentPlayer } from "./GameStore";
import { ITEM_DEFINITIONS, INVENTORY_SIZE } from "../../../server/src/shared/Constants";

export const Inventory: React.FC = () => {
    const player = useCurrentPlayer();
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    const inventory = player && player.inventory ? Array.from(player.inventory) : [];
    const selectedSlot = player ? player.selectedSlot : 0;

    const handleSlotClick = (index: number) => {
        if (gameStore.room) {
            gameStore.room.send("inventory_action", { type: "select", index });
            // No optimistic update needed, state sync handles it
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        
        const item = inventory[index];
        if (item && item.itemId) {
             // Optional: set custom drag image
        }
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null) return;
        
        if (draggedIndex !== toIndex) {
            if (gameStore.room) {
                gameStore.room.send("inventory_action", { 
                    type: "swap", 
                    fromIndex: draggedIndex, 
                    toIndex: toIndex 
                });
            }
        }
        setDraggedIndex(null);
    };

    return (
        <div style={{
            display: 'flex',
            gap: '5px',
            background: 'rgba(0, 0, 0, 0.7)', // Darker background for better contrast
            padding: '10px',
            borderRadius: '12px', // More rounded corners
            pointerEvents: 'auto',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}>
            {Array.from({ length: INVENTORY_SIZE }).map((_, index) => {
                const item = inventory[index];
                // Safety check: ITEM_DEFINITIONS might not have the key if server sent bad data
                const def = item && item.itemId ? ITEM_DEFINITIONS[item.itemId] : null;
                const isSelected = selectedSlot === index;

                return (
                    <div
                        key={index}
                        draggable={!!item && !!item.itemId} // Only draggable if has item
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onClick={() => handleSlotClick(index)}
                        style={{
                            width: '50px',
                            height: '50px',
                            border: isSelected ? '3px solid #fff' : '1px solid #555',
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.1)' : '#222',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                            cursor: 'pointer',
                            opacity: draggedIndex === index ? 0.5 : 1,
                            transition: 'all 0.1s ease-in-out',
                            transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                        }}
                    >
                        {def ? (
                            <Icon 
                                icon={def.icon}
                                width="40"
                                height="40"
                                style={{
                                    pointerEvents: 'none'
                                }}
                            />
                        ) : null}
                        
                        {item && item.count > 1 && (
                            <span style={{
                                position: 'absolute',
                                bottom: '2px',
                                right: '4px',
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                textShadow: '1px 1px 2px #000',
                                fontFamily: 'Arial, sans-serif'
                            }}>
                                {item.count}
                            </span>
                        )}
                        <span style={{
                            position: 'absolute',
                            top: '2px',
                            left: '4px',
                            color: isSelected ? '#fff' : '#888',
                            fontSize: '10px',
                            fontFamily: 'monospace'
                        }}>
                            {index + 1}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
