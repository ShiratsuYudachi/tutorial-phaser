import React, { useEffect, useState } from "react";
import { gameStore } from "./GameStore";
import { ITEM_DEFINITIONS, INVENTORY_SIZE } from "../../../server/src/shared/Constants";
import { InventoryItem, Player } from "../../../server/src/shared/Schema";

export const Inventory: React.FC = () => {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [selectedSlot, setSelectedSlot] = useState(0);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

    useEffect(() => {
        const updateState = () => {
            const player = gameStore.currentPlayer;
            if (player && player instanceof Player) {
                // Convert Colyseus ArraySchema to JS array for React state
                setInventory([...player.inventory]);
                setSelectedSlot(player.selectedSlot);
            }
        };

        // Initial sync
        updateState();

        // Subscribe to changes
        const unsubscribe = gameStore.subscribe(updateState);

        return unsubscribe;
    }, []);

    const handleSlotClick = (index: number) => {
        if (gameStore.room) {
            gameStore.room.send("inventory_action", { type: "select", index });
            // Optimistic update
            setSelectedSlot(index);
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        // Set drag image or data if needed
        const item = inventory[index];
        if (item && item.itemId) {
             const def = ITEM_DEFINITIONS[item.itemId];
             // Use a custom drag image if we want, for now default is fine
             // but we can try to set the drag image to the icon
             // const img = new Image();
             // img.src = def.icon;
             // e.dataTransfer.setDragImage(img, 25, 25);
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
                            <img 
                                src={def.icon} 
                                alt={def.name}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    objectFit: 'contain',
                                    pointerEvents: 'none' // Ensure drag events pass through image
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
