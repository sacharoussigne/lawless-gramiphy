import { createTheme, DEFAULT_THEME } from '@mantine/core';

const theme = createTheme({
  ...DEFAULT_THEME,
  colors: {
    dark: [
      '#F1F3F5',
      '#E9ECEF',
      '#DEE2E6',
      '#CED4DA',
      '#ADB5BD',
      '#868E96',
      '#495057',
      '#343A40',
      '#212529',
      '#121417',
    ],
    green: [
      '#e9fbea',
      '#c9f2cd',
      '#9be89f',
      '#6fdd75',
      '#45d351',
      '#1ed760',
      '#1db954',
      '#159947',
      '#0f7b3a',
      '#0a5f2e',
    ],
  },
  primaryColor: 'green',
  primaryShade: 6,
  defaultRadius: 'sm',
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2.25rem',
  },
  shadows: {
    xs: '0 1px 0 rgba(0, 0, 0, 0.35)',
    sm: '0 6px 18px rgba(0, 0, 0, 0.35)',
    md: '0 10px 30px rgba(0, 0, 0, 0.40)',
    lg: '0 18px 48px rgba(0, 0, 0, 0.45)',
    xl: '0 24px 72px rgba(0, 0, 0, 0.50)',
  },
  fontFamily: 'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  fontFamilyMonospace: 'var(--font-geist-mono), Monaco, Courier, monospace',
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
  },
  lineHeights: {
    xs: '1.4',
    sm: '1.45',
    md: '1.55',
    lg: '1.6',
    xl: '1.65',
  },
  components: {
    AppShell: {
      styles: {
        header: {
          borderBottom: '1px solid var(--mantine-color-dark-7)',
          backgroundColor: 'rgba(18, 20, 23, 0.85)',
          backdropFilter: 'blur(10px)',
        },
        navbar: {
          borderRight: '1px solid var(--mantine-color-dark-7)',
          backgroundColor: 'var(--mantine-color-dark-9)',
        },
        main: {
          background:
            'radial-gradient(900px 420px at 10% 0%, rgba(30, 215, 96, 0.14) 0%, rgba(18, 20, 23, 0) 55%), radial-gradient(700px 360px at 90% 10%, rgba(29, 185, 84, 0.10) 0%, rgba(18, 20, 23, 0) 60%), var(--mantine-color-dark-9)',
          color: 'var(--mantine-color-dark-0)',
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: '10px',
          fontWeight: 700,
          color: 'var(--mantine-color-dark-0)',
          backgroundColor: 'transparent',
        },
        label: {
          color: 'var(--mantine-color-dark-0)',
        },
        description: {
          color: 'var(--mantine-color-dark-2)',
        },
        section: {
          color: 'var(--mantine-color-dark-1)',
        },
      },
    },
    Text: {
      styles: {
        root: {
          color: 'var(--mantine-color-dark-0)',
        },
      },
    },
    Title: {
      styles: {
        root: {
          color: 'var(--mantine-color-dark-0)',
        },
      },
    },
    Input: {
      styles: {
        input: {
          backgroundColor: 'rgba(33, 37, 41, 0.70)',
          borderColor: 'var(--mantine-color-dark-7)',
          color: 'var(--mantine-color-dark-0)',
        },
        section: {
          color: 'var(--mantine-color-dark-2)',
        },
      },
    },
    Select: {
      styles: {
        input: {
          backgroundColor: 'rgba(33, 37, 41, 0.70)',
          borderColor: 'var(--mantine-color-dark-7)',
          color: 'var(--mantine-color-dark-0)',
        },
        dropdown: {
          backgroundColor: 'var(--mantine-color-dark-8)',
          borderColor: 'var(--mantine-color-dark-7)',
        },
        option: {
          color: 'var(--mantine-color-dark-0)',
        },
      },
    },
    SegmentedControl: {
      styles: {
        root: {
          backgroundColor: 'rgba(33, 37, 41, 0.65)',
          border: '1px solid var(--mantine-color-dark-7)',
        },
        label: {
          color: 'var(--mantine-color-dark-1)',
          fontWeight: 600,
        },
        controlActive: {
          backgroundColor: 'rgba(30, 215, 96, 0.18)',
        },
      },
    },
    Button: {
      styles: {
        root: {
          fontWeight: 600,
        },
      },
    },
    Card: {
      styles: {
        root: {
          borderRadius: '14px',
          border: '1px solid var(--mantine-color-dark-7)',
          background:
            'linear-gradient(180deg, rgba(33, 37, 41, 0.72) 0%, rgba(33, 37, 41, 0.50) 100%)',
        },
      },
    },
    Modal: {
      styles: {
        content: {
          borderRadius: '16px',
        },
      },
    },
    Paper: {
      styles: {
        root: {
          borderRadius: '14px',
          border: '1px solid var(--mantine-color-dark-7)',
        },
      },
    },
  },
});

export default theme;