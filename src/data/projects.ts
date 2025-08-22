// 项目数据配置文件
// 用于管理项目展示页面的数据

export interface Project {
	id: string;
	title: string;
	description: string;
	image: string;
	category: 'web' | 'mobile' | 'desktop' | 'other';
	techStack: string[];
	status: 'completed' | 'in-progress' | 'planned';
	liveDemo?: string;
	sourceCode?: string;
	startDate: string;
	endDate?: string;
	featured?: boolean;
	tags?: string[];
}

export const projectsData: Project[] = [
	{
		id: 'mizuki-blog',
		title: 'Mizuki Blog Theme',
		description: '基于Astro框架开发的现代化博客主题，支持多语言、暗黑模式、响应式设计等功能。',
		image: '',
		category: 'web',
		techStack: ['Astro', 'TypeScript', 'Tailwind CSS', 'Svelte'],
		status: 'completed',
		liveDemo: 'https://blog.example.com',
		sourceCode: 'https://github.com/example/mizuki',
		startDate: '2024-01-01',
		endDate: '2024-06-01',
		featured: true,
		tags: ['Blog', 'Theme', 'Open Source']
	},
	{
		id: 'portfolio-website',
		title: 'Personal Portfolio',
		description: '个人作品集网站，展示项目经验和技术技能。',
		image: '',
		category: 'web',
		techStack: ['React', 'Next.js', 'TypeScript', 'Framer Motion'],
		status: 'completed',
		liveDemo: 'https://portfolio.example.com',
		sourceCode: 'https://github.com/example/portfolio',
		startDate: '2023-09-01',
		endDate: '2023-12-01',
		featured: true,
		tags: ['Portfolio', 'React', 'Animation']
	},
	{
		id: 'task-manager-app',
		title: 'Task Manager App',
		description: '跨平台任务管理应用，支持团队协作和项目管理。',
		image: '',
		category: 'mobile',
		techStack: ['React Native', 'TypeScript', 'Redux', 'Firebase'],
		status: 'in-progress',
		startDate: '2024-03-01',
		tags: ['Mobile', 'Productivity', 'Team Collaboration']
	},
	{
		id: 'data-visualization-tool',
		title: 'Data Visualization Tool',
		description: '数据可视化工具，支持多种图表类型和交互式分析。',
		image: '',
		category: 'web',
		techStack: ['Vue.js', 'D3.js', 'TypeScript', 'Node.js'],
		status: 'completed',
		liveDemo: 'https://dataviz.example.com',
		startDate: '2023-06-01',
		endDate: '2023-11-01',
		tags: ['Data Visualization', 'Analytics', 'Charts']
	},
	{
		id: 'e-commerce-platform',
		title: 'E-commerce Platform',
		description: '全栈电商平台，包含用户管理、商品管理、订单处理等功能。',
		image: '',
		category: 'web',
		techStack: ['Next.js', 'Node.js', 'PostgreSQL', 'Stripe'],
		status: 'planned',
		startDate: '2024-07-01',
		tags: ['E-commerce', 'Full Stack', 'Payment Integration']
	}
];

// 获取项目统计信息
export const getProjectStats = () => {
	const total = projectsData.length;
	const completed = projectsData.filter(p => p.status === 'completed').length;
	const inProgress = projectsData.filter(p => p.status === 'in-progress').length;
	const planned = projectsData.filter(p => p.status === 'planned').length;

	return {
		total,
		byStatus: {
			completed,
			inProgress,
			planned
		}
	};
};

// 按分类获取项目
export const getProjectsByCategory = (category?: string) => {
	if (!category || category === 'all') {
		return projectsData;
	}
	return projectsData.filter(p => p.category === category);
};

// 获取特色项目
export const getFeaturedProjects = () => {
	return projectsData.filter(p => p.featured);
};

// 获取所有技术栈
export const getAllTechStack = () => {
	const techSet = new Set<string>();
	projectsData.forEach(project => {
		project.techStack.forEach(tech => techSet.add(tech));
	});
	return Array.from(techSet).sort();
};