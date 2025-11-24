import Phaser from "phaser";
import { ITEM_DEFINITIONS, ItemType, DroppedItemVisual } from "../../../server/src/shared/Constants";

/**
 * 掉落物渲染器
 * 负责创建不同形状的掉落物视觉表现
 * 设计为易于替换为 PNG 素材
 */
export class DroppedItemRenderer {
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * 创建掉落物容器
     * @param itemType 物品类型
     * @param count 数量
     * @param x X 坐标
     * @param y Y 坐标
     * @returns Phaser容器，包含所有视觉元素
     */
    createDroppedItem(itemType: ItemType, count: number, x: number, y: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(x, y);
        const itemDef = ITEM_DEFINITIONS[itemType];
        const visual = itemDef.droppedVisual;

        // 1. 创建发光光晕（动画效果）
        const glow = this.createGlow(visual, itemDef.color);
        container.add(glow);

        // 2. 创建主体形状
        // 未来替换点：这里可以改为 this.scene.add.image(0, 0, itemDef.spriteKey)
        const body = this.createShape(visual, itemDef.color);
        container.add(body);

        // 3. 添加数量文字（如果 >1）
        if (count > 1) {
            const countText = this.createCountText(count);
            container.add(countText);
        }

        // 4. 添加浮动动画
        this.addFloatAnimation(container, y);

        // 5. 添加发光脉冲动画
        this.addGlowPulse(glow);

        // 存储数据供后续使用
        container.setData('itemType', itemType);
        container.setData('count', count);
        container.setData('body', body);
        container.setData('glow', glow);

        return container;
    }

    /**
     * 创建发光光晕
     */
    private createGlow(visual: DroppedItemVisual, color: number): Phaser.GameObjects.Graphics {
        const glow = this.scene.add.graphics();
        glow.fillStyle(color, 0.3);
        
        switch (visual.shape) {
            case 'circle':
                glow.fillCircle(0, 0, visual.glowSize);
                break;
            case 'square':
                glow.fillRect(-visual.glowSize, -visual.glowSize, visual.glowSize * 2, visual.glowSize * 2);
                break;
            case 'diamond':
                this.drawDiamond(glow, visual.glowSize);
                break;
            case 'hexagon':
                this.drawHexagon(glow, visual.glowSize);
                break;
        }
        
        return glow;
    }

    /**
     * 创建主体形状
     * 未来替换点：改为加载 sprite
     */
    private createShape(visual: DroppedItemVisual, color: number): Phaser.GameObjects.Graphics {
        const shape = this.scene.add.graphics();
        shape.fillStyle(color, 1.0);
        shape.lineStyle(2, 0xffffff, 0.8);
        
        switch (visual.shape) {
            case 'circle':
                shape.fillCircle(0, 0, visual.size);
                shape.strokeCircle(0, 0, visual.size);
                break;
            case 'square':
                shape.fillRect(-visual.size, -visual.size, visual.size * 2, visual.size * 2);
                shape.strokeRect(-visual.size, -visual.size, visual.size * 2, visual.size * 2);
                break;
            case 'diamond':
                this.drawDiamond(shape, visual.size);
                shape.strokePath();
                break;
            case 'hexagon':
                this.drawHexagon(shape, visual.size);
                shape.strokePath();
                break;
        }
        
        return shape;
    }

    /**
     * 绘制菱形
     */
    private drawDiamond(graphics: Phaser.GameObjects.Graphics, size: number): void {
        graphics.beginPath();
        graphics.moveTo(0, -size);
        graphics.lineTo(size, 0);
        graphics.lineTo(0, size);
        graphics.lineTo(-size, 0);
        graphics.closePath();
        graphics.fillPath();
    }

    /**
     * 绘制六边形
     */
    private drawHexagon(graphics: Phaser.GameObjects.Graphics, size: number): void {
        const angle = Math.PI / 3; // 60度
        graphics.beginPath();
        for (let i = 0; i < 6; i++) {
            const x = size * Math.cos(angle * i);
            const y = size * Math.sin(angle * i);
            if (i === 0) {
                graphics.moveTo(x, y);
            } else {
                graphics.lineTo(x, y);
            }
        }
        graphics.closePath();
        graphics.fillPath();
    }

    /**
     * 创建数量文字
     */
    private createCountText(count: number): Phaser.GameObjects.Text {
        return this.scene.add.text(10, 10, `${count}`, {
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0, 0);
    }

    /**
     * 添加浮动动画
     */
    private addFloatAnimation(container: Phaser.GameObjects.Container, baseY: number): void {
        this.scene.tweens.add({
            targets: container,
            y: baseY - 5,
            duration: 1500,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    /**
     * 添加发光脉冲动画
     */
    private addGlowPulse(glow: Phaser.GameObjects.Graphics): void {
        this.scene.tweens.add({
            targets: glow,
            alpha: 0.1,
            duration: 1000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    /**
     * 更新掉落物数量显示
     */
    updateCount(container: Phaser.GameObjects.Container, newCount: number): void {
        container.setData('count', newCount);
        
        // 移除旧的数量文字
        const children = container.getAll();
        const oldText = children.find(child => child.type === 'Text');
        if (oldText) {
            oldText.destroy();
        }

        // 添加新的数量文字（如果 >1）
        if (newCount > 1) {
            const countText = this.createCountText(newCount);
            container.add(countText);
        }
    }

    /**
     * 未来扩展：从 PNG 创建掉落物
     * 当你有素材时，取消注释并使用这个方法
     */
    /*
    createDroppedItemFromSprite(itemType: ItemType, count: number, x: number, y: number): Phaser.GameObjects.Container {
        const container = this.scene.add.container(x, y);
        const itemDef = ITEM_DEFINITIONS[itemType];

        // 使用 sprite 而不是几何图形
        const sprite = this.scene.add.image(0, 0, itemDef.spriteKey || 'default_item');
        sprite.setScale(0.5); // 调整大小
        container.add(sprite);

        // 发光效果可以用 shader 或者额外的 sprite
        const glow = this.scene.add.image(0, 0, 'item_glow');
        glow.setTint(itemDef.color);
        glow.setAlpha(0.5);
        container.add(glow);

        // 数量文字
        if (count > 1) {
            const countText = this.createCountText(count);
            container.add(countText);
        }

        // 动画
        this.addFloatAnimation(container, y);
        this.addGlowPulse(glow);

        return container;
    }
    */
}

