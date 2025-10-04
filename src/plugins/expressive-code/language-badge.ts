/**
 * Based on the discussion at https://github.com/expressive-code/expressive-code/issues/153#issuecomment-2282218684
 */
import { definePlugin } from "@expressive-code/core";

export function pluginLanguageBadge() {
	return definePlugin({
		name: "Language Badge",
		baseStyles: () => `
      [data-language]::before {
        position: absolute;
        z-index: 2;
        right: 0.5rem;
        top: 0.5rem;
        padding: 0.1rem 0.5rem;
        content: attr(data-language);
        font-family: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
        color: var(--btn-content);
        background: var(--btn-regular-bg);
        border-radius: 0.5rem;
        pointer-events: none;
        transition: opacity 0.3s;
        opacity: 0;
      }
      .frame:not(.has-title):not(.is-terminal) {
        @media (hover: hover) {
          & [data-language]::before {
            opacity: 1;
          }
          &:hover [data-language]::before {
            opacity: 0;
          }
        }
      }
      
      /* Mobile optimization: use touch events instead of always showing, consistent with copy button behavior */
      @media (hover: none) {
        .frame:not(.has-title):not(.is-terminal).touch-active [data-language]::before {
          opacity: 1;
        }
      }
    `,
		jsModules: [`
			// Language badge touch functionality
			document.addEventListener('DOMContentLoaded', function() {
				function initializeLanguageBadges() {
					// Add touch event support on mobile
					if (window.matchMedia('(hover: none)').matches) {
						const frames = document.querySelectorAll('.frame:not(.has-title):not(.is-terminal):not([data-language-events-initialized])');
						frames.forEach(frame => {
							// Add touch start event
							frame.addEventListener('touchstart', function() {
								this.classList.add('touch-active');
								
								// Hide after 3 seconds (unless in success state)
								setTimeout(() => {
									const copyBtn = this.querySelector('.copy-btn');
									if (copyBtn && !copyBtn.classList.contains('success')) {
										this.classList.remove('touch-active');
									}
								}, 3000);
							}, { passive: true });
							
							frame.setAttribute('data-language-events-initialized', 'true');
						});
					}
				}
				
				// Initialize on page load
				initializeLanguageBadges();
				
				// Re-initialize after page transitions
				if (window.swup) {
					window.swup.hooks.on('page:view', initializeLanguageBadges);
				}
				
				// Handle dynamic content loading
				const observer = new MutationObserver(function(mutations) {
					mutations.forEach(function(mutation) {
						if (mutation.addedNodes.length > 0) {
							initializeLanguageBadges();
						}
					});
				});
				
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
			});
		`],
	});
}