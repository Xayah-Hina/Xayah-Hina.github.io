import type {
	CommentConfig,
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";
import { getTranslateLanguageFromConfig } from "./utils/language-utils";

// Define site language
const SITE_LANG = "en"; // Language code, e.g., 'en', 'zh_CN', 'ja', etc.

export const siteConfig: SiteConfig = {
	title: "Mizuki",
	subtitle: "One demo website",

	lang: SITE_LANG,

	themeColor: {
		hue: 210, // Default hue for theme color, range from 0 to 360. e.g., red: 0, cyan: 200, teal: 250, pink: 345
		fixed: false, // Hide theme color picker for visitors
	},
	translate: {
		enable: true, // Enable translation feature
		service: "client.edge", // Use Edge browser translation service
		defaultLanguage: getTranslateLanguageFromConfig(SITE_LANG), // Automatically set default translation language based on site language
		showSelectTag: false, // Don't show default language selection dropdown, use custom button
		autoDiscriminate: true, // Automatically detect user language
		ignoreClasses: ["ignore", "banner-title", "banner-subtitle"], // CSS class names to ignore for translation
		ignoreTags: ["script", "style", "code", "pre"], // HTML tags to ignore for translation
	},
	banner: {
		enable: true, // Temporarily disable banner to improve loading speed

		// Support single image or image array, carousel is automatically enabled when array length > 1
		src: {
			desktop: [
				"assets/desktop-banner/1.webp",
				"assets/desktop-banner/2.webp",
				"assets/desktop-banner/3.webp",
				"assets/desktop-banner/4.webp",
				"assets/desktop-banner/5.webp",
				"assets/desktop-banner/6.webp",
				"assets/desktop-banner/7.webp",
			], // Desktop banner images
			mobile: [
				"assets/mobile-banner/1.webp",
				"assets/mobile-banner/2.webp",
				"assets/mobile-banner/3.webp",
				"assets/mobile-banner/4.webp",
				"assets/mobile-banner/5.webp",
				"assets/mobile-banner/6.webp",
				"assets/mobile-banner/7.webp",
			], // Mobile banner images
		}, // Use local banner images

		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. Default is 'center'

		carousel: {
			enable: true, // When true: enable carousel for multiple images. When false: randomly display one image from the array

			interval: 1, // Carousel interval time (seconds)
		},

		homeText: {
			enable: true, // Display custom text on homepage
			title: "Mizuki", // Homepage banner main title

			subtitle: [
				"One demo website",
				"Carousel Text1",
				"Carousel Text2",
				"Carousel Text3",
			], // Homepage banner subtitle, supports multiple texts
			typewriter: {
				enable: true, // Enable subtitle typewriter effect

				speed: 100, // Typing speed (milliseconds)
				deleteSpeed: 50, // Delete speed (milliseconds)
				pauseTime: 2000, // Pause time after complete display (milliseconds)
			},
		},

		credit: {
			enable: false, // Display banner image source text

			text: "Describe", // Source text to display
			url: "", // (Optional) URL link to original artwork or artist page
		},
	},
	toc: {
		enable: true, // Enable table of contents feature
		depth: 3, // TOC depth, 1-6, 1 means only show h1 headings, 2 means show h1 and h2 headings, and so on
	},
	favicon: [
		// Leave empty to use default favicon
		// {
		//   src: '/favicon/icon.png',    // Icon file path
		//   theme: 'light',              // Optional, specify theme 'light' | 'dark'
		//   sizes: '32x32',              // Optional, icon size
		// }
	],
};




export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		LinkPreset.About,
		LinkPreset.Friends,
		LinkPreset.Anime,
		LinkPreset.Diary,
		{
			name: "GitHub",
			url: "https://github.com/matsuzaka-yuki", // Internal links should not include base path as it will be automatically added

			external: true, // Show external link icon and open in new tab
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "assets/images/avatar.jpg", // Relative to /src directory. If starts with '/', relative to /public directory
	name: "Mizuki",
	bio: "This is a description",
	links: [
		{
			name: "Bilibli",
			icon: "fa6-brands:bilibili",
			url: "https://space.bilibili.com/701864046",
		},
		{
			name: "Gitee",
			icon: "mdi:git",
			url: "https://gitee.com/matsuzakayuki",
		},
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/matsuzaka-yuki",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	// Note: Some styles (like background color) have been overridden, see astro.config.mjs file.
	// Please choose a dark theme as this blog theme currently only supports dark backgrounds
	theme: "github-dark",
};

export const commentConfig: CommentConfig = {
	enable: false, // Enable the comment function. When it is set to false, the comment component will not be displayed in the article area.
	twikoo: {
		envId: "https://app.twikoo.js.org",
	},
};
