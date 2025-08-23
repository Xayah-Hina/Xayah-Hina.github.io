// 翻译脚本加载工具，避免竞态条件
let loadPromise: Promise<void> | null = null;

/**
 * 加载翻译脚本，确保只加载一次
 * 避免因多次调用导致的竞态条件问题
 */
export async function loadTranslateScript(): Promise<void> {
  // 如果已经加载完成，直接返回
  if (typeof window.translate !== 'undefined') {
    return Promise.resolve();
  }

  // 如果正在加载中，返回现有的Promise
  if (loadPromise) {
    return loadPromise;
  }

  // 创建新的加载Promise
  loadPromise = new Promise<void>((resolve, reject) => {
    // 检查是否已经存在翻译脚本标签
    const existingScript = document.getElementById('translate-script');
    if (existingScript) {
      // 脚本已存在，等待其加载完成
      if (typeof window.translate !== 'undefined') {
        resolve();
      } else {
        // 监听脚本加载完成
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => reject(new Error('Translate script load failed')));
      }
      return;
    }

    // 创建新的脚本标签
    const script = document.createElement('script');
    script.id = 'translate-script';
    script.src = '/translate.js';
    
    script.onload = () => {
      console.log('Translate script loaded successfully');
      resolve();
    };
    
    script.onerror = () => {
      console.error('Failed to load translate script');
      loadPromise = null; // 重置Promise以便重试
      reject(new Error('Failed to load translate script'));
    };

    document.head.appendChild(script);
  });

  try {
    await loadPromise;
  } catch (error) {
    loadPromise = null; // 发生错误时重置，允许重试
    throw error;
  }

  return loadPromise;
}