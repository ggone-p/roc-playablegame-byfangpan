import {
    _decorator,
    AudioClip,
    AudioSource,
    Canvas,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    Label,
    LabelOutline,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    input,
    tween,
    UITransform,
    Vec3,
    resources,
    sys,
    view,
} from 'cc';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;
const BOARD_COLS = 5;
const BOARD_ROWS = 4;
const MONSTER_LANES = 5;
const MAX_CONVEYOR = 4;
const MAX_LEVEL = 5;
const DEBUG_BOARD_CALIBRATION = false;
const BOARD_CALIBRATION_KEY = 'roc_board_calibration_v2_4x5';
const CONVEYOR_DEVICE_CALIBRATION_KEY = 'roc_conveyor_device_v1';

const CONVEYOR_Y = -810;
const CONVEYOR_SPEED = 170;
const CONVEYOR_ITEM_SPAWN_X = 430;
const CONVEYOR_ITEM_SLOT_START_X = -462;
const CONVEYOR_ITEM_SLOT_GAP = 132;
const CONVEYOR_ITEM_Y_OFFSET = 0;
const CONVEYOR_DEVICE_DEFAULT_X = 0;
const CONVEYOR_DEVICE_DEFAULT_Y = CONVEYOR_Y;
const CONVEYOR_SOURCE_WIDTH = 720;
const CONVEYOR_SOURCE_HEIGHT = 140;
const BOARD_TOP_Y = -318.5;
const BOARD_BOTTOM_Y = -743.5;
const BOARD_TOP_WIDTH = 568;
const BOARD_BOTTOM_WIDTH = 606;
const BOARD_CENTER_X = -3;

const PATH_TOP_Y = 620;
const PATH_BOTTOM_Y = -900;
const PATH_TOP_WIDTH = BOARD_TOP_WIDTH;
const PATH_BOTTOM_WIDTH = BOARD_BOTTOM_WIDTH;
const MONSTER_START_Y = 620;
const MONSTER_END_Y = -930;

type PieceKind = 'swordsman' | 'archer' | 'muka' | 'monkey' | 'mage';
type MonsterKind = 'devil' | 'mushroom';

interface PieceConfig {
    id: PieceKind;
    name: string;
    melee: boolean;
    baseInterval: number;
    range: number;
    damage: number;
    bullet: string;
}

interface BoardPiece {
    kind: PieceKind;
    level: number;
    node: Node;
    cooldown: number;
    skillCooldown: number;
    hp: number;
    maxHp: number;
}

interface ConveyorItem {
    kind: PieceKind;
    node: Node;
    home: Vec3;
    targetX: number;
    moving: boolean;
}

interface Monster {
    kind: MonsterKind;
    node: Node;
    hp: number;
    maxHp: number;
    speed: number;
    lane: number;
    alive: boolean;
    frames: SpriteFrame[];
    shadowNode: Node;
    shadowFrames: SpriteFrame[];
    frameIndex: number;
    frameTimer: number;
    eatCooldown: number;
    slowTimer: number;
    slowFactor: number;
}

interface DragState {
    kind: PieceKind;
    node: Node;
    source: 'conveyor' | 'board';
    conveyorItem?: ConveyorItem;
    boardRow?: number;
    boardCol?: number;
    hp?: number;
    maxHp?: number;
    home: Vec3;
}

const PIECES: PieceConfig[] = [
    { id: 'swordsman', name: 'Swordsman', melee: true, baseInterval: 1.02, range: 300, damage: 34, bullet: 'roc/bullets/swordsman/attack' },
    { id: 'archer', name: 'Archer', melee: false, baseInterval: 1.2, range: 520, damage: 17, bullet: 'roc/bullets/archer/attack' },
    { id: 'muka', name: 'Muka', melee: false, baseInterval: 1.32, range: 500, damage: 19, bullet: 'roc/bullets/muka/attack' },
    { id: 'monkey', name: 'Monkey', melee: false, baseInterval: 0.95, range: 485, damage: 14, bullet: 'roc/bullets/monkey/attack' },
    { id: 'mage', name: 'Mage', melee: false, baseInterval: 1.48, range: 510, damage: 28, bullet: 'roc/bullets/mage/attack' },
];

const MONSTER_HP: Record<MonsterKind, number> = {
    devil: 130,
    mushroom: 190,
};

const MONSTER_BASE_SIZE: Record<MonsterKind, number> = {
    devil: 112,
    mushroom: 102,
};

type EffectKind = 'portal' | 'upgrade' | 'merge' | 'death' | 'hit';
type AudioKey = 'bgm' | 'click' | 'place' | 'consume' | 'merge' | 'mergeGreat' | 'mergeUltra' | 'attack' | 'hit' | 'death' | 'warning' | 'fail';

const AUDIO_PATHS: Record<AudioKey, string> = {
    bgm: 'roc/audio/bgm',
    click: 'roc/audio/click',
    place: 'roc/audio/place',
    consume: 'roc/audio/consume',
    merge: 'roc/audio/merge',
    mergeGreat: 'roc/audio/merge_great',
    mergeUltra: 'roc/audio/merge_ultra',
    attack: 'roc/audio/attack',
    hit: 'roc/audio/hit',
    death: 'roc/audio/death',
    warning: 'roc/audio/warning',
    fail: 'roc/audio/fail',
};

const AUDIO_VOLUMES: Record<AudioKey, number> = {
    bgm: 0.34,
    click: 0.62,
    place: 0.7,
    consume: 0.68,
    merge: 0.76,
    mergeGreat: 0.82,
    mergeUltra: 0.88,
    attack: 0.34,
    hit: 0.38,
    death: 0.62,
    warning: 0.58,
    fail: 0.78,
};

type BoardCornerKey = 'tl' | 'tr' | 'bl' | 'br';

interface ActiveEffect {
    node: Node;
    sprite: Sprite;
    frames: SpriteFrame[];
    index: number;
    timer: number;
    frameDuration: number;
}

@ccclass('GameMain')
export class GameMain extends Component {
    private root!: Node;
    private boardLayer!: Node;
    private portalLayer!: Node;
    private monsterLayer!: Node;
    private effectLayer!: Node;
    private uiLayer!: Node;
    private projectileLayer!: Node;
    private debugLayer!: Node;
    private conveyorBeltNodes: Node[] = [];
    private conveyorDeviceNode: Node | null = null;
    private conveyorDevicePosition = new Vec3(CONVEYOR_DEVICE_DEFAULT_X, CONVEYOR_DEVICE_DEFAULT_Y, 0);
    private board: Array<Array<BoardPiece | null>> = [];
    private cellNodes: Node[][] = [];
    private conveyor: ConveyorItem[] = [];
    private monsters: Monster[] = [];
    private activeEffects: ActiveEffect[] = [];
    private dragState: DragState | null = null;
    private highlightNode: Node | null = null;
    private boardCorners: Record<BoardCornerKey, Vec3> = {
        tl: new Vec3(BOARD_CENTER_X - BOARD_TOP_WIDTH / 2, BOARD_TOP_Y, 0),
        tr: new Vec3(BOARD_CENTER_X + BOARD_TOP_WIDTH / 2, BOARD_TOP_Y, 0),
        bl: new Vec3(BOARD_CENTER_X - BOARD_BOTTOM_WIDTH / 2, BOARD_BOTTOM_Y, 0),
        br: new Vec3(BOARD_CENTER_X + BOARD_BOTTOM_WIDTH / 2, BOARD_BOTTOM_Y, 0),
    };
    private boardDebugGraphics: Graphics | null = null;
    private boardDebugLabel: Label | null = null;
    private spawnTimer = -2.2;
    private conveyorTimer = -1.2;
    private waveTimer = 0;
    private score = 0;
    private life = 10;
    private killed = 0;
    private wave = 1;
    private statusLabel!: Label;
    private fingerNode: Node | null = null;
    private spriteCache = new Map<string, SpriteFrame | null>();
    private effectFrameCache = new Map<EffectKind, SpriteFrame[]>();
    private effectFrameCounts: Record<EffectKind, number> = { portal: -1, upgrade: -1, merge: -1, death: -1, hit: -1 };
    private monsterFrameCache = new Map<MonsterKind, SpriteFrame[]>();
    private monsterShadowFrameCache = new Map<MonsterKind, SpriteFrame[]>();
    private rainFrames: SpriteFrame[] | null = null;
    private cursorNode: Node | null = null;
    private audioSource!: AudioSource;
    private bgmSource!: AudioSource;
    private audioCache = new Map<AudioKey, AudioClip | null>();
    private bgmStarted = false;
    private gameOverHandled = false;
    private warningCooldown = 0;

    protected start(): void {
        this.setupView();
        this.loadBoardCalibration();
        this.loadConveyorDeviceCalibration();
        this.createScene();
        this.preloadMonsterFrames();
        this.preloadEffectFrames();
        this.preloadAudio();
        this.addConveyorItem();
    }

    protected update(dt: number): void {
        this.conveyorTimer += dt;
        this.spawnTimer += dt;
        this.waveTimer += dt;
        this.warningCooldown = Math.max(0, this.warningCooldown - dt);

        if (this.conveyorTimer >= 2.7) {
            this.conveyorTimer = 0;
            this.addConveyorItem();
        }

        const spawnGap = Math.max(2.8, 4.6 - this.wave * 0.08);
        const monsterCap = Math.min(6, 2 + Math.floor(this.wave / 2));
        if (this.spawnTimer >= spawnGap && this.monsters.length < monsterCap) {
            this.spawnTimer = 0;
            this.spawnMonster();
        }

        if (this.waveTimer >= 18) {
            this.waveTimer = 0;
            this.wave += 1;
        }

        this.updateMonsters(dt);
        this.updateConveyor(dt);
        this.updateTowers(dt);
        this.updateEffects(dt);
        this.updateStatus();
    }

    protected onDestroy(): void {
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        if (sys.isBrowser && typeof document !== 'undefined') {
            document.body.style.cursor = '';
        }
    }

    private setupView(): void {
        view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, 4);
    }

    private createScene(): void {
        this.root = new Node('RuntimeRoot');
        this.node.addChild(this.root);
        if (!this.hasCanvasInParents(this.node)) {
            this.root.addComponent(Canvas);
        }
        this.setSize(this.root, DESIGN_WIDTH, DESIGN_HEIGHT);

        this.createBackground();

        this.portalLayer = this.makeLayer('PortalLayer');
        this.monsterLayer = this.makeLayer('MonsterLayer');
        this.boardLayer = this.makeLayer('BoardLayer');
        this.projectileLayer = this.makeLayer('ProjectileLayer');
        this.effectLayer = this.makeLayer('EffectLayer');
        this.uiLayer = this.makeLayer('UILayer');
        this.debugLayer = this.makeLayer('DebugLayer');

        this.createAudio();
        this.createBoard();
        this.createConveyor();
        this.createHud();
        this.createFingerGuide();
        this.createCustomCursor();
        this.createBoardDebugTools();
    }

    private makeLayer(name: string): Node {
        const layer = new Node(name);
        this.root.addChild(layer);
        this.setSize(layer, DESIGN_WIDTH, DESIGN_HEIGHT);
        return layer;
    }

    private createBackground(): void {
        const bg = this.makeSpriteNode('Background', 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
        this.root.addChild(bg);
        this.loadSprite('roc/backgrounds/board_bg').then((frame) => {
            const sprite = bg.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
            }
        });
    }

    private createAudio(): void {
        const sfxNode = new Node('SfxAudio');
        this.root.addChild(sfxNode);
        this.audioSource = sfxNode.addComponent(AudioSource);

        const bgmNode = new Node('BgmAudio');
        this.root.addChild(bgmNode);
        this.bgmSource = bgmNode.addComponent(AudioSource);
    }

    private createBoard(): void {
        for (let row = 0; row < BOARD_ROWS; row++) {
            this.board[row] = [];
            this.cellNodes[row] = [];
            for (let col = 0; col < BOARD_COLS; col++) {
                this.board[row][col] = null;
                const center = this.getCellCenter(row, col);
                const cell = new Node(`Cell_${row}_${col}`);
                cell.setPosition(center);
                this.setSize(cell, 1, 1);
                this.boardLayer.addChild(cell);
                this.cellNodes[row][col] = cell;
            }
        }
    }

    private createConveyor(): void {
        const conveyorHeight = this.getConveyorRenderHeight();
        const conveyorCenterY = -DESIGN_HEIGHT / 2 + conveyorHeight / 2;
        for (let i = 0; i < 2; i++) {
            const belt = this.makeSpriteNode(`ConveyorBelt_${i}`, i * DESIGN_WIDTH, conveyorCenterY, DESIGN_WIDTH, conveyorHeight);
            this.uiLayer.addChild(belt);
            this.conveyorBeltNodes.push(belt);
            this.loadTextureSpriteFrame('roc/ui/conveyor').then((frame) => {
                const sprite = belt.getComponent(Sprite);
                if (sprite && frame) {
                    sprite.spriteFrame = frame;
                    this.fitConveyorNode(belt, i * DESIGN_WIDTH);
                }
            });
        }

        const device = this.makeSpriteNode('ConveyorDevice', this.conveyorDevicePosition.x, conveyorCenterY, DESIGN_WIDTH, conveyorHeight);
        this.uiLayer.addChild(device);
        device.setSiblingIndex(500);
        this.conveyorDeviceNode = device;
        this.loadTextureSpriteFrame('roc/ui/conveyor_device').then((frame) => {
            const sprite = device.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
                this.fitConveyorNode(device, this.conveyorDevicePosition.x);
            }
        });
        if (DEBUG_BOARD_CALIBRATION) {
            device.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
                const p = this.touchToRoot(event);
                const centerY = this.getConveyorCenterY();
                this.conveyorDevicePosition = new Vec3(p.x, centerY, 0);
                device.setPosition(this.conveyorDevicePosition);
                this.saveConveyorDeviceCalibration();
                this.refreshBoardDebugLabel();
            }, this);
        }
    }

    private createHud(): void {
        this.statusLabel = this.addLabel(this.uiLayer, '', 24, -390, 888, Color.WHITE, 520, 44);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    }

    private createFingerGuide(): void {
        const finger = this.makeSpriteNode('FingerGuide', -310, CONVEYOR_Y - 24, 95, 80);
        this.uiLayer.addChild(finger);
        this.fingerNode = finger;
        this.loadSprite('roc/ui/finger').then((frame) => {
            const sprite = finger.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
            }
        });
        tween(finger)
            .repeatForever(
                tween()
                    .to(0.55, { position: new Vec3(-310, CONVEYOR_Y - 78, 0) })
                    .to(0.55, { position: new Vec3(-310, CONVEYOR_Y - 24, 0) })
            )
            .start();
    }

    private createCustomCursor(): void {
        if (sys.isBrowser && typeof document !== 'undefined') {
            document.body.style.cursor = 'none';
        }
        const cursor = this.makeSpriteNode('CustomCursor', 0, 0, 92, 78);
        this.uiLayer.addChild(cursor);
        cursor.setSiblingIndex(10000);
        cursor.active = false;
        this.cursorNode = cursor;
        this.loadSprite('roc/ui/finger').then((frame) => {
            const sprite = cursor.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
            }
        });
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    }

    private onMouseMove(event: EventMouse): void {
        if (!this.cursorNode) {
            return;
        }
        const loc = event.getUILocation();
        const transform = this.root.getComponent(UITransform)!;
        const p = transform.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
        this.cursorNode.active = true;
        this.cursorNode.setPosition(p.x + 24, p.y - 24, 0);
        this.keepCursorOnTop();
    }

    private addConveyorItem(): void {
        if (this.conveyor.length >= MAX_CONVEYOR) {
            return;
        }
        const kind = PIECES[Math.floor(Math.random() * PIECES.length)].id;
        const node = this.makePieceNode(`Conveyor_${kind}`, kind, 1, 80);
        const conveyorItemY = this.getConveyorItemY();
        node.setPosition(CONVEYOR_ITEM_SPAWN_X, conveyorItemY, 0);
        this.uiLayer.addChild(node);
        node.setSiblingIndex(120);
        const slotIndex = this.conveyor.length;
        const targetX = this.getConveyorSlotX(slotIndex);
        const item: ConveyorItem = { kind, node, home: new Vec3(targetX, conveyorItemY, 0), targetX, moving: true };
        this.conveyor.push(item);
        this.bindConveyorDrag(item);
        this.layoutConveyor();
        this.conveyorDeviceNode?.setSiblingIndex(500);
        this.keepCursorOnTop();
    }

    private bindConveyorDrag(item: ConveyorItem): void {
        item.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            this.startDragFromConveyor(item, event);
        }, this);
        item.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.moveDrag(event), this);
        item.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.endDrag(event), this);
        item.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.endDrag(event), this);
    }

    private bindBoardDrag(piece: BoardPiece, row: number, col: number): void {
        piece.node.off(Node.EventType.TOUCH_START);
        piece.node.off(Node.EventType.TOUCH_MOVE);
        piece.node.off(Node.EventType.TOUCH_END);
        piece.node.off(Node.EventType.TOUCH_CANCEL);
        piece.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.startDragFromBoard(row, col, event), this);
        piece.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.moveDrag(event), this);
        piece.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.endDrag(event), this);
        piece.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.endDrag(event), this);
    }

    private layoutConveyor(): void {
        this.conveyor.forEach((item, index) => {
            item.targetX = this.getConveyorSlotX(index);
            item.home = new Vec3(item.targetX, this.getConveyorItemY(), 0);
        });
    }

    private updateConveyor(dt: number): void {
        const beltTravel = CONVEYOR_SPEED * dt;
        for (const belt of this.conveyorBeltNodes) {
            belt.setPosition(belt.position.x - beltTravel, this.getConveyorCenterY(), 0);
            if (belt.position.x <= -DESIGN_WIDTH) {
                belt.setPosition(belt.position.x + DESIGN_WIDTH * 2, this.getConveyorCenterY(), 0);
            }
        }

        for (const item of this.conveyor) {
            if (this.dragState?.node === item.node) {
                continue;
            }

            const pos = item.node.position;
            if (pos.x <= item.targetX) {
                item.moving = false;
                item.node.setPosition(item.targetX, this.getConveyorItemY(), 0);
                continue;
            }

            const nextX = Math.max(item.targetX, pos.x - beltTravel);
            item.node.setPosition(nextX, this.getConveyorItemY(), 0);
            item.moving = true;
        }
    }

    private getConveyorSlotX(index: number): number {
        return CONVEYOR_ITEM_SLOT_START_X + index * CONVEYOR_ITEM_SLOT_GAP;
    }

    private getConveyorItemY(): number {
        return this.getConveyorCenterY() + CONVEYOR_ITEM_Y_OFFSET;
    }

    private startDragFromConveyor(item: ConveyorItem, event: EventTouch): void {
        this.ensureBgmStarted();
        this.playSfx('click');
        this.clearHighlight();
        this.dragState = {
            kind: item.kind,
            node: item.node,
            source: 'conveyor',
            conveyorItem: item,
            home: item.home.clone(),
        };
        this.startDragVisual(item.node, event);
    }

    private startDragFromBoard(row: number, col: number, event: EventTouch): void {
        this.ensureBgmStarted();
        this.playSfx('click');
        const piece = this.board[row][col];
        if (!piece) {
            return;
        }
        this.clearHighlight();
        this.dragState = {
            kind: piece.kind,
            node: piece.node,
            source: 'board',
            boardRow: row,
            boardCol: col,
            hp: piece.hp,
            maxHp: piece.maxHp,
            home: piece.node.position.clone(),
        };
        this.board[row][col] = null;
        this.startDragVisual(piece.node, event);
    }

    private startDragVisual(node: Node, event: EventTouch): void {
        const p = this.touchToRoot(event);
        node.setPosition(p.x, p.y, 0);
        node.setSiblingIndex(999);
        this.keepCursorOnTop();
        tween(node).to(0.08, { scale: new Vec3(1.08, 1.08, 1) }).start();
        this.updateBoardHighlight(p);
        if (this.fingerNode) {
            this.fingerNode.active = false;
        }
    }

    private moveDrag(event: EventTouch): void {
        if (!this.dragState) {
            return;
        }
        const p = this.touchToRoot(event);
        this.dragState.node.setPosition(p.x, p.y, 0);
        this.updateBoardHighlight(p);
        this.keepCursorOnTop();
    }

    private keepCursorOnTop(): void {
        if (this.cursorNode?.isValid) {
            this.cursorNode.setSiblingIndex(10000);
        }
    }

    private endDrag(event: EventTouch): void {
        if (!this.dragState) {
            return;
        }

        const drag = this.dragState;
        const p = this.touchToRoot(event);
        const targetCell = this.getCellFromPoint(p);
        this.clearHighlight();

        if (!targetCell) {
            this.restoreDrag(drag);
            this.dragState = null;
            return;
        }

        const target = this.board[targetCell.row][targetCell.col];
        if (!target) {
            this.finishDropToEmpty(drag, targetCell.row, targetCell.col);
            this.dragState = null;
            return;
        }

        const sourcePiece = drag.source === 'board' && drag.boardRow !== undefined && drag.boardCol !== undefined
            ? { level: this.getDraggingBoardLevel(drag), kind: drag.kind }
            : { level: 1, kind: drag.kind };

        if (target.kind === sourcePiece.kind && target.level === sourcePiece.level && target.level < MAX_LEVEL) {
            this.finishMerge(drag, targetCell.row, targetCell.col);
            this.dragState = null;
            return;
        }

        if (drag.source === 'board') {
            this.finishSwap(drag, targetCell.row, targetCell.col);
            this.dragState = null;
            return;
        }

        this.restoreDrag(drag);
        this.dragState = null;
    }

    private getDraggingBoardLevel(drag: DragState): number {
        const label = drag.node.getComponentInChildren(Label);
        const parsed = label ? Number(label.string) : 1;
        return Number.isFinite(parsed) ? parsed : 1;
    }

    private finishDropToEmpty(drag: DragState, row: number, col: number): void {
        const level = drag.source === 'board' ? this.getDraggingBoardLevel(drag) : 1;
        if (drag.source === 'conveyor' && drag.conveyorItem) {
            this.removeConveyorItem(drag.conveyorItem);
            drag.node.destroy();
            this.placePiece(row, col, drag.kind, level);
            this.playSfx('place');
            this.layoutConveyor();
            return;
        }

        const piece: BoardPiece = {
            kind: drag.kind,
            level,
            node: drag.node,
            cooldown: 0.25,
            skillCooldown: 3.5,
            hp: drag.hp ?? this.getPieceMaxHp(drag.kind, level),
            maxHp: drag.maxHp ?? this.getPieceMaxHp(drag.kind, level),
        };
        const center = this.getCellCenter(row, col);
        tween(drag.node).to(0.1, { position: center, scale: Vec3.ONE }).start();
        this.board[row][col] = piece;
        this.bindBoardDrag(piece, row, col);
        this.playSfx('place');
    }

    private finishSwap(drag: DragState, targetRow: number, targetCol: number): void {
        if (drag.boardRow === undefined || drag.boardCol === undefined) {
            this.restoreDrag(drag);
            return;
        }

        const target = this.board[targetRow][targetCol];
        if (!target) {
            this.finishDropToEmpty(drag, targetRow, targetCol);
            return;
        }

        const sourceRow = drag.boardRow;
        const sourceCol = drag.boardCol;
        const draggedPiece: BoardPiece = {
            kind: drag.kind,
            level: this.getDraggingBoardLevel(drag),
            node: drag.node,
            cooldown: 0.18,
            skillCooldown: 3.5,
            hp: drag.hp ?? this.getPieceMaxHp(drag.kind, this.getDraggingBoardLevel(drag)),
            maxHp: drag.maxHp ?? this.getPieceMaxHp(drag.kind, this.getDraggingBoardLevel(drag)),
        };

        this.board[targetRow][targetCol] = draggedPiece;
        this.board[sourceRow][sourceCol] = target;
        const targetCenter = this.getCellCenter(targetRow, targetCol);
        const sourceCenter = this.getCellCenter(sourceRow, sourceCol);
        tween(draggedPiece.node).to(0.1, { position: targetCenter, scale: Vec3.ONE }).start();
        tween(target.node).to(0.1, { position: sourceCenter, scale: Vec3.ONE }).start();
        this.bindBoardDrag(draggedPiece, targetRow, targetCol);
        this.bindBoardDrag(target, sourceRow, sourceCol);
        this.playSfx('click');
    }

    private finishMerge(drag: DragState, row: number, col: number): void {
        const center = this.getCellCenter(row, col);
        if (drag.source === 'conveyor' && drag.conveyorItem) {
            this.removeConveyorItem(drag.conveyorItem);
            drag.node.destroy();
            this.layoutConveyor();
        } else {
            drag.node.destroy();
        }
        this.playEffect('merge', center.x, center.y, 0.58);
        this.upgradePiece(row, col);
    }

    private restoreDrag(drag: DragState): void {
        if (drag.source === 'board' && drag.boardRow !== undefined && drag.boardCol !== undefined) {
            const level = this.getDraggingBoardLevel(drag);
            const piece: BoardPiece = {
                kind: drag.kind,
                level,
                node: drag.node,
                cooldown: 0.25,
                skillCooldown: 3.5,
                hp: drag.hp ?? this.getPieceMaxHp(drag.kind, level),
                maxHp: drag.maxHp ?? this.getPieceMaxHp(drag.kind, level),
            };
            this.board[drag.boardRow][drag.boardCol] = piece;
            this.bindBoardDrag(piece, drag.boardRow, drag.boardCol);
        }
        tween(drag.node).to(0.14, { position: drag.home, scale: Vec3.ONE }).start();
    }

    private removeConveyorItem(item: ConveyorItem): void {
        const index = this.conveyor.indexOf(item);
        if (index >= 0) {
            this.conveyor.splice(index, 1);
        }
    }

    private placePiece(row: number, col: number, kind: PieceKind, level: number): void {
        const center = this.getCellCenter(row, col);
        const node = this.makePieceNode(`Piece_${kind}_${level}`, kind, level, 76);
        node.setPosition(center);
        this.boardLayer.addChild(node);
        const maxHp = this.getPieceMaxHp(kind, level);
        const piece: BoardPiece = { kind, level, node, cooldown: 0.35, skillCooldown: 3.5, hp: maxHp, maxHp };
        this.board[row][col] = piece;
        this.bindBoardDrag(piece, row, col);
    }

    private upgradePiece(row: number, col: number): void {
        const piece = this.board[row][col];
        if (!piece || piece.level >= MAX_LEVEL) {
            return;
        }
        piece.level += 1;
        piece.cooldown = 0.1;
        piece.skillCooldown = 2.2;
        piece.maxHp = this.getPieceMaxHp(piece.kind, piece.level);
        piece.hp = piece.maxHp;
        this.refreshPieceSprite(piece);
        this.playMergeSound(piece.level);
        tween(piece.node)
            .to(0.08, { scale: new Vec3(1.12, 1.12, 1) })
            .to(0.12, { scale: Vec3.ONE })
            .start();
        this.playEffect('upgrade', piece.node.position.x, piece.node.position.y, 0.62);
    }

    private makePieceNode(name: string, kind: PieceKind, level: number, size: number): Node {
        const node = new Node(name);
        this.setSize(node, size, size);

        const shadow = this.makeSpriteNode('PieceShadow', 0, -size * 0.26, size * 0.84, size * 0.32);
        node.addChild(shadow);
        this.loadSprite('roc/pieces/shadow').then((frame) => {
            const sprite = shadow.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
            }
        });

        const body = this.makeSpriteNode('PieceBody', 0, 0, size, size);
        node.addChild(body);
        this.loadPieceSprite(kind, level).then((frame) => {
            const sprite = body.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
            }
        });
        this.addLabel(node, String(level), 18, size * 0.31, -size * 0.32, new Color(255, 248, 205, 255), 30, 28);
        return node;
    }

    private refreshPieceSprite(piece: BoardPiece): void {
        this.loadPieceSprite(piece.kind, piece.level).then((frame) => {
            const sprite = this.getPieceBodySprite(piece.node);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
            }
        });
        const label = piece.node.getComponentInChildren(Label);
        if (label) {
            label.string = String(piece.level);
        }
    }

    private spawnMonster(): void {
        const kind = this.killed < 8 ? 'devil' : 'mushroom';
        const lane = Math.floor(Math.random() * MONSTER_LANES);
        const hp = Math.floor(MONSTER_HP[kind] * (1 + (this.wave - 1) * 0.2));
        const x = this.getLaneX(lane, MONSTER_START_Y);
        const shadowNode = this.makeSpriteNode(`MonsterShadow_${kind}`, x, MONSTER_START_Y - 58, MONSTER_BASE_SIZE[kind] * 0.74, MONSTER_BASE_SIZE[kind] * 0.3);
        this.monsterLayer.addChild(shadowNode);
        const node = this.makeSpriteNode(`Monster_${kind}`, x, MONSTER_START_Y, MONSTER_BASE_SIZE[kind], MONSTER_BASE_SIZE[kind]);
        this.monsterLayer.addChild(node);

        const monster: Monster = {
            kind,
            node,
            hp,
            maxHp: hp,
            speed: 33 + this.wave * 1.1,
            lane,
            alive: true,
            frames: this.monsterFrameCache.get(kind) || [],
            shadowNode,
            shadowFrames: this.monsterShadowFrameCache.get(kind) || [],
            frameIndex: 0,
            frameTimer: 0,
            eatCooldown: 0,
            slowTimer: 0,
            slowFactor: 1,
        };

        if (monster.frames.length > 0) {
            node.getComponent(Sprite)!.spriteFrame = monster.frames[0];
        } else {
            this.loadMonsterFrames(kind).then((frames) => {
                monster.frames = frames;
                if (monster.alive && frames[0]) {
                    node.getComponent(Sprite)!.spriteFrame = frames[0];
                }
            });
        }
        if (monster.shadowFrames.length > 0) {
            shadowNode.getComponent(Sprite)!.spriteFrame = monster.shadowFrames[0];
        } else {
            this.loadMonsterShadowFrames(kind).then((frames) => {
                monster.shadowFrames = frames;
                if (monster.alive && frames[0]) {
                    shadowNode.getComponent(Sprite)!.spriteFrame = frames[0];
                }
            });
        }
        this.monsters.push(monster);
        this.playEffect('portal', x, MONSTER_START_Y + 8, 0.72);
    }

    private updateMonsters(dt: number): void {
        for (const monster of this.monsters) {
            if (!monster.alive) {
                continue;
            }

            const pos = monster.node.position;
            monster.slowTimer = Math.max(0, monster.slowTimer - dt);
            if (monster.slowTimer <= 0) {
                monster.slowFactor = 1;
                const sprite = monster.node.getComponent(Sprite);
                if (sprite) {
                    sprite.color = Color.WHITE;
                }
            }
            const nextY = pos.y - monster.speed * monster.slowFactor * dt;
            const nextX = this.getLaneX(monster.lane, nextY);
            monster.node.setPosition(nextX, nextY, 0);
            const perspectiveScale = this.getPerspectiveScale(nextY);
            monster.node.setScale(perspectiveScale, perspectiveScale, 1);
            monster.shadowNode.setPosition(nextX, nextY - 58 * perspectiveScale, 0);
            monster.shadowNode.setScale(perspectiveScale * 0.8, perspectiveScale * 0.8, 1);
            monster.eatCooldown = Math.max(0, monster.eatCooldown - dt);

            monster.frameTimer += dt;
            while (monster.frames.length > 0 && monster.frameTimer >= 1 / 30) {
                monster.frameTimer -= 1 / 30;
                monster.frameIndex = (monster.frameIndex + 1) % monster.frames.length;
                const sprite = monster.node.getComponent(Sprite);
                if (sprite) {
                    sprite.spriteFrame = monster.frames[monster.frameIndex];
                }
                const shadowSprite = monster.shadowNode.getComponent(Sprite);
                if (shadowSprite && monster.shadowFrames[monster.frameIndex]) {
                    shadowSprite.spriteFrame = monster.shadowFrames[monster.frameIndex];
                }
            }

            this.tryMonsterEatPiece(monster);

            if (nextY <= MONSTER_END_Y) {
                monster.alive = false;
                monster.shadowNode.destroy();
                monster.node.destroy();
                this.life = Math.max(0, this.life - 1);
                this.playSfx('warning');
            } else if (nextY <= MONSTER_END_Y + 180 && this.warningCooldown <= 0) {
                this.warningCooldown = 3.2;
                this.playSfx('warning');
            }
        }
        this.monsters = this.monsters.filter((monster) => monster.alive);
        this.sortMonstersByDepth();
    }

    private tryMonsterEatPiece(monster: Monster): void {
        if (monster.eatCooldown > 0 || monster.lane < 0 || monster.lane >= BOARD_COLS) {
            return;
        }

        for (let row = 0; row < BOARD_ROWS; row++) {
            const piece = this.board[row]?.[monster.lane];
            if (!piece) {
                continue;
            }

            const center = this.getCellCenter(row, monster.lane);
            const size = this.getCellVisualSize(row, monster.lane);
            const closeY = Math.abs(monster.node.position.y - center.y) <= size.height * 0.42;
            const closeX = Math.abs(monster.node.position.x - center.x) <= size.width * 0.5;
            if (closeX && closeY) {
                this.eatPiece(row, monster.lane);
                monster.eatCooldown = 0.75;
                return;
            }
        }
    }

    private eatPiece(row: number, col: number): void {
        const piece = this.board[row]?.[col];
        if (!piece) {
            return;
        }

        this.flashPieceRed(piece.node);
        this.playSfx('consume');
        piece.hp -= 1;
        if (piece.hp > 0) {
            tween(piece.node)
                .to(0.06, { scale: new Vec3(0.92, 0.92, 1) })
                .to(0.08, { scale: Vec3.ONE })
                .start();
            return;
        }

        this.board[row][col] = null;
        tween(piece.node)
            .to(0.08, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.1, { scale: new Vec3(0.74, 0.74, 1) })
            .call(() => piece.node.destroy())
            .start();
    }

    private flashPieceRed(node: Node): void {
        const sprite = this.getPieceBodySprite(node);
        if (!sprite) {
            return;
        }
        sprite.color = new Color(255, 82, 82, 255);
        this.scheduleOnce(() => {
            if (sprite.isValid) {
                sprite.color = Color.WHITE;
            }
        }, 0.1);
    }

    private getPieceMaxHp(kind: PieceKind, level: number): number {
        return kind === 'swordsman' ? 2 + level : 1;
    }

    private updateTowers(dt: number): void {
        for (let row = 0; row < BOARD_ROWS; row++) {
            for (let col = 0; col < BOARD_COLS; col++) {
                const piece = this.board[row][col];
                if (!piece || piece.level < 2) {
                    continue;
                }

                piece.cooldown -= dt;
                piece.skillCooldown -= dt;

                if (piece.kind === 'archer' && piece.level >= MAX_LEVEL && piece.skillCooldown <= 0) {
                    piece.skillCooldown = 5.2;
                    this.castArcherRain(piece);
                }

                if (piece.cooldown > 0) {
                    continue;
                }

                const cfg = this.getPieceConfig(piece.kind);
                const target = this.findTarget(piece, col, cfg);
                if (!target) {
                    continue;
                }

                const speedMultiplier = 1 + (piece.level - 1) * 0.18;
                piece.cooldown = cfg.baseInterval / speedMultiplier;
                this.attack(piece, target, cfg);
            }
        }
    }

    private findTarget(piece: BoardPiece, col: number, cfg: PieceConfig): Monster | null {
        let best: Monster | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        const from = piece.node.position;
        for (const monster of this.monsters) {
            if (!monster.alive) {
                continue;
            }

            if (cfg.melee) {
                const distance = Vec3.distance(from, monster.node.position);
                if (distance <= cfg.range && distance < bestScore) {
                    best = monster;
                    bestScore = distance;
                }
                continue;
            }

            if (monster.lane !== col || monster.node.position.y <= from.y) {
                continue;
            }
            const verticalDistance = monster.node.position.y - from.y;
            if (verticalDistance <= cfg.range && verticalDistance < bestScore) {
                best = monster;
                bestScore = verticalDistance;
            }
        }
        return best;
    }

    private attack(piece: BoardPiece, target: Monster, cfg: PieceConfig): void {
        const damage = Math.floor((cfg.damage + piece.level * 7) * (cfg.melee ? 1.2 : 1));
        this.playAttackMotion(piece.node);
        this.playSfx('attack');
        if (cfg.melee) {
            this.fireSwordSlash(piece, target, damage);
            return;
        }

        if (piece.kind === 'monkey') {
            const shots = piece.level >= 3 ? 2 : 1;
            for (let i = 0; i < shots; i++) {
                this.scheduleOnce(() => this.fireProjectile(piece, target, damage, { duration: 0.28, maxSide: 62, spin: true }), i * 0.12);
            }
            return;
        }

        if (piece.kind === 'muka') {
            const bulletCount = Math.min(5, 1 + Math.floor(piece.level / 2));
            const center = (bulletCount - 1) / 2;
            for (let i = 0; i < bulletCount; i++) {
                this.fireProjectile(piece, target, Math.floor(damage * 0.72), {
                    duration: 0.3,
                    maxSide: 54,
                    endOffsetX: (i - center) * 46,
                    endOffsetY: -Math.abs(i - center) * 8,
                });
            }
            return;
        }

        if (piece.kind === 'mage') {
            this.fireProjectile(piece, target, damage, {
                duration: 0.34,
                maxSide: 62,
                onHit: (monster) => this.applyFreeze(monster, piece.level),
            });
            return;
        }

        this.fireProjectile(piece, target, damage, { duration: 0.24, maxSide: 58 });
    }

    private fireProjectile(
        piece: BoardPiece,
        target: Monster,
        damage: number,
        options: { duration: number; maxSide: number; spin?: boolean; endOffsetX?: number; endOffsetY?: number; onHit?: (monster: Monster) => void },
    ): void {
        if (!target.alive) {
            return;
        }
        const start = piece.node.position.clone();
        const projectile = this.makeSpriteNode('Projectile', start.x, start.y + 25, 54, 54);
        this.projectileLayer.addChild(projectile);
        this.loadSprite(this.getPieceConfig(piece.kind).bullet).then((frame) => {
            const sprite = projectile.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
                this.fitNodeToFrame(projectile, frame, options.maxSide);
            }
        });
        if (options.spin) {
            tween(projectile).by(options.duration, { eulerAngles: new Vec3(0, 0, 720) }).start();
        }
        const end = target.node.position.clone();
        tween(projectile)
            .to(options.duration, { position: new Vec3(end.x + (options.endOffsetX || 0), end.y + 22 + (options.endOffsetY || 0), 0) })
            .call(() => {
                projectile.destroy();
                if (target.alive) {
                    options.onHit?.(target);
                    this.damageMonster(target, damage);
                }
            })
            .start();
    }

    private fireSwordSlash(piece: BoardPiece, target: Monster, damage: number): void {
        const start = piece.node.position.clone();
        const slash = this.makeSpriteNode('SwordSlashProjectile', start.x, start.y + 18, 82, 82);
        this.projectileLayer.addChild(slash);
        this.loadSprite(this.getPieceConfig('swordsman').bullet).then((frame) => {
            const sprite = slash.getComponent(Sprite);
            if (sprite && frame) {
                sprite.spriteFrame = frame;
                this.fitNodeToFrame(slash, frame, 82);
            }
        });
        const end = target.node.position.clone();
        tween(slash)
            .to(0.12, { position: new Vec3(end.x, end.y + 20, 0), scale: new Vec3(1.18, 1.18, 1) })
            .call(() => {
                slash.destroy();
                if (target.alive) {
                    this.damageMonster(target, damage);
                    this.playSlash(end.x, end.y + 12);
                }
            })
            .start();
    }

    private applyFreeze(monster: Monster, level: number): void {
        monster.slowFactor = Math.max(0.38, 0.68 - level * 0.04);
        monster.slowTimer = 1.25 + level * 0.16;
        this.scheduleOnce(() => {
            if (!monster.alive || monster.slowTimer <= 0) {
                return;
            }
            const sprite = monster.node.getComponent(Sprite);
            if (sprite) {
                sprite.color = new Color(145, 225, 255, 255);
            }
        }, 0.09);
    }

    private playAttackMotion(node: Node): void {
        tween(node)
            .to(0.06, { scale: new Vec3(0.92, 0.92, 1) })
            .to(0.08, { scale: Vec3.ONE })
            .start();
    }

    private playSlash(x: number, y: number): void {
        const slash = this.makeRectNode('SlashHit', x, y, 72, 26, new Color(255, 240, 180, 160), new Color(255, 110, 80, 220));
        this.effectLayer.addChild(slash);
        tween(slash)
            .to(0.1, { scale: new Vec3(1.25, 1.25, 1) })
            .to(0.08, { scale: new Vec3(0.2, 0.2, 1) })
            .call(() => slash.destroy())
            .start();
    }

    private damageMonster(monster: Monster, damage: number): void {
        if (!monster.alive) {
            return;
        }
        monster.hp -= damage;
        this.playHitFlash(monster.node);
        this.showDamageNumber(monster.node.position, damage);
        this.playEffect('hit', monster.node.position.x, monster.node.position.y + 10, monster.node.scale.x * 0.62);
        this.playSfx('hit');
        if (monster.hp <= 0) {
            const position = monster.node.position.clone();
            const deathScale = monster.node.scale.x;
            monster.alive = false;
            this.score += 10 + this.wave;
            this.killed += 1;
            this.playEffect('death', position.x, position.y + 8, deathScale * 0.78);
            this.playSfx('death');
            monster.shadowNode.destroy();
            monster.node.destroy();
        }
    }

    private playHitFlash(node: Node): void {
        const sprite = node.getComponent(Sprite);
        if (!sprite) {
            return;
        }
        sprite.color = new Color(255, 95, 95, 255);
        this.scheduleOnce(() => {
            if (sprite.isValid) {
                sprite.color = Color.WHITE;
            }
        }, 0.08);
    }

    private showDamageNumber(position: Vec3, damage: number): void {
        const text = this.formatDamage(damage);
        const label = this.addLabel(this.effectLayer, text, 34, position.x, position.y + 58, new Color(255, 120, 88, 255), 130, 48);
        const node = label.node;
        const outline = node.addComponent(LabelOutline);
        outline.color = new Color(86, 46, 18, 255);
        outline.width = 4;
        tween(node)
            .to(0.42, { position: new Vec3(position.x, position.y + 94, 0) })
            .to(0.12, { scale: new Vec3(0.9, 0.9, 1) })
            .call(() => node.destroy())
            .start();
    }

    private formatDamage(damage: number): string {
        const scaled = damage * 1000;
        if (scaled >= 1000) {
            return `${Math.round(scaled / 1000)}K`;
        }
        return String(scaled);
    }

    private castArcherRain(piece: BoardPiece): void {
        this.playRainAnimation();
        for (const monster of this.monsters) {
            if (monster.alive) {
                this.damageMonster(monster, 78 + piece.level * 16);
            }
        }
    }

    private async playRainAnimation(): Promise<void> {
        const frames = await this.loadRainFrames();
        if (frames.length === 0) {
            return;
        }
        const node = this.makeSpriteNode('ArrowRain', 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
        this.effectLayer.addChild(node);
        let index = 0;
        const sprite = node.getComponent(Sprite)!;
        const tick = () => {
            if (!node.isValid) {
                return;
            }
            sprite.spriteFrame = frames[index];
            index += 1;
            if (index >= frames.length) {
                node.destroy();
                return;
            }
            this.scheduleOnce(tick, 1 / 30);
        };
        tick();
    }

    private async playEffect(type: EffectKind, x: number, y: number, scale = 1): Promise<void> {
        const frames = await this.loadEffectFrames(type);
        if (frames.length === 0) {
            return;
        }
        const width = type === 'merge' ? 360 : type === 'portal' ? 260 : type === 'death' ? 240 : type === 'hit' ? 160 : 220;
        const height = type === 'merge' ? 203 : type === 'portal' ? 260 : type === 'death' ? 240 : type === 'hit' ? 160 : 220;
        const node = this.makeSpriteNode(`${type}Effect`, x, y, width * scale, height * scale);
        const parent = type === 'portal' ? this.portalLayer : this.effectLayer;
        parent.addChild(node);
        const sprite = node.getComponent(Sprite)!;
        sprite.spriteFrame = frames[0];
        this.activeEffects.push({
            node,
            sprite,
            frames,
            index: 0,
            timer: 0,
            frameDuration: 1 / 30,
        });
    }

    private updateEffects(dt: number): void {
        for (let i = this.activeEffects.length - 1; i >= 0; i--) {
            const effect = this.activeEffects[i];
            if (!effect.node.isValid) {
                this.activeEffects.splice(i, 1);
                continue;
            }

            effect.timer += dt;
            while (effect.timer >= effect.frameDuration) {
                effect.timer -= effect.frameDuration;
                effect.index += 1;
                if (effect.index >= effect.frames.length) {
                    effect.node.destroy();
                    this.activeEffects.splice(i, 1);
                    break;
                }
                effect.sprite.spriteFrame = effect.frames[effect.index];
            }
        }
    }

    private async loadEffectFrames(type: EffectKind): Promise<SpriteFrame[]> {
        const cached = this.effectFrameCache.get(type);
        if (cached) {
            return cached;
        }
        const count = type === 'portal' ? 47 : type === 'upgrade' ? 29 : type === 'death' ? 23 : type === 'hit' ? 18 : 24;
        const prefix = type === 'portal' ? 'portal' : type === 'upgrade' ? 'upgrade' : type === 'death' ? 'death' : type === 'hit' ? 'hit' : 'merge';
        const frames: SpriteFrame[] = [];
        for (let i = 0; i < count; i++) {
            const path = `roc/effects/${type}/${prefix}_${this.pad(i)}`;
            const frame = await this.loadSprite(path) || await this.loadTextureSpriteFrame(path);
            if (frame) {
                frames.push(frame);
            }
        }
        this.effectFrameCache.set(type, frames);
        this.effectFrameCounts[type] = frames.length;
        return frames;
    }

    private loadTextureSpriteFrame(path: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            resources.load(path, Texture2D, (err, texture) => {
                if (err || !texture) {
                    resolve(null);
                    return;
                }
                const frame = new SpriteFrame();
                frame.reset({ texture }, true);
                resolve(frame);
            });
        });
    }

    private updateStatus(): void {
        this.statusLabel.string = `HP ${this.life}  W ${this.wave}  K ${this.killed}  S ${this.score}  FX P${this.effectFrameCounts.portal} M${this.effectFrameCounts.merge} U${this.effectFrameCounts.upgrade} D${this.effectFrameCounts.death} H${this.effectFrameCounts.hit}`;
        if (this.life <= 0 && !this.gameOverHandled) {
            this.gameOverHandled = true;
            this.playSfx('fail');
        }
        if (this.life <= 0 || this.killed >= 40) {
            this.enabled = false;
        }
    }

    private getCellCenter(row: number, col: number): Vec3 {
        return this.getBoardPoint((col + 0.5) / BOARD_COLS, (row + 0.5) / BOARD_ROWS);
    }

    private getCellVisualSize(row: number, col: number): { width: number; height: number } {
        const corners = this.getCellCorners(row, col);
        return {
            width: (Vec3.distance(corners[0], corners[1]) + Vec3.distance(corners[3], corners[2])) / 2,
            height: (Vec3.distance(corners[0], corners[3]) + Vec3.distance(corners[1], corners[2])) / 2,
        };
    }

    private getCellFromPoint(point: Vec3): { row: number; col: number } | null {
        for (let row = 0; row < BOARD_ROWS; row++) {
            for (let col = 0; col < BOARD_COLS; col++) {
                if (this.pointInQuad(point, this.getCellCorners(row, col))) {
                    return { row, col };
                }
            }
        }
        return null;
    }

    private getLaneX(lane: number, y: number): number {
        const topY = (this.boardCorners.tl.y + this.boardCorners.tr.y) / 2;
        const bottomY = (this.boardCorners.bl.y + this.boardCorners.br.y) / 2;
        const v = (y - topY) / (bottomY - topY);
        return this.getBoardPoint((lane + 0.5) / MONSTER_LANES, v).x;
    }

    private getPerspectiveScale(y: number): number {
        const t = Math.min(1, Math.max(0, (y - PATH_TOP_Y) / (PATH_BOTTOM_Y - PATH_TOP_Y)));
        return this.lerp(0.82, 1.04, t);
    }

    private touchToRoot(event: EventTouch): Vec3 {
        const loc = event.getUILocation();
        const transform = this.root.getComponent(UITransform)!;
        return transform.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
    }

    private updateBoardHighlight(point: Vec3): void {
        const cell = this.getCellFromPoint(point);
        if (!cell) {
            this.clearHighlight();
            return;
        }
        const center = this.getCellCenter(cell.row, cell.col);
        const size = this.getCellVisualSize(cell.row, cell.col);
        this.showHighlight(center, size.width * 0.9, size.height * 0.9);
    }

    private showHighlight(position: Vec3, width: number, height: number): void {
        if (!this.highlightNode || !this.highlightNode.isValid) {
            this.highlightNode = this.makeSpriteNode('SelectionHighlight', 0, 0, width, height);
            this.effectLayer.addChild(this.highlightNode);
            this.loadSprite('roc/effects/select/board_highlight').then((frame) => {
                const sprite = this.highlightNode?.getComponent(Sprite);
                if (sprite && frame) {
                    sprite.spriteFrame = frame;
                }
            });
        }
        this.highlightNode.setPosition(position.x, position.y, 0);
        this.setSize(this.highlightNode, width, height);
    }

    private clearHighlight(): void {
        if (this.highlightNode && this.highlightNode.isValid) {
            this.highlightNode.destroy();
        }
        this.highlightNode = null;
    }

    private sortMonstersByDepth(): void {
        const sorted = [...this.monsters].sort((a, b) => b.node.position.y - a.node.position.y);
        sorted.forEach((monster, index) => {
            monster.shadowNode.setSiblingIndex(index * 2);
            monster.node.setSiblingIndex(index * 2 + 1);
        });
    }

    private createBoardDebugTools(): void {
        if (!DEBUG_BOARD_CALIBRATION) {
            return;
        }

        const gridNode = new Node('BoardDebugGrid');
        this.debugLayer.addChild(gridNode);
        this.setSize(gridNode, DESIGN_WIDTH, DESIGN_HEIGHT);
        this.boardDebugGraphics = gridNode.addComponent(Graphics);

        (['tl', 'tr', 'bl', 'br'] as BoardCornerKey[]).forEach((key) => {
            const point = this.boardCorners[key];
            const handle = this.makeRectNode(`BoardCorner_${key}`, point.x, point.y, 38, 38, new Color(255, 35, 45, 185), Color.WHITE);
            this.debugLayer.addChild(handle);
            handle.setSiblingIndex(1000);
            handle.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
                const p = this.touchToRoot(event);
                this.boardCorners[key] = new Vec3(p.x, p.y, 0);
                handle.setPosition(p.x, p.y, 0);
                this.saveBoardCalibration();
                this.refreshBoardDebugOverlay();
            }, this);
        });

        const panel = this.makeRectNode('BoardDebugPanel', 0, 610, 1040, 96, new Color(0, 0, 0, 145), new Color(255, 45, 60, 140));
        this.debugLayer.addChild(panel);
        this.boardDebugLabel = this.addLabel(this.debugLayer, '', 21, 0, 610, new Color(255, 245, 210, 255), 1000, 86);
        this.boardDebugLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.refreshBoardDebugOverlay();
    }

    private refreshBoardDebugOverlay(): void {
        if (!this.boardDebugGraphics) {
            return;
        }

        const g = this.boardDebugGraphics;
        g.clear();
        g.lineWidth = 3;
        g.strokeColor = new Color(255, 45, 60, 220);

        for (let row = 0; row <= BOARD_ROWS; row++) {
            const v = row / BOARD_ROWS;
            const left = this.getBoardPoint(0, v);
            const right = this.getBoardPoint(1, v);
            g.moveTo(left.x, left.y);
            g.lineTo(right.x, right.y);
        }

        for (let col = 0; col <= BOARD_COLS; col++) {
            const u = col / BOARD_COLS;
            const top = this.getBoardPoint(u, 0);
            const bottom = this.getBoardPoint(u, 1);
            g.moveTo(top.x, top.y);
            g.lineTo(bottom.x, bottom.y);
        }
        g.stroke();

        this.refreshBoardDebugLabel();
        this.reflowBoardNodes();
    }

    private refreshBoardDebugLabel(): void {
        if (!this.boardDebugLabel) {
            return;
        }
        const tl = this.boardCorners.tl;
        const tr = this.boardCorners.tr;
        const bl = this.boardCorners.bl;
        const br = this.boardCorners.br;
        const device = this.conveyorDevicePosition;
        this.boardDebugLabel.string = `Board calibration saved\nTL(${Math.round(tl.x)},${Math.round(tl.y)}) TR(${Math.round(tr.x)},${Math.round(tr.y)})  BL(${Math.round(bl.x)},${Math.round(bl.y)}) BR(${Math.round(br.x)},${Math.round(br.y)})  Device(${Math.round(device.x)},${Math.round(device.y)})`;
    }

    private loadBoardCalibration(): void {
        const data = sys.localStorage.getItem(BOARD_CALIBRATION_KEY);
        if (!data) {
            return;
        }

        try {
            const parsed = JSON.parse(data) as Record<BoardCornerKey, { x: number; y: number }>;
            (['tl', 'tr', 'bl', 'br'] as BoardCornerKey[]).forEach((key) => {
                const point = parsed[key];
                if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
                    this.boardCorners[key] = new Vec3(point.x, point.y, 0);
                }
            });
        } catch {
            sys.localStorage.removeItem(BOARD_CALIBRATION_KEY);
        }
    }

    private saveBoardCalibration(): void {
        const payload = {
            tl: { x: Math.round(this.boardCorners.tl.x), y: Math.round(this.boardCorners.tl.y) },
            tr: { x: Math.round(this.boardCorners.tr.x), y: Math.round(this.boardCorners.tr.y) },
            bl: { x: Math.round(this.boardCorners.bl.x), y: Math.round(this.boardCorners.bl.y) },
            br: { x: Math.round(this.boardCorners.br.x), y: Math.round(this.boardCorners.br.y) },
        };
        sys.localStorage.setItem(BOARD_CALIBRATION_KEY, JSON.stringify(payload));
    }

    private loadConveyorDeviceCalibration(): void {
        if (!DEBUG_BOARD_CALIBRATION) {
            sys.localStorage.removeItem(CONVEYOR_DEVICE_CALIBRATION_KEY);
            return;
        }
        const data = sys.localStorage.getItem(CONVEYOR_DEVICE_CALIBRATION_KEY);
        if (!data) {
            return;
        }
        try {
            const parsed = JSON.parse(data) as { x: number; y: number };
            if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
                this.conveyorDevicePosition = new Vec3(parsed.x, parsed.y, 0);
            }
        } catch {
            sys.localStorage.removeItem(CONVEYOR_DEVICE_CALIBRATION_KEY);
        }
    }

    private saveConveyorDeviceCalibration(): void {
        sys.localStorage.setItem(CONVEYOR_DEVICE_CALIBRATION_KEY, JSON.stringify({
            x: Math.round(this.conveyorDevicePosition.x),
            y: Math.round(this.conveyorDevicePosition.y),
        }));
    }

    private reflowBoardNodes(): void {
        for (let row = 0; row < BOARD_ROWS; row++) {
            for (let col = 0; col < BOARD_COLS; col++) {
                const center = this.getCellCenter(row, col);
                this.cellNodes[row]?.[col]?.setPosition(center);
                const piece = this.board[row]?.[col];
                if (piece) {
                    piece.node.setPosition(center);
                }
            }
        }
    }

    private getCellCorners(row: number, col: number): Vec3[] {
        const u0 = col / BOARD_COLS;
        const u1 = (col + 1) / BOARD_COLS;
        const v0 = row / BOARD_ROWS;
        const v1 = (row + 1) / BOARD_ROWS;
        return [
            this.getBoardPoint(u0, v0),
            this.getBoardPoint(u1, v0),
            this.getBoardPoint(u1, v1),
            this.getBoardPoint(u0, v1),
        ];
    }

    private getBoardPoint(u: number, v: number): Vec3 {
        const top = this.lerpVec3(this.boardCorners.tl, this.boardCorners.tr, u);
        const bottom = this.lerpVec3(this.boardCorners.bl, this.boardCorners.br, u);
        return this.lerpVec3(top, bottom, v);
    }

    private pointInQuad(point: Vec3, corners: Vec3[]): boolean {
        return this.pointInTriangle(point, corners[0], corners[1], corners[2])
            || this.pointInTriangle(point, corners[0], corners[2], corners[3]);
    }

    private pointInTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
        const d1 = this.signedArea(point, a, b);
        const d2 = this.signedArea(point, b, c);
        const d3 = this.signedArea(point, c, a);
        const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
        return !(hasNegative && hasPositive);
    }

    private signedArea(p1: Vec3, p2: Vec3, p3: Vec3): number {
        return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    }

    private preloadMonsterFrames(): void {
        this.loadMonsterFrames('devil');
        this.loadMonsterFrames('mushroom');
        this.loadMonsterShadowFrames('devil');
        this.loadMonsterShadowFrames('mushroom');
    }

    private preloadEffectFrames(): void {
        this.loadEffectFrames('portal');
        this.loadEffectFrames('merge');
        this.loadEffectFrames('upgrade');
        this.loadEffectFrames('death');
        this.loadEffectFrames('hit');
    }

    private async loadMonsterFrames(kind: MonsterKind): Promise<SpriteFrame[]> {
        const cached = this.monsterFrameCache.get(kind);
        if (cached) {
            return cached;
        }
        const frames: SpriteFrame[] = [];
        for (let i = 0; i < 24; i++) {
            const frame = await this.loadSprite(`roc/monsters/${kind}/move_${this.pad(i)}`);
            if (frame) {
                frames.push(frame);
            }
        }
        this.monsterFrameCache.set(kind, frames);
        return frames;
    }

    private async loadMonsterShadowFrames(kind: MonsterKind): Promise<SpriteFrame[]> {
        const cached = this.monsterShadowFrameCache.get(kind);
        if (cached) {
            return cached;
        }
        const frames: SpriteFrame[] = [];
        for (let i = 0; i < 25; i++) {
            const frame = await this.loadSprite(`roc/monsters/${kind}_shadow/shadow_${this.pad(i)}`);
            if (frame) {
                frames.push(frame);
            }
        }
        this.monsterShadowFrameCache.set(kind, frames);
        return frames;
    }

    private async loadRainFrames(): Promise<SpriteFrame[]> {
        if (this.rainFrames) {
            return this.rainFrames;
        }
        const frames: SpriteFrame[] = [];
        for (let i = 0; i < 53; i++) {
            const frame = await this.loadSprite(`roc/bullets/archer_skill/rain_${this.pad(i)}`);
            if (frame) {
                frames.push(frame);
            }
        }
        this.rainFrames = frames;
        return frames;
    }

    private loadPieceSprite(kind: PieceKind, level: number): Promise<SpriteFrame | null> {
        return this.loadSprite(`roc/pieces/${kind}/${level}`);
    }

    private getPieceBodySprite(node: Node): Sprite | null {
        const body = node.getChildByName('PieceBody');
        return body?.getComponent(Sprite) || node.getComponent(Sprite);
    }

    private playMergeSound(level: number): void {
        if (level >= MAX_LEVEL) {
            this.playSfx('mergeUltra');
            return;
        }
        if (level >= 4) {
            this.playSfx('mergeGreat');
            return;
        }
        this.playSfx('merge');
    }

    private preloadAudio(): void {
        (Object.keys(AUDIO_PATHS) as AudioKey[]).forEach((key) => this.loadAudio(key));
    }

    private ensureBgmStarted(): void {
        if (this.bgmStarted) {
            return;
        }
        this.loadAudio('bgm').then((clip) => {
            if (!clip || this.bgmStarted || !this.bgmSource?.isValid) {
                return;
            }
            this.bgmSource.clip = clip;
            this.bgmSource.loop = true;
            this.bgmSource.volume = AUDIO_VOLUMES.bgm;
            this.bgmSource.play();
            this.bgmStarted = true;
        });
    }

    private playSfx(key: AudioKey): void {
        this.loadAudio(key).then((clip) => {
            if (!clip || !this.audioSource?.isValid) {
                return;
            }
            this.audioSource.playOneShot(clip, AUDIO_VOLUMES[key]);
        });
    }

    private loadAudio(key: AudioKey): Promise<AudioClip | null> {
        const cached = this.audioCache.get(key);
        if (cached !== undefined) {
            return Promise.resolve(cached);
        }
        return new Promise((resolve) => {
            resources.load(AUDIO_PATHS[key], AudioClip, (err, clip) => {
                if (err || !clip) {
                    this.audioCache.set(key, null);
                    resolve(null);
                    return;
                }
                this.audioCache.set(key, clip);
                resolve(clip);
            });
        });
    }

    private loadSprite(path: string): Promise<SpriteFrame | null> {
        const cached = this.spriteCache.get(path);
        if (cached !== undefined) {
            return Promise.resolve(cached);
        }
        return new Promise((resolve) => {
            resources.load(`${path}/spriteFrame`, SpriteFrame, (err, frame) => {
                if (err || !frame) {
                    this.spriteCache.set(path, null);
                    resolve(null);
                    return;
                }
                this.spriteCache.set(path, frame);
                resolve(frame);
            });
        });
    }

    private getPieceConfig(kind: PieceKind): PieceConfig {
        return PIECES.find((piece) => piece.id === kind)!;
    }

    private makeSpriteNode(name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.setPosition(x, y, 0);
        this.setSize(node, width, height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        return node;
    }

    private makeRectNode(name: string, x: number, y: number, width: number, height: number, fill: Color, stroke: Color): Node {
        const node = new Node(name);
        node.setPosition(x, y, 0);
        this.setSize(node, width, height);
        node.addComponent(Graphics);
        this.paintRect(node, width, height, fill, stroke);
        return node;
    }

    private paintRect(node: Node, width: number, height: number, fill: Color, stroke: Color, lineWidth = 2): void {
        const g = node.getComponent(Graphics)!;
        g.clear();
        g.fillColor = fill;
        g.strokeColor = stroke;
        g.lineWidth = lineWidth;
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();
        g.stroke();
    }

    private addLabel(parent: Node, text: string, size: number, x: number, y: number, color: Color, width: number, height: number): Label {
        const node = new Node(`Label_${text}`);
        node.setPosition(x, y, 0);
        this.setSize(node, width, height);
        parent.addChild(node);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 4;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private setSize(node: Node, width: number, height: number): void {
        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(width, height);
        transform.setAnchorPoint(0.5, 0.5);
    }

    private fitNodeToFrame(node: Node, frame: SpriteFrame, maxSide: number): void {
        const rect = frame.rect;
        const width = rect.width || maxSide;
        const height = rect.height || maxSide;
        const scale = maxSide / Math.max(width, height);
        this.setSize(node, width * scale, height * scale);
    }

    private fitConveyorNode(node: Node, x: number): void {
        const height = this.getConveyorRenderHeight();
        this.setSize(node, DESIGN_WIDTH, height);
        node.setPosition(x, this.getConveyorCenterY(), 0);
    }

    private getConveyorRenderHeight(): number {
        return CONVEYOR_SOURCE_HEIGHT * (DESIGN_WIDTH / CONVEYOR_SOURCE_WIDTH);
    }

    private getConveyorCenterY(): number {
        return -DESIGN_HEIGHT / 2 + this.getConveyorRenderHeight() / 2;
    }

    private hasCanvasInParents(node: Node): boolean {
        let current: Node | null = node;
        while (current) {
            if (current.getComponent(Canvas)) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    private lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
        return new Vec3(this.lerp(a.x, b.x, t), this.lerp(a.y, b.y, t), this.lerp(a.z, b.z, t));
    }

    private frameOrder(name: string): number {
        const match = name.match(/(\d+)(?!.*\d)/);
        return match ? Number(match[1]) : 0;
    }

    private pad(value: number): string {
        return value < 10 ? `0${value}` : String(value);
    }
}
