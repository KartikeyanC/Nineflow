import plugin from 'tailwindcss/plugin'
/** @type {import('tailwindcss').Config} */

// Every colour is an RGB triple CSS variable on :root (overridden in .dark),
// so Tailwind opacity modifiers keep working: bg-lav/50 -> rgb(var(--lav) / 0.5)
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        // Shared feature screens ask for `font-serif`; v1 keeps Inter.
        serif: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Orange as a TEXT colour uses its own variables (--*-text, index.css): in the default
      // light theme that is a darker orange (#BA4500) so text stays readable; backgrounds,
      // dots, borders and charts keep the logo orange. Other themes and dark mode: the same.
      textColor: {
        'lav-fg': v('lav-text'),
        'peach-fg': v('peach-text'),
        todo: v('todo-text'),
      },
      colors: {
        page: v('page'),
        card: v('card'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
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
        subtle: v('subtle'),
        shell: v('shell'),
        accent: v('accent'),
        'accent-soft': v('accent-soft'),
        todo: v('todo'),
        'todo-soft': v('todo-soft'),
        danger: '#D7373D', // destructive buttons and the Week "now" badge: fixed, 4.6:1 with white
      },
      borderRadius: {
        card: '20px',
      },
      // The NineFlow logo's colours, as used on every filled button (bg-brand). Orange by default; the colour themes swap --brand-a / --brand-b (index.css).
      backgroundImage: {
        brand: 'linear-gradient(to right, rgb(var(--brand-a)), rgb(var(--brand-b)))',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / 0.04), 0 4px 16px rgb(var(--shadow) / 0.05)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.05), 0 12px 28px rgb(var(--shadow) / 0.10)',
        modal: '0 24px 64px rgb(var(--shadow) / 0.22)',
      },
      keyframes: {
        'card-lift': {
          from: { transform: 'rotate(0deg) scale(1)' },
          to: { transform: 'rotate(2deg) scale(1.03)' },
        },
        // Pages enter mostly visible: starting from opacity 0 showed a blank
        // screen for a moment on every page switch.
        'view-in': {
          from: { opacity: '0.55', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
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
          '60%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        'card-out': {
          from: { opacity: '1', transform: 'translateX(0)' },
          to: { opacity: '0', transform: 'translateX(24px)' },
        },
        'menu-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
      animation: {
        'view-in': 'view-in 220ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'modal-in': 'modal-in 180ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-in': 'fade-in 160ms ease-out both',
        'panel-in': 'panel-in 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        pop: 'pop 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'card-out': 'card-out 260ms ease-in both',
        'card-lift': 'card-lift 160ms cubic-bezier(0.2, 0, 0, 1) both',
        'menu-in': 'menu-in 140ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        rise: 'rise 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
      },
    },
  },
  plugins: [
    // `wide:` = the sidebar is showing its labels: a window at least 1024px wide, unless
    // the user minimized the sidebar (the app puts data-rail on <html>; see lib/sidebarRail.js).
    plugin(({ addVariant }) => addVariant('wide', '@media (min-width: 1024px) { :root:not([data-rail]) & }')),
  ],
}
