import { mode } from '@chakra-ui/theme-tools';

export const globalStyles = {
  fonts: {
    body: 'system-ui, sans-serif',
    heading: 'system-ui, sans-serif',
    mono: 'Consolas, monospace',
  },
  styles: {
    global: (props: any) => ({
      body: {
        bg: mode('gray.50', 'black')(props),
      },
      'html, body, #root': {
        minHeight: '100vh',
      },
    }),
  },
};
