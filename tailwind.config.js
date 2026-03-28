/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './index.html',
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem'
  	},
  	extend: {
  		colors: {
  			'orch-bg': '#1F1F1F',
  			'orch-surface': '#181818',
  			'orch-surface2': '#222222',
  			'orch-input': '#313131',
  			'orch-border': '#2B2B2B',
  			'orch-border2': '#3C3C3C',
  			'orch-hover': '#2B2B2B',
  			'orch-fg': '#CCCCCC',
  			'orch-fg2': '#9D9D9D',
  			'orch-fg3': '#868686',
  			'orch-accent': '#0078D4',
  			'orch-accent-hover': '#026EC1',
  			'orch-green': '#2EA043',
  			'orch-red': '#F85149',
  			'orch-link': '#4DAAFC',
  			'orch-folder': '#E8AE4C',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'cursor-blink': {
  				'0%, 50%': {
  					opacity: '1'
  				},
  				'51%, 100%': {
  					opacity: '0'
  				}
  			},
  			'spin-loader': {
  				from: {
  					transform: 'rotate(0deg)'
  				},
  				to: {
  					transform: 'rotate(360deg)'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'cursor-blink': 'cursor-blink 0.8s step-end infinite',
  			'spin-loader': 'spin-loader 1.2s linear infinite'
  		},
  		fontFamily: {
  			sans: [
  				'system-ui',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Inter',
  				'Segoe UI',
  				'Roboto',
  				'sans-serif'
  			],
  			mono: [
  				'Cascadia Code',
  				'Fira Code',
  				'Cascadia Mono',
  				'Menlo',
  				'Consolas',
  				'monospace'
  			]
  		},
  		typography: {
  			DEFAULT: {
  				css: {
  					color: '#CCCCCC',
  					a: {
  						color: '#4DAAFC'
  					},
  					strong: {
  						color: '#e6edf3'
  					},
  					h1: {
  						color: '#e6edf3'
  					},
  					h2: {
  						color: '#e6edf3'
  					},
  					h3: {
  						color: '#e6edf3'
  					},
  					h4: {
  						color: '#e6edf3'
  					},
  					code: {
  						color: '#CCCCCC'
  					},
  					blockquote: {
  						color: '#9D9D9D',
  						borderLeftColor: '#3C3C3C'
  					},
  					hr: {
  						borderColor: '#2B2B2B'
  					},
  					'thead th': {
  						color: '#e6edf3'
  					}
  				}
  			}
  		}
  	}
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
