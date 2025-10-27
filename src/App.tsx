import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box } from '@mui/material';
import { darkTheme } from './theme';
import EditorLayout from './components/EditorLayout';

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'background.default'
      }}>
        <EditorLayout />
      </Box>
    </ThemeProvider>
  );
}

export default App;
