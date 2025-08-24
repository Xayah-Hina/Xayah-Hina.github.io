import type { SakuraConfig } from '../types/config';

// 性能优化常量
const VIEWPORT_PADDING = 100; // 视口边距，用于预渲染即将进入视口的樱花
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
const MAX_DELTA_TIME = 50; // 最大帧时间差，防止页面切换回来时的跳跃

// 樱花对象类 - 优化版
class Sakura {
	x: number;
	y: number;
	s: number;
	r: number;
	vx: number; // 水平速度
	vy: number; // 垂直速度
	vr: number; // 旋转速度
	idx: number;
	img: HTMLImageElement;
	limitArray: number[];
	config: SakuraConfig;
	active = true; // 是否激活状态
	lastUpdateTime = 0;

	constructor(
		x: number,
		y: number,
		s: number,
		r: number,
		vx: number,
		vy: number,
		vr: number,
		idx: number,
		img: HTMLImageElement,
		limitArray: number[],
		config: SakuraConfig
	) {
		this.x = x;
		this.y = y;
		this.s = s;
		this.r = r;
		this.vx = vx;
		this.vy = vy;
		this.vr = vr;
		this.idx = idx;
		this.img = img;
		this.limitArray = limitArray;
		this.config = config;
		this.lastUpdateTime = performance.now();
	}

	// 优化的绘制方法 - 减少Canvas状态切换
	draw(cxt: CanvasRenderingContext2D) {
		if (!this.active) return;
		
		// 视口裁剪 - 只绘制可见区域内的樱花
		const size = 40 * this.s;
		if (this.x + size < -VIEWPORT_PADDING || 
			this.x - size > window.innerWidth + VIEWPORT_PADDING ||
			this.y + size < -VIEWPORT_PADDING || 
			this.y - size > window.innerHeight + VIEWPORT_PADDING) {
			return;
		}

		cxt.save();
		cxt.translate(this.x, this.y);
		cxt.rotate(this.r);
		cxt.drawImage(this.img, -size/2, -size/2, size, size);
		cxt.restore();
	}

	// 优化的更新方法 - 使用时间差进行平滑动画
	update(currentTime: number, deltaTime: number) {
		if (!this.active) return;
		
		// 限制最大时间差，防止页面切换回来时的跳跃
		const clampedDelta = Math.min(deltaTime, MAX_DELTA_TIME);
		const timeScale = clampedDelta / FRAME_TIME;
		
		// 更新位置和旋转
		this.x += this.vx * timeScale;
		this.y += this.vy * timeScale;
		this.r += this.vr * timeScale;

		// 边界检测和重置
		const margin = 100;
		if (this.x > window.innerWidth + margin ||
			this.x < -margin ||
			this.y > window.innerHeight + margin) {
			
			if (this.limitArray[this.idx] === -1) {
				this.resetPosition();
			} else if (this.limitArray[this.idx] > 0) {
				this.resetPosition();
				this.limitArray[this.idx]--;
			} else {
				this.active = false; // 停用而不是删除，便于对象池复用
			}
		}
		
		this.lastUpdateTime = currentTime;
	}

	// 优化的重置位置方法
	resetPosition() {
		this.active = true;
		
		// 重新生成速度
		this.vx = this.config.speed.horizontal.min + 
			Math.random() * (this.config.speed.horizontal.max - this.config.speed.horizontal.min);
		this.vy = this.config.speed.vertical.min + 
			Math.random() * (this.config.speed.vertical.max - this.config.speed.vertical.min);
		this.vr = this.config.speed.rotation;
		
		// 60%概率从顶部进入，40%概率从右侧进入
		if (Math.random() > 0.4) {
			this.x = Math.random() * window.innerWidth;
			this.y = -100;
			this.s = this.config.size.min + Math.random() * (this.config.size.max - this.config.size.min);
			this.r = Math.random() * 6;
		} else {
			this.x = window.innerWidth + 100;
			this.y = Math.random() * window.innerHeight;
			this.s = this.config.size.min + Math.random() * (this.config.size.max - this.config.size.min);
			this.r = Math.random() * 6;
		}
	}
}

// 优化的樱花列表类 - 支持对象池和批量操作
class SakuraList {
	private list: Sakura[];
	private activeCount = 0;

	constructor() {
		this.list = [];
	}

	push(sakura: Sakura) {
		this.list.push(sakura);
		if (sakura.active) {
			this.activeCount++;
		}
	}

	// 批量更新 - 只更新激活的樱花
	update(currentTime: number, deltaTime: number) {
		let newActiveCount = 0;
		for (let i = 0, len = this.list.length; i < len; i++) {
			const sakura = this.list[i];
			if (sakura.active) {
				sakura.update(currentTime, deltaTime);
				if (sakura.active) {
					newActiveCount++;
				}
			}
		}
		this.activeCount = newActiveCount;
	}

	// 批量绘制 - 只绘制激活的樱花
	draw(cxt: CanvasRenderingContext2D) {
		for (let i = 0, len = this.list.length; i < len; i++) {
			const sakura = this.list[i];
			if (sakura.active) {
				sakura.draw(cxt);
			}
		}
	}

	get(i: number) {
		return this.list[i];
	}

	size() {
		return this.list.length;
	}
	
	getActiveCount() {
		return this.activeCount;
	}
	
	// 重新激活所有樱花
	reactivateAll() {
		for (let i = 0, len = this.list.length; i < len; i++) {
			if (!this.list[i].active) {
				this.list[i].resetPosition();
			}
		}
		this.activeCount = this.list.length;
	}
}

// 高性能樱花管理器类
export class SakuraManager {
	private config: SakuraConfig;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private sakuraList: SakuraList | null = null;
	private animationId: number | null = null;
	private img: HTMLImageElement | null = null;
	private isRunning = false;
	
	// 性能优化相关
	private lastFrameTime = 0;
	private frameCount = 0;
	private lastFpsTime = 0;
	private currentFps = 0;
	private isVisible = true;
	private resizeTimeout: number | null = null;

	constructor(config: SakuraConfig) {
		this.config = config;
		this.setupVisibilityHandlers();
	}

	// 设置页面可见性处理
	private setupVisibilityHandlers(): void {
		document.addEventListener('visibilitychange', () => {
			this.isVisible = !document.hidden;
			if (this.isVisible && this.isRunning) {
				// 页面重新可见时重置时间，避免跳跃
				this.lastFrameTime = performance.now();
			}
		});
	}

	// 高性能初始化樱花特效
	async init(): Promise<void> {
		if (!this.config.enable || this.isRunning) {
			return;
		}

		try {
			// 预加载图片
			await this.loadImage();
			
			// 创建优化的Canvas
			this.createOptimizedCanvas();
			
			// 创建樱花粒子系统
			this.createSakuraList();
			
			// 启动高性能动画循环
			this.startOptimizedAnimation();
			
			this.isRunning = true;
		} catch (error) {
			console.warn('Sakura effect initialization failed:', error);
		}
	}
	
	// 优化的图片加载
	private async loadImage(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.img = new Image();
			this.img.crossOrigin = 'anonymous'; // 避免跨域问题
			this.img.onload = () => resolve();
			this.img.onerror = () => reject(new Error('Failed to load sakura image'));
			this.img.src = '/sakura.png';
		});
	}

	// 创建优化的Canvas
	private createOptimizedCanvas(): void {
		this.canvas = document.createElement('canvas');
		
		// 设置Canvas尺寸和样式
		this.updateCanvasSize();
		this.canvas.style.cssText = `
			position: fixed;
			left: 0;
			top: 0;
			pointer-events: none;
			z-index: ${this.config.zIndex};
			will-change: transform;
		`;
		this.canvas.id = 'canvas_sakura';
		
		document.body.appendChild(this.canvas);
		this.ctx = this.canvas.getContext('2d', {
			alpha: true,
			desynchronized: true, // 提升性能
			willReadFrequently: false
		});

		// 优化Canvas渲染设置
		if (this.ctx) {
			this.ctx.imageSmoothingEnabled = true;
			this.ctx.imageSmoothingQuality = 'low'; // 降低质量提升性能
		}

		// 防抖的窗口大小变化处理
		window.addEventListener('resize', this.handleOptimizedResize.bind(this));
	}
	
	// 更新Canvas尺寸
	private updateCanvasSize(): void {
		if (!this.canvas) return;
		
		const dpr = Math.min(window.devicePixelRatio || 1, 2); // 限制DPR提升性能
		const width = window.innerWidth;
		const height = window.innerHeight;
		
		this.canvas.width = width * dpr;
		this.canvas.height = height * dpr;
		this.canvas.style.width = width + 'px';
		this.canvas.style.height = height + 'px';
		
		if (this.ctx) {
			this.ctx.scale(dpr, dpr);
		}
	}

	// 创建优化的樱花粒子系统
	private createSakuraList(): void {
		if (!this.img || !this.ctx) return;

		this.sakuraList = new SakuraList();
		const limitArray = new Array(this.config.sakuraNum).fill(this.config.limitTimes);

		// 批量创建樱花粒子
		for (let i = 0; i < this.config.sakuraNum; i++) {
			const sakura = this.createSakuraParticle(i, limitArray);
			this.sakuraList.push(sakura);
		}
	}
	
	// 创建单个樱花粒子
	private createSakuraParticle(index: number, limitArray: number[]): Sakura {
		const x = Math.random() * window.innerWidth;
		const y = Math.random() * window.innerHeight;
		const s = this.config.size.min + Math.random() * (this.config.size.max - this.config.size.min);
		const r = Math.random() * 6;
		const vx = this.config.speed.horizontal.min + 
			Math.random() * (this.config.speed.horizontal.max - this.config.speed.horizontal.min);
		const vy = this.config.speed.vertical.min + 
			Math.random() * (this.config.speed.vertical.max - this.config.speed.vertical.min);
		const vr = this.config.speed.rotation;

		return new Sakura(x, y, s, r, vx, vy, vr, index, this.img!, limitArray, this.config);
	}

	// 启动优化的动画循环
	private startOptimizedAnimation(): void {
		if (!this.ctx || !this.canvas || !this.sakuraList) return;

		this.lastFrameTime = performance.now();
		this.lastFpsTime = this.lastFrameTime;
		
		const animate = (currentTime: number) => {
			if (!this.ctx || !this.canvas || !this.sakuraList || !this.isRunning) return;

			// 页面不可见时暂停动画
			if (!this.isVisible) {
				this.animationId = requestAnimationFrame(animate);
				return;
			}
			
			// 计算时间差
			const deltaTime = currentTime - this.lastFrameTime;
			
			// 帧率控制 - 限制最高帧率
			if (deltaTime < FRAME_TIME) {
				this.animationId = requestAnimationFrame(animate);
				return;
			}
			
			// FPS计算
			this.frameCount++;
			if (currentTime - this.lastFpsTime >= 1000) {
				this.currentFps = this.frameCount;
				this.frameCount = 0;
				this.lastFpsTime = currentTime;
			}

			// 清除画布 - 使用优化的清除方法
			this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
			
			// 更新和绘制樱花
			this.sakuraList.update(currentTime, deltaTime);
			this.sakuraList.draw(this.ctx);
			
			this.lastFrameTime = currentTime;
			this.animationId = requestAnimationFrame(animate);
		};

		this.animationId = requestAnimationFrame(animate);
	}

	// 优化的窗口大小变化处理 - 防抖
	private handleOptimizedResize(): void {
		if (this.resizeTimeout) {
			clearTimeout(this.resizeTimeout);
		}
		
		this.resizeTimeout = window.setTimeout(() => {
			this.updateCanvasSize();
			
			// 重新激活所有樱花以适应新的屏幕尺寸
			if (this.sakuraList) {
				this.sakuraList.reactivateAll();
			}
		}, 150); // 150ms防抖
	}
	
	// 获取当前FPS（用于性能监控）
	getCurrentFps(): number {
		return this.currentFps;
	}

	// 优化的停止方法
	stop(): void {
		this.isRunning = false;
		
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		if (this.canvas && this.canvas.parentNode) {
			document.body.removeChild(this.canvas);
			this.canvas = null;
			this.ctx = null;
		}
		
		// 清理定时器
		if (this.resizeTimeout) {
			clearTimeout(this.resizeTimeout);
			this.resizeTimeout = null;
		}

		// 移除事件监听器
		window.removeEventListener('resize', this.handleOptimizedResize.bind(this));
		
		// 清理樱花列表
		this.sakuraList = null;
		this.img = null;
	}

	// 切换樱花特效
	toggle(): void {
		if (this.isRunning) {
			this.stop();
		} else {
			this.init();
		}
	}

	// 更新配置
	updateConfig(newConfig: SakuraConfig): void {
		const wasRunning = this.isRunning;
		if (wasRunning) {
			this.stop();
		}
		this.config = newConfig;
		if (wasRunning && newConfig.enable) {
			this.init();
		}
	}

	// 获取运行状态
	getIsRunning(): boolean {
		return this.isRunning;
	}
	
	// 获取性能统计信息
	getPerformanceStats(): { fps: number; activeParticles: number; totalParticles: number } {
		return {
			fps: this.currentFps,
			activeParticles: this.sakuraList?.getActiveCount() || 0,
			totalParticles: this.sakuraList?.size() || 0
		};
	}
}

// 创建全局樱花管理器实例
let globalSakuraManager: SakuraManager | null = null;

// 初始化樱花特效
export function initSakura(config: SakuraConfig): void {
	if (globalSakuraManager) {
		globalSakuraManager.updateConfig(config);
	} else {
		globalSakuraManager = new SakuraManager(config);
		if (config.enable) {
			globalSakuraManager.init();
		}
	}
}

// 切换樱花特效
export function toggleSakura(): void {
	if (globalSakuraManager) {
		globalSakuraManager.toggle();
	}
}

// 停止樱花特效
export function stopSakura(): void {
	if (globalSakuraManager) {
		globalSakuraManager.stop();
		globalSakuraManager = null;
	}
}

// 获取樱花特效运行状态
export function getSakuraStatus(): boolean {
	return globalSakuraManager ? globalSakuraManager.getIsRunning() : false;
}

// 获取性能统计信息
export function getSakuraPerformanceStats(): { fps: number; activeParticles: number; totalParticles: number } | null {
	return globalSakuraManager?.getPerformanceStats() || null;
}

// 更新樱花配置
export function updateSakuraConfig(config: SakuraConfig): void {
	if (globalSakuraManager) {
		globalSakuraManager.updateConfig(config);
	} else if (config.enable) {
		initSakura(config);
	}
}