import type {
	WidgetComponentConfig,
	WidgetComponentType,
	SidebarLayoutConfig,
} from "../types/config";
import { sidebarLayoutConfig } from "../config";

/**
 * 组件映射表 - 将组件类型映射到实际的组件路径
 */
export const WIDGET_COMPONENT_MAP = {
	profile: "../components/widget/Profile.astro",
	announcement: "../components/widget/Announcement.astro",
	categories: "../components/widget/Categories.astro",
	tags: "../components/widget/Tags.astro",
	toc: "../components/widget/TOC.astro",
	"music-player": "../components/widget/MusicPlayer.svelte",
	pio: "../components/widget/Pio.astro", // 添加 Pio 组件映射
	custom: null, // 自定义组件需要在配置中指定路径
} as const;

/**
 * 组件管理器类
 * 负责管理侧边栏组件的动态加载、排序和渲染
 */
export class WidgetManager {
	private config: SidebarLayoutConfig;
	private enabledComponents: WidgetComponentConfig[];

	constructor(config: SidebarLayoutConfig = sidebarLayoutConfig) {
		this.config = config;
		this.enabledComponents = this.getEnabledComponents();
	}

	/**
	 * 获取启用的组件列表
	 */
	private getEnabledComponents(): WidgetComponentConfig[] {
		return this.config.components
			.filter((component) => component.enable)
			.sort((a, b) => a.order - b.order);
	}

	/**
	 * 根据位置获取组件列表
	 * @param position 组件位置：'top' | 'sticky'
	 */
	getComponentsByPosition(position: "top" | "sticky"): WidgetComponentConfig[] {
		return this.enabledComponents.filter(
			(component) => component.position === position,
		);
	}

	/**
	 * 获取组件的动画延迟时间
	 * @param component 组件配置
	 * @param index 组件在列表中的索引
	 */
	getAnimationDelay(component: WidgetComponentConfig, index: number): number {
		if (component.animationDelay !== undefined) {
			return component.animationDelay;
		}

		if (this.config.defaultAnimation.enable) {
			return (
				this.config.defaultAnimation.baseDelay +
				index * this.config.defaultAnimation.increment
			);
		}

		return 0;
	}

	/**
	 * 获取组件的CSS类名
	 * @param component 组件配置
	 * @param index 组件在列表中的索引
	 */
	getComponentClass(component: WidgetComponentConfig, index: number): string {
		const classes: string[] = [];

		// 添加基础类名
		if (component.class) {
			classes.push(component.class);
		}

		// 添加响应式隐藏类名
		if (component.responsive?.hidden) {
			component.responsive.hidden.forEach((device) => {
				switch (device) {
					case "mobile":
						classes.push("hidden", "md:block");
						break;
					case "tablet":
						classes.push("md:hidden", "lg:block");
						break;
					case "desktop":
						classes.push("lg:hidden");
						break;
				}
			});
		}

		return classes.join(" ");
	}

	/**
	 * 获取组件的内联样式
	 * @param component 组件配置
	 * @param index 组件在列表中的索引
	 */
	getComponentStyle(component: WidgetComponentConfig, index: number): string {
		const styles: string[] = [];

		// 添加自定义样式
		if (component.style) {
			styles.push(component.style);
		}

		// 添加动画延迟样式
		const animationDelay = this.getAnimationDelay(component, index);
		if (animationDelay > 0) {
			styles.push(`animation-delay: ${animationDelay}ms`);
		}

		return styles.join("; ");
	}

	/**
	 * 检查组件是否应该折叠
	 * @param component 组件配置
	 * @param itemCount 组件内容项数量
	 */
	isCollapsed(component: WidgetComponentConfig, itemCount: number): boolean {
		if (!component.responsive?.collapseThreshold) {
			return false;
		}
		return itemCount >= component.responsive.collapseThreshold;
	}

	/**
	 * 获取组件的路径
	 * @param componentType 组件类型
	 */
	getComponentPath(componentType: WidgetComponentType): string | null {
		return WIDGET_COMPONENT_MAP[componentType];
	}

	/**
	 * 检查当前设备是否应该显示侧边栏
	 * @param deviceType 设备类型
	 */
	shouldShowSidebar(deviceType: "mobile" | "tablet" | "desktop"): boolean {
		if (!this.config.enable) {
			return false;
		}

		const layoutMode = this.config.responsive.layout[deviceType];
		return layoutMode === "sidebar";
	}

	/**
	 * 获取设备断点配置
	 */
	getBreakpoints() {
		return this.config.responsive.breakpoints;
	}

	/**
	 * 更新组件配置
	 * @param newConfig 新的配置
	 */
	updateConfig(newConfig: Partial<SidebarLayoutConfig>): void {
		this.config = { ...this.config, ...newConfig };
		this.enabledComponents = this.getEnabledComponents();
	}

	/**
	 * 添加新组件
	 * @param component 组件配置
	 */
	addComponent(component: WidgetComponentConfig): void {
		this.config.components.push(component);
		this.enabledComponents = this.getEnabledComponents();
	}

	/**
	 * 移除组件
	 * @param componentType 组件类型
	 */
	removeComponent(componentType: WidgetComponentType): void {
		this.config.components = this.config.components.filter(
			(component) => component.type !== componentType,
		);
		this.enabledComponents = this.getEnabledComponents();
	}

	/**
	 * 启用/禁用组件
	 * @param componentType 组件类型
	 * @param enable 是否启用
	 */
	toggleComponent(componentType: WidgetComponentType, enable: boolean): void {
		const component = this.config.components.find(
			(c) => c.type === componentType,
		);
		if (component) {
			component.enable = enable;
			this.enabledComponents = this.getEnabledComponents();
		}
	}

	/**
	 * 重新排序组件
	 * @param componentType 组件类型
	 * @param newOrder 新的排序值
	 */
	reorderComponent(componentType: WidgetComponentType, newOrder: number): void {
		const component = this.config.components.find(
			(c) => c.type === componentType,
		);
		if (component) {
			component.order = newOrder;
			this.enabledComponents = this.getEnabledComponents();
		}
	}

	/**
	 * 检查组件是否应该在侧边栏中渲染
	 * @param componentType 组件类型
	 */
	isSidebarComponent(componentType: WidgetComponentType): boolean {
		// Pio 组件是全局组件，不在侧边栏中渲染
		return componentType !== "pio";
	}
}

/**
 * 默认组件管理器实例
 */
export const widgetManager = new WidgetManager();

/**
 * 工具函数：根据组件类型获取组件配置
 * @param componentType 组件类型
 */
export function getComponentConfig(
	componentType: WidgetComponentType,
): WidgetComponentConfig | undefined {
	return widgetManager.config.components.find((c) => c.type === componentType);
}

/**
 * 工具函数：检查组件是否启用
 * @param componentType 组件类型
 */
export function isComponentEnabled(
	componentType: WidgetComponentType,
): boolean {
	const config = getComponentConfig(componentType);
	return config?.enable ?? false;
}

/**
 * 工具函数：获取所有启用的组件类型
 */
export function getEnabledComponentTypes(): WidgetComponentType[] {
	return widgetManager.enabledComponents.map((c) => c.type);
}
