# 🌸 Mizuki  
![Node.js >= 20](https://img.shields.io/badge/node.js-%3E%3D20-brightgreen) 
![pnpm >= 9](https://img.shields.io/badge/pnpm-%3E%3D9-blue) 
![Astro](https://img.shields.io/badge/Astro-5.12.8-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Mizuki 预览](./README.webp)

一个现代化、功能丰富的静态博客模板，基于 [Astro](https://astro.build) 构建，具有先进的功能和精美的设计。

[**🖥️ 在线演示**](https://blog.mysqil.com/)

🌏 README 语言
[**中文**](./README.zh-CN.md) /
[**English**](./README.md) /
[**日本語**](./docs/README.ja.md) /
[**한국어**](./docs/README.ko.md) /
[**Français**](./docs/README.fr.md) /
[**Deutsch**](./docs/README.de.md) /
[**Español**](./docs/README.es.md) /
[**Русский**](./docs/README.ru.md)

## 🆕 v2.7 版本更新

### 🎠 轮播图优化
- **增强横幅轮播：** 改进轮播逻辑，提升性能和过渡效果的流畅度
- **移动端-桌面端同步：** 统一所有设备的轮播行为，同时保持独立的图片路径
- **错误修复：** 解决轮播图循环完所有图片后停止的问题

### 📱 移动端文章目录
- **移动端目录组件：** 为移动设备添加专用的文章目录功能
- **改进导航体验：** 在小屏幕设备上提供更好的内容导航体验
- **响应式设计：** 与现有响应式布局无缝集成

### ✨ 动画优化
- **流畅过渡：** 优化页面过渡和组件动画效果
- **性能提升：** 减少动画开销，提供更好的用户体验
- **视觉优化：** 增强视觉反馈和交互动画效果

---

## ✨ 功能特性

### 🎨 设计与界面
- [x] 基于 [Astro](https://astro.build) 和 [Tailwind CSS](https://tailwindcss.com) 构建
- [x] 使用 [Swup](https://swup.js.org/) 实现流畅的动画和页面过渡
- [x] 明暗主题切换，支持系统偏好检测
- [x] 可自定义主题色彩和动态横幅轮播
- [x] 全设备响应式设计
- [x] 使用 JetBrains Mono 字体的优美排版

### 🔍 内容与搜索
- [x] 基于 [Pagefind](https://pagefind.app/) 的高级搜索功能
- [x] [增强的 Markdown 功能](#-markdown-扩展语法)，支持语法高亮
- [x] 交互式目录，支持自动滚动
- [x] RSS 订阅生成
- [x] 阅读时间估算
- [x] 文章分类和标签系统

### 🌐 国际化支持
- [x] **多语言支持**，实时翻译功能
- [x] **自动语言检测**，基于用户偏好
- [x] **客户端翻译**，由 Edge Translate 驱动
- [x] 支持 10+ 种语言（中文、英文、日文、韩文、西班牙文等）

### 📱 特色页面
- [x] **追番页面** - 追踪动画观看进度和评分
- [x] **友链页面** - 精美卡片展示朋友网站
- [x] **日记页面** - 分享生活瞬间，类似社交媒体
- [x] **归档页面** - 有序的文章时间线视图
- [x] **关于页面** - 可自定义的个人介绍

### 🛠 技术特性
- [x] **增强代码块**，基于 [Expressive Code](https://expressive-code.com/)
- [x] **数学公式支持**，KaTeX 渲染
- [x] **图片优化**，PhotoSwipe 画廊集成
- [x] **SEO 优化**，包含站点地图和元标签
- [x] **性能优化**，懒加载和缓存机制
- [x] **评论系统**，支持 Twikoo 集成

## 🚀 快速开始

### 📦 安装

1. **克隆仓库：**
   ```bash
   git clone https://github.com/matsuzaka-yuki/mizuki.git
   cd mizuki
   ```

2. **安装依赖：**
   ```bash
   # 如果没有安装 pnpm，先安装
   npm install -g pnpm
   
   # 安装项目依赖
   pnpm install
   ```

3. **配置博客：**
   - 编辑 `src/config.ts` 自定义博客设置
   - 更新站点信息、主题色彩、横幅图片和社交链接
   - 配置翻译设置和特色页面功能

4. **启动开发服务器：**
   ```bash
   pnpm dev
   ```
   博客将在 `http://localhost:4321` 可用

### 📝 内容管理

- **创建新文章：** `pnpm new-post <文件名>`
- **编辑文章：** 修改 `src/content/posts/` 中的文件
- **自定义页面：** 编辑 `src/content/spec/` 中的特殊页面
- **添加图片：** 将图片放在 `src/assets/` 或 `public/` 中

### 🚀 部署

将博客部署到任何静态托管平台：

- **Vercel：** 连接 GitHub 仓库到 Vercel
- **Netlify：** 直接从 GitHub 部署
- **GitHub Pages：** 使用包含的 GitHub Actions 工作流
- **Cloudflare Pages：** 连接您的仓库

部署前，请在 `astro.config.mjs` 中更新 `site` URL。

## 📝 文章前言格式

```yaml
---
title: 我的第一篇博客文章
published: 2023-09-09
description: 这是我新博客的第一篇文章。
image: ./cover.jpg
tags: [标签1, 标签2]
category: 前端
draft: false
pinned: false
lang: zh-CN      # 仅当文章语言与 config.ts 中的站点语言不同时设置
---
```

### Frontmatter 字段说明

- **title**: 文章标题（必需）
- **published**: 发布日期（必需）
- **description**: 文章描述，用于 SEO 和预览
- **image**: 封面图片路径（相对于文章文件）
- **tags**: 标签数组，用于分类
- **category**: 文章分类
- **draft**: 设置为 `true` 在生产环境中隐藏文章
- **pinned**: 设置为 `true` 将文章置顶
- **lang**: 文章语言（仅当与站点默认语言不同时设置）

### 置顶文章功能

`pinned` 字段允许您将重要文章置顶到博客列表的顶部。置顶文章将始终显示在普通文章之前，无论其发布日期如何。

**使用方法：**
```yaml
pinned: true  # 将此文章置顶
pinned: false # 普通文章（默认）
```

**排序规则：**
1. 置顶文章优先显示，按发布日期排序（最新在前）
2. 普通文章随后显示，按发布日期排序（最新在前）

## 🧩 Markdown 扩展语法

Mizuki 支持超越标准 GitHub Flavored Markdown 的增强功能：

### 📝 增强写作
- **提示框：** 使用 `> [!NOTE]`、`> [!TIP]`、`> [!WARNING]` 等创建精美的标注框
- **数学公式：** 使用 `$行内$` 和 `$$块级$$` 语法编写 LaTeX 数学公式
- **代码高亮：** 高级语法高亮，支持行号和复制按钮
- **GitHub 卡片：** 使用 `::github{repo="用户/仓库"}` 嵌入仓库卡片

### 🎨 视觉元素
- **图片画廊：** 自动 PhotoSwipe 集成，支持图片查看
- **可折叠部分：** 创建可展开的内容块
- **自定义组件：** 使用特殊指令增强内容

### 📊 内容组织
- **目录：** 从标题自动生成，支持平滑滚动
- **阅读时间：** 自动计算和显示
- **文章元数据：** 丰富的前言支持，包含分类和标签

## ⚡ 命令

所有命令都在项目根目录运行：

| 命令                       | 操作                                    |
|:---------------------------|:---------------------------------------|
| `pnpm install`             | 安装依赖                               |
| `pnpm dev`                 | 在 `localhost:4321` 启动本地开发服务器 |
| `pnpm build`               | 构建生产站点到 `./dist/`               |
| `pnpm preview`             | 在部署前本地预览构建                   |
| `pnpm check`               | 运行 Astro 错误检查                    |
| `pnpm format`              | 使用 Biome 格式化代码                  |
| `pnpm lint`                | 检查并修复代码问题                     |
| `pnpm new-post <文件名>`   | 创建新博客文章                         |
| `pnpm astro ...`           | 运行 Astro CLI 命令                    |

## 🎯 配置指南

### 🔧 基础配置

编辑 `src/config.ts` 自定义您的博客：

```typescript
export const siteConfig: SiteConfig = {
  title: "您的博客名称",
  subtitle: "您的博客描述",
  lang: "zh-CN", // 或 "en"、"ja" 等
  themeColor: {
    hue: 210, // 0-360，主题色调
    fixed: false, // 隐藏主题色选择器
  },
  translate: {
    enable: true, // 启用翻译功能
    service: "client.edge", // 翻译服务
    defaultLanguage: "chinese_simplified",
  },
  banner: {
    enable: true,
    src: ["assets/banner/1.webp"], // 横幅图片
    carousel: {
      enable: true,
      interval: 0.8, // 秒
    },
  },
};
```

### 📱 特色页面配置

- **追番页面：** 在 `src/pages/anime.astro` 中编辑动画列表
- **友链页面：** 在 `src/content/spec/friends.md` 中编辑朋友数据
- **日记页面：** 在 `src/pages/diary.astro` 中编辑动态
- **关于页面：** 在 `src/content/spec/about.md` 中编辑内容

## ✏️ 贡献

我们欢迎贡献！请随时提交问题和拉取请求。

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开拉取请求

## 📄 许可证

本项目基于 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 基于原始 [Fuwari](https://github.com/saicaca/fuwari) 模板
- 使用 [Astro](https://astro.build) 和 [Tailwind CSS](https://tailwindcss.com) 构建
- 灵感来源于 [Yukina](https://github.com/WhitePaper233/yukina) - 一个美丽优雅的博客模板
- 翻译功能由 [translate](https://gitee.com/mail_osc/translate) 提供支持 - AI i18n 自动HTML翻译解决方案
- 图标来自 [Iconify](https://iconify.design/)

### 特别感谢

- **[Yukina](https://github.com/WhitePaper233/yukina)** - 感谢提供设计灵感和创意，帮助塑造了这个项目。Yukina 是一个优雅的博客模板，展现了出色的设计原则和用户体验。
- **[translate](https://gitee.com/mail_osc/translate)** - 感谢提供创新的AI驱动i18n解决方案，仅需两行JavaScript代码即可实现HTML自动翻译。这个开源工具让多语言支持变得极其简单高效。

---

⭐ 如果您觉得这个项目有帮助，请考虑给它一个星标！