# Banner 图片目录

此目录包含网站首页轮播banner图片。

## 文件命名规范

- 格式：`{序号}-banner.webp`
- 示例：`1-banner.webp`, `2-banner.webp`, `3-banner.webp`

## 当前图片列表

1. `1-banner.webp` - 轮播图片1
2. `2-banner.webp` - 轮播图片2  
3. `3-banner.webp` - 轮播图片3
4. `4-banner.webp` - 轮播图片4
5. `5-banner.webp` - 轮播图片5
6. `6-banner.webp` - 轮播图片6
7. `7-banner.webp` - 轮播图片7

## 配置说明

这些图片在 `src/config.ts` 文件中的 `banner.src` 数组中配置：

```typescript
src: [
    "assets/banner/1-banner.webp",
    "assets/banner/2-banner.webp",
    "assets/banner/3-banner.webp",
    "assets/banner/4-banner.webp",
    "assets/banner/5-banner.webp",
    "assets/banner/6-banner.webp",
    "assets/banner/7-banner.webp",
]
```

## 添加新图片

1. 将新的 `.webp` 图片文件放入此目录
2. 按照命名规范重命名文件
3. 在 `src/config.ts` 中更新 `banner.src` 数组
4. 重启开发服务器查看效果

## 图片要求

- 格式：WebP（推荐）或 JPG/PNG
- 分辨率：建议 1920x1080 或更高
- 文件大小：建议小于 500KB 以提升加载速度