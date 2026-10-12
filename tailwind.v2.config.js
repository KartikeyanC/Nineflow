/** @type {import('tailwindcss').Config} */

// Tailwind config for the v2 design (src/v2/theme.css loads it with @config).
// Same token names as tailwind.config.js so every existing view renders under
// v2 unchanged; values live in theme.css. Direction: soft structuralism -
// warm paper background, floating machined cards with diffused shadows,
// pill controls, Plus Jakarta Sans + Instrument Serif, spring easing.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
const spring = 'cubic-bezier(0.32, 0.72, 0, 1)'

export default {
  darkMode: 'class',
  content: ['./index-v2.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        page: v('page'),
        card: v('card'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        subtle: v('subtle'),
        shell: v('shell'),
        accent: v('accent'),
        'accent-soft': v('accent-soft'),
        lav: v('lav'),
        'lav-fg': v('lav-fg'),
        violet: v('violet'),
        'violet-fg': v('violet-fg'),
        sky: v('sky'),
        'sky-fg': v('sky-fg'),
        butter: v('butter'),
        'butter-fg': v('butter-fg'),
        coral: v('coral'),
        'coral-fg': v('coral-fg'),
        mint: v('mint'),
        'mint-fg': v('mint-fg'),
        peach: v('peach'),
        'peach-fg': v('peach-fg'),
        rose: v('rose'),
        'rose-fg': v('rose-fg'),
        teal: v('teal'),
        'teal-fg': v('teal-fg'),
      },
      borderRadius: {
        card: '22px',
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        // Hairline ring + a long, very diffused ambient shadow: no harsh drop.
        // --hair is a full colour (it differs in alpha between themes).
        soft: '0 0 0 1px var(--hair), 0 1px 2px rgb(var(--shadow) / 0.04), 0 12px 32px -12px rgb(var(--shadow) / 0.12)',
        lift: '0 0 0 1px var(--hair), 0 2px 4px rgb(var(--shadow) / 0.05), 0 24px 48px -16px rgb(var(--shadow) / 0.22)',
        modal: '0 0 0 1px var(--hair), 0 32px 80px -16px rgb(var(--shadow) / 0.38)',
        inner: 'inset 0 1px 0 rgb(255 255 255 / 0.6)',
      },
      // Every `transition` utility in the reused v1 views gets spring easing.
      transitionTimingFunction: {
        DEFAULT: spring,
        spring,
      },
      transitionDuration: {
        DEFAULT: '260ms',
      },
      keyframes: {
        // Pages enter mostly visible: starting from opacity 0 showed a blank
        // screen for a moment on every page switch.
        'view-in': {
          from: { opacity: '0.55', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(18px) scale(0.985)', filter: 'blur(6px)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        'modal-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'panel-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.6)' },
          '60%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        'card-out': {
          from: { opacity: '1', transform: 'translateX(0)' },
          to: { opacity: '0', transform: 'translateX(24px)' },
        },
        'menu-in': {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'view-in': `view-in 520ms ${spring} both`,
        rise: `rise 760ms ${spring} both`,
        'modal-in': `modal-in 380ms ${spring} both`,
        'fade-in': 'fade-in 200ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'panel-in': `panel-in 480ms ${spring} both`,
        pop: `pop 320ms ${spring} both`,
        'card-out': 'card-out 260ms cubic-bezier(0.4, 0, 1, 1) both',
        'menu-in': `menu-in 260ms ${spring} both`,
      },
    },
  },
  plugins: [],
}
