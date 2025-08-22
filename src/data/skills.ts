// 技能数据配置文件
// 用于管理技能展示页面的数据

export interface Skill {
	id: string;
	name: string;
	description: string;
	icon: string; // Iconify icon name
	category: 'frontend' | 'backend' | 'database' | 'tools' | 'other';
	level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
	experience: {
		years: number;
		months: number;
	};
	projects?: string[]; // 相关项目ID
	certifications?: string[];
	color?: string; // 技能卡片主题色
}

export const skillsData: Skill[] = [
	// Frontend Skills
	{
		id: 'javascript',
		name: 'JavaScript',
		description: '现代JavaScript开发，包括ES6+语法、异步编程、模块化开发等。',
		icon: 'logos:javascript',
		category: 'frontend',
		level: 'advanced',
		experience: { years: 3, months: 6 },
		projects: ['mizuki-blog', 'portfolio-website', 'data-visualization-tool'],
		color: '#F7DF1E'
	},
	{
		id: 'typescript',
		name: 'TypeScript',
		description: '类型安全的JavaScript超集，提升代码质量和开发效率。',
		icon: 'logos:typescript-icon',
		category: 'frontend',
		level: 'advanced',
		experience: { years: 2, months: 8 },
		projects: ['mizuki-blog', 'portfolio-website', 'task-manager-app'],
		color: '#3178C6'
	},
	{
		id: 'react',
		name: 'React',
		description: '构建用户界面的JavaScript库，包括Hooks、Context、状态管理等。',
		icon: 'logos:react',
		category: 'frontend',
		level: 'advanced',
		experience: { years: 2, months: 10 },
		projects: ['portfolio-website', 'task-manager-app'],
		color: '#61DAFB'
	},
	{
		id: 'vue',
		name: 'Vue.js',
		description: '渐进式JavaScript框架，易学易用，适合快速开发。',
		icon: 'logos:vue',
		category: 'frontend',
		level: 'intermediate',
		experience: { years: 1, months: 8 },
		projects: ['data-visualization-tool'],
		color: '#4FC08D'
	},
	{
		id: 'astro',
		name: 'Astro',
		description: '现代静态站点生成器，支持多框架集成和优秀的性能。',
		icon: 'logos:astro-icon',
		category: 'frontend',
		level: 'advanced',
		experience: { years: 1, months: 2 },
		projects: ['mizuki-blog'],
		color: '#FF5D01'
	},
	{
		id: 'tailwindcss',
		name: 'Tailwind CSS',
		description: '实用优先的CSS框架，快速构建现代化用户界面。',
		icon: 'logos:tailwindcss-icon',
		category: 'frontend',
		level: 'advanced',
		experience: { years: 2, months: 0 },
		projects: ['mizuki-blog', 'portfolio-website'],
		color: '#06B6D4'
	},

	// Backend Skills
	{
		id: 'nodejs',
		name: 'Node.js',
		description: '基于Chrome V8引擎的JavaScript运行时，用于服务端开发。',
		icon: 'logos:nodejs-icon',
		category: 'backend',
		level: 'intermediate',
		experience: { years: 2, months: 3 },
		projects: ['data-visualization-tool', 'e-commerce-platform'],
		color: '#339933'
	},
	{
		id: 'python',
		name: 'Python',
		description: '通用编程语言，适用于Web开发、数据分析、机器学习等。',
		icon: 'logos:python',
		category: 'backend',
		level: 'intermediate',
		experience: { years: 1, months: 10 },
		color: '#3776AB'
	},
	{
		id: 'express',
		name: 'Express.js',
		description: '快速、极简的Node.js Web应用框架。',
		icon: 'simple-icons:express',
		category: 'backend',
		level: 'intermediate',
		experience: { years: 1, months: 8 },
		projects: ['data-visualization-tool'],
		color: '#000000'
	},

	// Database Skills
	{
		id: 'postgresql',
		name: 'PostgreSQL',
		description: '强大的开源关系型数据库管理系统。',
		icon: 'logos:postgresql',
		category: 'database',
		level: 'intermediate',
		experience: { years: 1, months: 5 },
		projects: ['e-commerce-platform'],
		color: '#336791'
	},
	{
		id: 'mongodb',
		name: 'MongoDB',
		description: '面向文档的NoSQL数据库，灵活的数据模型。',
		icon: 'logos:mongodb-icon',
		category: 'database',
		level: 'intermediate',
		experience: { years: 1, months: 2 },
		color: '#47A248'
	},
	{
		id: 'firebase',
		name: 'Firebase',
		description: 'Google的移动和Web应用开发平台，提供实时数据库和认证服务。',
		icon: 'simple-icons:firebase',
		category: 'database',
		level: 'intermediate',
		experience: { years: 0, months: 10 },
		projects: ['task-manager-app'],
		color: '#FFCA28'
	},

	// Tools
	{
		id: 'git',
		name: 'Git',
		description: '分布式版本控制系统，代码管理和团队协作必备工具。',
		icon: 'logos:git-icon',
		category: 'tools',
		level: 'advanced',
		experience: { years: 3, months: 0 },
		color: '#F05032'
	},
	{
		id: 'vscode',
		name: 'VS Code',
		description: '轻量级但功能强大的代码编辑器，丰富的插件生态。',
		icon: 'logos:visual-studio-code',
		category: 'tools',
		level: 'expert',
		experience: { years: 3, months: 6 },
		color: '#007ACC'
	},
	{
		id: 'docker',
		name: 'Docker',
		description: '容器化平台，简化应用部署和环境管理。',
		icon: 'logos:docker-icon',
		category: 'tools',
		level: 'intermediate',
		experience: { years: 1, months: 0 },
		color: '#2496ED'
	},
	{
		id: 'figma',
		name: 'Figma',
		description: '协作式界面设计工具，用于UI/UX设计和原型制作。',
		icon: 'logos:figma',
		category: 'tools',
		level: 'intermediate',
		experience: { years: 1, months: 6 },
		color: '#F24E1E'
	}
];

// 获取技能统计信息
export const getSkillStats = () => {
	const total = skillsData.length;
	const byLevel = {
		beginner: skillsData.filter(s => s.level === 'beginner').length,
		intermediate: skillsData.filter(s => s.level === 'intermediate').length,
		advanced: skillsData.filter(s => s.level === 'advanced').length,
		expert: skillsData.filter(s => s.level === 'expert').length
	};
	const byCategory = {
		frontend: skillsData.filter(s => s.category === 'frontend').length,
		backend: skillsData.filter(s => s.category === 'backend').length,
		database: skillsData.filter(s => s.category === 'database').length,
		tools: skillsData.filter(s => s.category === 'tools').length,
		other: skillsData.filter(s => s.category === 'other').length
	};

	return { total, byLevel, byCategory };
};

// 按分类获取技能
export const getSkillsByCategory = (category?: string) => {
	if (!category || category === 'all') {
		return skillsData;
	}
	return skillsData.filter(s => s.category === category);
};

// 获取高级技能
export const getAdvancedSkills = () => {
	return skillsData.filter(s => s.level === 'advanced' || s.level === 'expert');
};

// 计算总经验年数
export const getTotalExperience = () => {
	const totalMonths = skillsData.reduce((total, skill) => {
		return total + (skill.experience.years * 12) + skill.experience.months;
	}, 0);
	return {
		years: Math.floor(totalMonths / 12),
		months: totalMonths % 12
	};
};