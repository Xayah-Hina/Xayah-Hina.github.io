import { definePlugin } from "@expressive-code/core";
import type { Element } from "hast";

export function pluginCustomCopyButton() {
	return definePlugin({
		name: "Custom Copy Button",
		baseStyles: ({ cssVar }) => `
			.expressive-code .copy-btn {
				all: revert !important;
				position: absolute !important;
				top: 0.5rem !important;
				right: 0.5rem !important;
				z-index: 10 !important;
				padding: 0.25rem !important;
				background: var(--btn-regular-bg) !important;
				border: 1px solid oklch(0.8 0.06 var(--hue)) oklch(0.45 0.05 var(--hue)) !important;
				border-radius: 0.25rem !important;
				cursor: pointer !important;
				opacity: 0.8 !important;
				transition: all 0.2s ease !important;
				color: var(--btn-content) !important;
				box-shadow: 0 1px 3px oklch(0.5 0.02 var(--hue) / 0.1) oklch(0.2 0.01 var(--hue) / 0.2) !important;
				font-family: inherit !important;
				font-size: inherit !important;
				line-height: inherit !important;
			}
			
			.expressive-code .copy-btn:hover {
				background: var(--btn-regular-bg-hover) !important;
				border-color: oklch(0.7 0.1 var(--hue)) oklch(0.55 0.08 var(--hue)) !important;
				opacity: 1 !important;
				box-shadow: 0 2px 6px oklch(0.4 0.04 var(--hue) / 0.15) oklch(0.15 0.02 var(--hue) / 0.3) !important;
			}
			
			.expressive-code .copy-btn:active {
				background: var(--btn-regular-bg-active) !important;
				border-color: oklch(0.65 0.12 var(--hue)) oklch(0.6 0.1 var(--hue)) !important;
				box-shadow: 0 1px 2px oklch(0.3 0.06 var(--hue) / 0.2) oklch(0.1 0.03 var(--hue) / 0.4) !important;
			}
			
			.expressive-code .frame:hover .copy-btn {
				opacity: 1 !important;
			}
			
			.expressive-code .copy-btn-icon {
				width: 0.875rem !important;
				height: 0.875rem !important;
				display: flex !important;
				align-items: center !important;
				justify-content: center !important;
				position: relative !important;
				transform: none !important;
				top: auto !important;
				left: auto !important;
			}
			
			.expressive-code .copy-btn svg {
				width: 100% !important;
				height: 100% !important;
				fill: currentColor !important;
			}
			
			.expressive-code .copy-btn .success-icon {
				display: none !important;
			}
			
			.expressive-code .copy-btn.success .copy-icon {
				display: none !important;
			}
			
			.expressive-code .copy-btn.success .success-icon {
				display: block !important;
			}
			
			.expressive-code .copy-btn.success {
				color: var(--primary) !important;
			}
			
			@media (hover: none) {
				.expressive-code .copy-btn {
					opacity: 1 !important;
				}
			}
		`,
		jsModules: [`
			// Copy button functionality
			document.addEventListener('DOMContentLoaded', function() {
				function initializeCopyButtons() {
					const copyButtons = document.querySelectorAll('.copy-btn:not([data-initialized])');
					
					copyButtons.forEach(button => {
						button.addEventListener('click', async function() {
							const codeBlock = this.closest('pre');
							if (!codeBlock) return;
							
							const code = codeBlock.querySelector('code');
							if (!code) return;
							
							try {
								await navigator.clipboard.writeText(code.textContent || '');
								
								// Show success state
								this.classList.add('success');
								
								// Reset after 2 seconds
								setTimeout(() => {
									this.classList.remove('success');
								}, 2000);
								
							} catch (err) {
								console.error('Failed to copy code:', err);
							}
						});
						
						button.setAttribute('data-initialized', 'true');
					});
				}
				
				// Initialize on page load
				initializeCopyButtons();
				
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
			});
		`],
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