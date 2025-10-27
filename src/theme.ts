import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00bcd4',  // Cyan accent color
    },
    secondary: {
      main: '#ff4081',  // Pink accent for highlights
    },
    background: {
      default: '#121212',  // App background
      paper: '#1e1e1e',    // Card/dialog background
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,      // Rounded buttons
          textTransform: 'none', // No ALL CAPS
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e1e1e',
        },
      },
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});
