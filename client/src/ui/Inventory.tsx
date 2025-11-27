import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { gameStore, useCurrentPlayer, useGameEnded } from "./GameStore";
import { ITEM_DEFINITIONS, INVENTORY_SIZE, ItemType } from "../../../server/src/shared/Constants";

export const Inventory: React.FC = () => {
    const player = useCurrentPlayer();
    const isGameEnded = useGameEnded();
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [isDraggingOutside, setIsDraggingOutside] = useState(false);

    const inventory = player && player.inventory ? Array.from(player.inventory) : [];
    const selectedSlot = player ? player.selectedSlot : 0;

    const handleSlotClick = (index: number) => {
        // Disable click when game ended
        if (isGameEnded) return;
        
        if (gameStore.room) {
            gameStore.room.send("inventory_action", { type: "select", index });
            // No optimistic update needed, state sync handles it
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        // Disable drag when game ended
        if (isGameEnded) {
            e.preventDefault();
            return;
        }
        
        const item = inventory[index];
        // Only allow dragging if there's a real item (not empty)
        if (!item || !item.itemId || item.itemId === ItemType.EMPTY) {
            e.preventDefault();
            return;
        }
        
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        console.log(`Drag started from slot ${index}`);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        
        if (draggedIndex === null) {
            console.warn("Drop without draggedIndex");
            return;
        }
        
        console.log(`Drop: ${draggedIndex} -> ${toIndex}`);
        
        if (draggedIndex !== toIndex) {
            if (gameStore.room) {
                console.log(`Sending swap: ${draggedIndex} -> ${toIndex}`);
                gameStore.room.send("inventory_action", { 
                    type: "swap", 
                    fromIndex: draggedIndex, 
                    toIndex: toIndex 
                });
            }
        }
        setDraggedIndex(null);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        console.log(`DragEnd: draggedIndex=${draggedIndex}, isDraggingOutside=${isDraggingOutside}`);
        
        // If dragged outside inventory (not dropped on a slot), drop the item
        if (draggedIndex !== null && isDraggingOutside) {
            const item = inventory[draggedIndex];
            console.log(`Checking item at slot ${draggedIndex}:`, item);
            if (item && item.itemId !== ItemType.EMPTY && item.count > 0) {
                if (gameStore.room) {
                    console.log(`Dropping item from slot ${draggedIndex} outside inventory: ${item.itemId} x${item.count}`);
                    gameStore.room.send("drop_item", { slotIndex: draggedIndex });
                }
            } else {
                console.warn(`Cannot drop: item is empty or invalid`, item);
            }
        }
        
        // Clean up drag state
        setDraggedIndex(null);
        setIsDraggingOutside(false);
    };

    const handleInventoryDragLeave = (e: React.DragEvent) => {
        // Only set isDraggingOutside to true if we're leaving the entire inventory container
        // Check if the related target is outside the inventory
        const inventoryElement = e.currentTarget;
        const relatedTarget = e.relatedTarget as Node;
        
        if (!relatedTarget || !inventoryElement.contains(relatedTarget)) {
            setIsDraggingOutside(true);
            console.log(`Dragging outside inventory`);
        }
    };

    const handleInventoryDragEnter = (e: React.DragEvent) => {
        // Only set isDraggingOutside to false if we're entering from outside
        const inventoryElement = e.currentTarget;
        const relatedTarget = e.relatedTarget as Node;
        
        if (!relatedTarget || !inventoryElement.contains(relatedTarget)) {
            setIsDraggingOutside(false);
            console.log(`Dragging back inside inventory`);
        }
    };

    return (
        <div 
            onDragLeave={handleInventoryDragLeave}
            onDragEnter={handleInventoryDragEnter}
            style={{
                display: 'flex',
                gap: '5px',
                background: isDraggingOutside ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.7)',
                padding: '10px',
                borderRadius: '12px',
                pointerEvents: 'auto',
                boxShadow: isDraggingOutside ? '0 0 20px rgba(255, 0, 0, 0.5)' : '0 4px 6px rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
                border: isDraggingOutside ? '2px solid rgba(255, 0, 0, 0.8)' : '2px solid transparent'
            }}
        >
            {Array.from({ length: INVENTORY_SIZE }).map((_, index) => {
                const item = inventory[index];
                // Check if item is empty or not present
                const isEmpty = !item || !item.itemId || item.itemId === ItemType.EMPTY;
                const def = !isEmpty ? ITEM_DEFINITIONS[item.itemId] : null;
                const isSelected = selectedSlot === index;

                return (
                    <div
                        key={index}
                        draggable={!isEmpty && !isGameEnded}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
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
                            cursor: isGameEnded ? 'not-allowed' : 'pointer',
                            opacity: isGameEnded ? 0.3 : (draggedIndex === index ? 0.5 : 1),
                            transition: 'all 0.1s ease-in-out',
                            transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                            filter: isGameEnded ? 'grayscale(100%)' : 'none'
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
