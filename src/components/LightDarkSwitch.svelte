<script lang="ts">
import { DARK_MODE, LIGHT_MODE } from "@constants/constants.ts";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import {
	applyThemeToDocument,
	getStoredTheme,
	setTheme,
} from "@utils/setting-utils.ts";
import { onMount } from "svelte";
import type { LIGHT_DARK_MODE } from "@/types/config.ts";

const seq: LIGHT_DARK_MODE[] = [LIGHT_MODE, DARK_MODE];
let mode: LIGHT_DARK_MODE = $state(getStoredTheme());

// Removed onMount as we're now initializing mode with getStoredTheme() directly

function switchScheme(newMode: LIGHT_DARK_MODE) {
	mode = newMode;
	setTheme(newMode);
}

function toggleScheme() {
	let i = 0;
	for (; i < seq.length; i++) {
		if (seq[i] === mode) {
			break;
		}
	}
	switchScheme(seq[(i + 1) % seq.length]);
}

// 添加Swup钩子监听，确保在页面切换后同步主题状态
if (typeof window !== 'undefined') {
  // 监听Swup的内容替换事件
  const handleContentReplace = () => {
    // 使用微任务确保在下一渲染周期更新状态
    queueMicrotask(() => {
      const newMode = getStoredTheme();
      if (mode !== newMode) {
        mode = newMode;
      }
    });
  };
  
  // 检查Swup是否已经加载
  if ((window as any).swup && (window as any).swup.hooks) {
    (window as any).swup.hooks.on('content:replace', handleContentReplace);
  } else {
    // 如果Swup尚未加载，监听其启用事件
    document.addEventListener('swup:enable', () => {
      if ((window as any).swup && (window as any).swup.hooks) {
        (window as any).swup.hooks.on('content:replace', handleContentReplace);
      }
    });
  }
}
</script>

<div class="relative z-50">
    <button aria-label="Light/Dark Mode" class="relative btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90" id="scheme-switch" onclick={toggleScheme}>
        <div class="absolute" class:opacity-0={mode !== LIGHT_MODE}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute" class:opacity-0={mode !== DARK_MODE}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
    </button>
</div>