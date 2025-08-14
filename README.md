# 🌸 Mizuki  
![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen) 
![pnpm >= 9](https://img.shields.io/badge/pnpm-%3E%3D9-blue) 
![Astro](https://img.shields.io/badge/Astro-5.12.8-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Mizuki Preview](./README.webp)

A modern, feature-rich static blog template built with [Astro](https://astro.build), enhanced with advanced functionality and beautiful design.

[**🖥️ Live Demo**](https://blog.mysqil.com/)

🌏 README Languages
[**中文**](./README.zh-CN.md) /
[**English**](./README.md) /
[**日本語**](./docs/README.ja.md) /
[**한국어**](./docs/README.ko.md) /
[**Français**](./docs/README.fr.md) /
[**Deutsch**](./docs/README.de.md) /
[**Español**](./docs/README.es.md) /
[**Русский**](./docs/README.ru.md)

## 🆕 What's New in v2.7

### 🎠 Carousel Optimization
- **Enhanced Banner Carousel:** Improved carousel logic for better performance and smoother transitions
- **Mobile-Desktop Sync:** Unified carousel behavior across all devices while maintaining separate image paths
- **Bug Fixes:** Resolved issues with carousel stopping after cycling through all images

### 📱 Mobile Table of Contents
- **Mobile TOC Component:** Added dedicated table of contents functionality for mobile devices
- **Improved Navigation:** Better content navigation experience on smaller screens
- **Responsive Design:** Seamless integration with existing responsive layout

### ✨ Animation Enhancements
- **Smooth Transitions:** Optimized page transitions and component animations
- **Performance Improvements:** Reduced animation overhead for better user experience
- **Visual Polish:** Enhanced visual feedback and interaction animations

---

## ✨ Features

### 🎨 Design & UI
- [x] Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com)
- [x] Smooth animations and page transitions with [Swup](https://swup.js.org/)
- [x] Light / dark mode with system preference detection
- [x] Customizable theme colors & dynamic banner carousel
- [x] Fully responsive design for all devices
- [x] Beautiful typography with JetBrains Mono font

### 🔍 Content & Search
- [x] Advanced search functionality with [Pagefind](https://pagefind.app/)
- [x] [Enhanced Markdown features](#-markdown-extended-syntax) with syntax highlighting
- [x] Interactive table of contents with auto-scroll
- [x] RSS feed generation
- [x] Reading time estimation
- [x] Post categorization and tagging

### 🌐 Internationalization
- [x] **Multi-language support** with real-time translation
- [x] **Auto language detection** based on user preferences
- [x] **Client-side translation** powered by Edge Translate
- [x] Support for 10+ languages (EN, ZH-CN, ZH-TW, JA, KO, ES, TH, VI, ID, TR)

### 📱 Special Pages
- [x] **Anime Tracking Page** - Track your anime watching progress with ratings
- [x] **Friends Links Page** - Showcase your friend's websites with beautiful cards
- [x] **Diary/Moments Page** - Share life moments like social media posts
- [x] **Archive Page** - Organized post timeline view
- [x] **About Page** - Customizable personal introduction

### 🛠 Technical Features
- [x] **Enhanced Code Blocks** with [Expressive Code](https://expressive-code.com/)
- [x] **Math Support** with KaTeX rendering
- [x] **Image Optimization** with PhotoSwipe gallery
- [x] **SEO Optimized** with sitemap and meta tags
- [x] **Performance Optimized** with lazy loading and caching
- [x] **Comment System** integration ready (Twikoo)

## 🚀 Getting Started

### 📦 Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/matsuzaka-yuki/mizuki.git
   cd mizuki
   ```

2. **Install dependencies:**
   ```bash
   # Install pnpm if you haven't
   npm install -g pnpm
   
   # Install project dependencies
   pnpm install
   ```

3. **Configure your blog:**
   - Edit `src/config.ts` to customize your blog settings
   - Update site information, theme colors, banner images, and social links
   - Configure translation settings and special page features

4. **Start development server:**
   ```bash
   pnpm dev
   ```
   Your blog will be available at `http://localhost:4321`

### 📝 Content Management

- **Create a new post:** `pnpm new-post <filename>`
- **Edit posts:** Modify files in `src/content/posts/`
- **Customize pages:** Edit special pages in `src/content/spec/`
- **Add images:** Place images in `src/assets/` or `public/`

### 🚀 Deployment

Deploy your blog to any static hosting platform:

- **Vercel:** Connect your GitHub repository to Vercel
- **Netlify:** Deploy directly from GitHub
- **GitHub Pages:** Use the included GitHub Actions workflow
- **Cloudflare Pages:** Connect your repository

Before deployment, update the `site` URL in `astro.config.mjs`.

## 📝 Post Frontmatter

```yaml
---
title: My First Blog Post
published: 2023-09-09
description: This is the first post of my new Astro blog.
image: ./cover.jpg
tags: [Foo, Bar]
category: Front-end
draft: false
pinned: false
---
```

### Frontmatter Fields

- **title**: Post title (required)
- **published**: Publication date (required)
- **description**: Post description for SEO and previews
- **image**: Cover image path (relative to post file)
- **tags**: Array of tags for categorization
- **category**: Post category
- **draft**: Set to `true` to hide post in production
- **pinned**: Set to `true` to pin post to top of the list

### Pinned Posts

The `pinned` field allows you to pin important posts to the top of your blog. Pinned posts will always appear before regular posts, regardless of their publication date.

**Usage:**
```yaml
pinned: true  # Pin this post to the top
pinned: false # Regular post (default)
```

**Sorting behavior:**
1. Pinned posts appear first, sorted by publication date (newest first)
2. Regular posts follow, sorted by publication date (newest first)
lang: jp      # Set only if the post's language differs from the site's language in `config.ts`
---
```

## 🧩 Markdown Extended Syntax

Mizuki supports enhanced Markdown features beyond standard GitHub Flavored Markdown:

### 📝 Enhanced Writing
- **Admonitions:** Create beautiful callout boxes with `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, etc.
- **Math Equations:** Write LaTeX math with `$inline$` and `$$block$$` syntax
- **Code Highlighting:** Advanced syntax highlighting with line numbers and copy buttons
- **GitHub Cards:** Embed repository cards with `::github{repo="user/repo"}`

### 🎨 Visual Elements
- **Image Galleries:** Automatic PhotoSwipe integration for image viewing
- **Collapsible Sections:** Create expandable content blocks
- **Custom Components:** Use special directives for enhanced content

### 📊 Content Organization
- **Table of Contents:** Auto-generated from headings with smooth scrolling
- **Reading Time:** Automatic calculation and display
- **Post Metadata:** Rich frontmatter support with categories and tags

## ⚡ Commands

All commands are run from the root of the project:

| Command                    | Action                                              |
|:---------------------------|:----------------------------------------------------|
| `pnpm install`             | Install dependencies                                |
| `pnpm dev`                 | Start local dev server at `localhost:4321`         |
| `pnpm build`               | Build production site to `./dist/`                 |
| `pnpm preview`             | Preview build locally before deploying             |
| `pnpm check`               | Run Astro checks for errors                        |
| `pnpm format`              | Format code using Biome                            |
| `pnpm lint`                | Lint and fix code issues                           |
| `pnpm new-post <filename>` | Create a new blog post                             |
| `pnpm astro ...`           | Run Astro CLI commands                             |

## 🎯 Configuration Guide

### 🔧 Basic Configuration

Edit `src/config.ts` to customize your blog:

```typescript
export const siteConfig: SiteConfig = {
  title: "Your Blog Name",
  subtitle: "Your Blog Description",
  lang: "en", // or "zh-CN", "ja", etc.
  themeColor: {
    hue: 210, // 0-360, theme color hue
    fixed: false, // hide theme color picker
  },
  translate: {
    enable: true, // enable translation feature
    service: "client.edge", // translation service
    defaultLanguage: "chinese_simplified",
  },
  banner: {
    enable: true,
    src: ["assets/banner/1.webp"], // banner images
    carousel: {
      enable: true,
      interval: 0.8, // seconds
    },
  },
};
```

### 📱 Special Pages Configuration

- **Anime Page:** Edit anime list in `src/pages/anime.astro`
- **Friends Page:** Edit friends data in `src/content/spec/friends.md`
- **Diary Page:** Edit moments in `src/pages/diary.astro`
- **About Page:** Edit content in `src/content/spec/about.md`

## ✏️ Contributing

We welcome contributions! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Based on the original [Fuwari](https://github.com/saicaca/fuwari) template
- Built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com)
- Inspired by [Yukina](https://github.com/WhitePaper233/yukina) - A beautiful and elegant blog template
- Translation powered by [translate](https://gitee.com/mail_osc/translate) - AI i18n solution for automatic HTML translation
- Icons from [Iconify](https://iconify.design/)

### Special Thanks

- **[Yukina](https://github.com/WhitePaper233/yukina)** - For providing inspiration and design ideas that helped shape this project. Yukina is an elegant blog template that demonstrates excellent design principles and user experience.
- **[translate](https://gitee.com/mail_osc/translate)** - For providing an innovative AI-powered i18n solution that enables automatic HTML translation with just two lines of JavaScript. This open-source tool makes multi-language support incredibly simple and efficient.

---

⭐ If you find this project helpful, please consider giving it a star!
