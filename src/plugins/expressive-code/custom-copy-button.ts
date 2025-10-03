import { definePlugin } from "@expressive-code/core";
import type { Element } from "hast";

export function pluginCustomCopyButton() {
	return definePlugin({
		name: "Custom Copy Button",
		baseStyles: ({ cssVar }) => `
			.copy-btn {
				position: absolute;
				top: 0.5rem;
				right: 0.5rem;
				z-index: 10;
				padding: 0.25rem;
				background: ${cssVar("frames.copyButtonBackground")};
				border: none;
				border-radius: 0.25rem;
				cursor: pointer;
				opacity: 0;
				transition: all 0.2s ease;
				color: ${cssVar("frames.copyButtonForeground")};
				pointer-events: auto !important;
				display: block !important;
			}
			
			.copy-btn:hover {
				background: ${cssVar("frames.copyButtonBackgroundHover")};
				opacity: 1;
			}
			
			.copy-btn:active {
				background: ${cssVar("frames.copyButtonBackgroundActive")};
			}
			
			.frame:hover .copy-btn {
				opacity: 1;
			}
			
			.copy-btn-icon {
				width: 0.75rem;
				height: 0.75rem;
				display: flex;
				align-items: center;
				justify-content: center;
			}
			
			.copy-btn svg {
				width: 100%;
				height: 100%;
				fill: currentColor;
			}
			
			.copy-btn .success-icon {
				display: none;
			}
			
			.copy-btn.success .copy-icon {
				display: none;
			}
			
			.copy-btn.success .success-icon {
				display: block;
			}
			
			.copy-btn.success {
				color: var(--primary);
			}
			
			.copy-btn.error {
				background: rgba(239, 68, 68, 0.8);
			}
			
			.copy-btn.error svg {
				fill: #fff;
			}
			
			/* 移动端优化：使用触摸事件而不是始终显示 */
			@media (hover: none) {
				.frame.touch-active .copy-btn {
					opacity: 1;
				}
			}

			/* 确保复制按钮在构建环境中可见 */
			.expressive-code .copy-btn {
				pointer-events: auto !important;
				display: block !important;
			}
		`,
		jsModules: [
			`
			// Copy button functionality
			function initializeCopyButtons() {
				const copyButtons = document.querySelectorAll('.copy-btn:not([data-initialized])');
				
				copyButtons.forEach(button => {
					button.addEventListener('click', async function() {
						const codeBlock = this.closest('pre');
						if (!codeBlock) return;
						
						const code = codeBlock.querySelector('code');
						if (!code) return;
						
						try {
							// 尝试使用现代 Clipboard API
							if (navigator.clipboard && navigator.clipboard.writeText) {
								// 重构复制逻辑：使用更简单可靠的方法
								const codeText = extractCodeText(code);
								await navigator.clipboard.writeText(codeText);
							} else {
								// 降级方案：使用 document.execCommand
								const textArea = document.createElement('textarea');
								const codeText = extractCodeText(code);
								textArea.value = codeText;
								textArea.style.position = 'fixed';
								textArea.style.left = '-999999px';
								textArea.style.top = '-999999px';
								document.body.appendChild(textArea);
								textArea.focus();
								textArea.select();
								
								const successful = document.execCommand('copy');
								document.body.removeChild(textArea);
								
								if (!successful) {
									throw new Error('Copy command failed');
								}
							}
							
							// Show success state
							this.classList.add('success');
							
							// Reset after 2 seconds
							setTimeout(() => {
								this.classList.remove('success');
								// 在移动端，复制成功后也重置touch-active状态
								const frame = this.closest('.frame');
								if (frame && window.matchMedia('(hover: none)').matches) {
									frame.classList.remove('touch-active');
								}
							}, 2000);
							
						} catch (err) {
							console.error('Failed to copy code:', err);
							// 显示错误提示给用户
							this.classList.add('error');
							setTimeout(() => {
								this.classList.remove('error');
							}, 2000);
						}
					});
					
					// 在移动端添加触摸事件支持
					if (window.matchMedia('(hover: none)').matches) {
						const frame = button.closest('.frame');
						if (frame) {
							// 添加触摸开始事件
							frame.addEventListener('touchstart', function() {
								this.classList.add('touch-active');
								
								// 3秒后自动隐藏按钮（除非处于成功状态）
								setTimeout(() => {
									const copyBtn = this.querySelector('.copy-btn');
									if (copyBtn && !copyBtn.classList.contains('success')) {
										this.classList.remove('touch-active');
									}
								}, 3000);
							}, { passive: true });
						}
					}
					
					button.setAttribute('data-initialized', 'true');
				});
			}
			
			// 改进的初始化函数
			function setupCopyButtons() {
				// 如果DOM还没准备好，等待它
				if (document.readyState === 'loading') {
					document.addEventListener('DOMContentLoaded', initializeCopyButtons);
				} else {
					// DOM已经准备好了，直接初始化
					initializeCopyButtons();
				}
				
				// Re-initialize after page transitions
				if (window.swup) {
					window.swup.hooks.on('page:view', initializeCopyButtons);
				}
				
				// Handle dynamic content loading
				const observer = new MutationObserver(function(mutations) {
					mutations.forEach(function(mutation) {
						if (mutation.addedNodes.length > 0) {
							initializeCopyButtons();
						}
					});
				});
				
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
			}
			
			// 提取代码文本的核心函数
			function extractCodeText(codeElement) {
				// 获取所有代码行
				const lines = codeElement.querySelectorAll('span.line');
				
				if (lines.length > 0) {
					// 对于有行结构的代码块
					const lineTexts = [];
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i];
						// 获取行的纯文本内容
						const lineText = line.textContent || '';
						lineTexts.push(lineText);
					}
					// 使用 \n 连接所有行，确保每行之间只有一个换行符
					let result = lineTexts.join('\n');
					
					// 改进的空行处理逻辑
					result = result.replace(/\n\n\n+/g, function(match) {
						// 计算连续换行符的数量
						const newlineCount = match.length;
						// 计算空行数量（换行符数量减1）
						const emptyLineCount = newlineCount - 1;
						
						// 偶数空行：除以2
						// 奇数空行：(空行数+1)/2 向下取整
						let resultEmptyLines;
						if (emptyLineCount % 2 === 0) {
							// 偶数
							resultEmptyLines = emptyLineCount / 2;
						} else {
							// 奇数
							resultEmptyLines = Math.floor((emptyLineCount + 1) / 2);
						}
						
						// 至少保留一个空行
						if (resultEmptyLines < 1) resultEmptyLines = 1;
						
						// 返回对应数量的换行符
						return '\n'.repeat(resultEmptyLines + 1);
					});
					
					return result;
				} else {
					// 对于没有行结构的简单代码块
					// 使用 textContent 并手动处理换行
					let text = codeElement.textContent || '';
					// 规范化换行符，确保统一使用 \n
					text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
					
					// 改进的空行处理逻辑
					text = text.replace(/\n\n\n+/g, function(match) {
						// 计算连续换行符的数量
						const newlineCount = match.length;
						// 计算空行数量（换行符数量减1）
						const emptyLineCount = newlineCount - 1;
						
						// 偶数空行：除以2
						// 奇数空行：(空行数+1)/2 向下取整
						let resultEmptyLines;
						if (emptyLineCount % 2 === 0) {
							// 偶数
							resultEmptyLines = emptyLineCount / 2;
						} else {
							// 奇数
							resultEmptyLines = Math.floor((emptyLineCount + 1) / 2);
						}
						
						// 至少保留一个空行
						if (resultEmptyLines < 1) resultEmptyLines = 1;
						
						// 返回对应数量的换行符
						return '\n'.repeat(resultEmptyLines + 1);
					});
					
					return text;
				}
			}
			
			// 立即执行设置
			setupCopyButtons();
		`,
		],
		hooks: {
			postprocessRenderedBlock: (context) => {
				function traverse(node: Element) {
					if (node.type === "element" && node.tagName === "pre") {
						processCodeBlock(node);
						return;
					}
					if (node.children) {
						for (const child of node.children) {
							if (child.type === "element") traverse(child);
						}
					}
				}

				function processCodeBlock(node: Element) {
					const copyButton = {
						type: "element" as const,
						tagName: "button",
						properties: {
							className: ["copy-btn"],
							"aria-label": "Copy code",
						},
						children: [
							{
								type: "element" as const,
								tagName: "div",
								properties: {
									className: ["copy-btn-icon"],
								},
								children: [
									{
										type: "element" as const,
										tagName: "svg",
										properties: {
											viewBox: "0 -960 960 960",
											xmlns: "http://www.w3.org/2000/svg",
											className: ["copy-btn-icon", "copy-icon"],
										},
										children: [
											{
												type: "element" as const,
												tagName: "path",
												properties: {
													d: "M368.37-237.37q-34.48 0-58.74-24.26-24.26-24.26-24.26-58.74v-474.26q0-34.48 24.26-58.74 24.26-24.26 58.74-24.26h378.26q34.48 0 58.74 24.26 24.26 24.26 24.26 58.74v474.26q0 34.48-24.26 58.74-24.26 24.26-58.74 24.26H368.37Zm0-83h378.26v-474.26H368.37v474.26Zm-155 238q-34.48 0-58.74-24.26-24.26-24.26-24.26-58.74v-515.76q0-17.45 11.96-29.48 11.97-12.02 29.33-12.02t29.54 12.02q12.17 12.03 12.17 29.48v515.76h419.76q17.45 0 29.48 11.96 12.02 11.97 12.02 29.33t-12.02 29.54q-12.03 12.17-29.48 12.17H213.37Zm155-238v-474.26 474.26Z",
												},
												children: [],
											},
										],
									},
									{
										type: "element" as const,
										tagName: "svg",
										properties: {
											viewBox: "0 -960 960 960",
											xmlns: "http://www.w3.org/2000/svg",
											className: ["copy-btn-icon", "success-icon"],
										},
										children: [
											{
												type: "element" as const,
												tagName: "path",
												properties: {
													d: "m389-377.13 294.7-294.7q12.58-12.67 29.52-12.67 16.93 0 29.61 12.67 12.67 12.68 12.67 29.53 0 16.86-12.28 29.14L419.07-288.41q-12.59 12.67-29.52 12.67-16.94 0-29.62-12.67L217.41-430.93q-12.67-12.68-12.79-29.45-.12-16.77 12.55-29.45 12.68-12.67 29.62-12.67 16.93 0 29.28 12.67L389-377.13Z",
												},
												children: [],
											},
										],
									},
								],
							},
						],
					} as Element;

					if (!node.children) {
						node.children = [];
					}
					node.children.push(copyButton);
				}

				traverse(context.renderData.blockAst);
			},
		},
	});
}
