export const GET = async () => {
  // 相册组数据
  const galleryGroups = [
    {
      id: 1,
      title: '旅行回忆',
      description: '记录美好的旅行时光',
      coverImage: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=600&fit=crop',
      imageCount: 3,
      createdAt: '2024-01-15',
      tags: ['旅行', '风景', '回忆'],
      images: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=600&h=400&fit=crop'
      ]
    },
    {
      id: 2,
      title: '日常生活',
      description: '记录平凡而美好的日常瞬间',
      coverImage: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&h=600&fit=crop',
      imageCount: 2,
      createdAt: '2024-02-10',
      tags: ['日常', '生活', '随拍'],
      images: [
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=400&fit=crop'
      ]
    },
    {
      id: 3,
      title: '美食记录',
      description: '分享各种美味的食物',
      coverImage: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=600&fit=crop',
      imageCount: 4,
      createdAt: '2024-03-05',
      tags: ['美食', '料理', '分享'],
      images: [
        'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&h=400&fit=crop',
        'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&h=400&fit=crop'
      ]
    }
  ];

  return new Response(JSON.stringify({
    success: true,
    data: galleryGroups,
    total: galleryGroups.length,
    totalImages: galleryGroups.reduce((sum, group) => sum + group.imageCount, 0)
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300' // 缓存5分钟
    }
  });
};