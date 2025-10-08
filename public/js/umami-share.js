(function (global) {
  const cacheKey = 'umami-share-cache';
  const cacheTTL = 3600_000; // 1h

  /**
   * 获取网站统计数据
   * @param {string} baseUrl - Umami Cloud API基础URL
   * @param {string} apiKey - API密钥
   * @param {string} websiteId - 网站ID
   * @returns {Promise<object>} 网站统计数据
   */
  async function fetchWebsiteStats(baseUrl, apiKey, websiteId) {
    // 检查缓存
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < cacheTTL) {
          return parsed.value;
        }
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }
    
    const currentTimestamp = Date.now();
    const statsUrl = `${baseUrl}/v1/websites/${websiteId}/stats?startAt=0&endAt=${currentTimestamp}`;
    
    const res = await fetch(statsUrl, {
      headers: {
        'x-umami-api-key': apiKey
      }
    });
    
    if (!res.ok) {
      throw new Error('获取网站统计数据失败');
    }
    
    const stats = await res.json();
    
    // 缓存结果
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), value: stats }));
    
    return stats;
  }

  /**
   * 获取 Umami 网站统计数据
   * @param {string} baseUrl - Umami Cloud API基础URL
   * @param {string} apiKey - API密钥
   * @param {string} websiteId - 网站ID
   * @returns {Promise<object>} 网站统计数据
   */
  global.getUmamiWebsiteStats = async function (baseUrl, apiKey, websiteId) {
    try {
      return await fetchWebsiteStats(baseUrl, apiKey, websiteId);
    } catch (err) {
      throw new Error(`获取Umami统计数据失败: ${err.message}`);
    }
  };

  global.clearUmamiShareCache = function () {
    localStorage.removeItem(cacheKey);
  };
})(window);