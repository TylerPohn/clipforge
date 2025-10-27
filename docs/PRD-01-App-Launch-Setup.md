# PRD: App Launch & Setup

**Feature**: Native Desktop App Launch & UI Foundation
**Priority**: P0 (Blocker)
**Estimated Time**: 4-6 hours
**Dependencies**: None

---

## Overview

Set up the foundational Tauri + React + Material UI application with dark theme and basic layout structure. This establishes the skeleton upon which all other features will be built.

---

## Goals

- Create a native desktop application that launches successfully on macOS and Windows
- Implement a dark theme using Material UI
- Set up basic application layout (AppBar, main content area, footer)
- Configure Tauri to communicate between frontend (React) and backend (Rust)

---

## Implementation Steps

### Step 1: DONE Initialize Tauri Project (30 minutes)

**What to do:**
1. Open terminal in the project directory
2. Verified Tauri prerequisites are installed:
   ```bash
   # Check Node.js
   node --version  # Should be 16+

   # Check Rust
   rustc --version  # Should be 1.70+
   ```

tyler@tylers-mbp-2 clipforge % rustc --version
rustc 1.68.0 (2c8cc3432 2023-03-06)

tyler@tylers-mbp-2 clipforge % node --version
v22.17.0

3. The project is already initialized, verify structure:
   ```
   clipforge/
   ├── src/               # React frontend
   ├── src-tauri/         # Rust backend
   ├── package.json
   └── vite.config.ts
   ```

**Verification:**
- Run `npm run tauri dev` and confirm a window opens (even if empty)

---

### Step 2: DONE Install Cargo Packages (10 minutes)

**What to do:**
1. Navigate to the Rust backend directory:
   ```bash
   cd src-tauri
   ```

2. ALREADY DONE: Install Cargo dependencies:
   ```bash
   cargo build
   ```
   This will automatically download and compile all dependencies listed in `Cargo.toml`

3. Verify installation was successful by checking the output for "Finished" message

**Why this matters:**
- Cargo packages are required for the Rust backend to compile
- Must be done before running `npm run tauri dev`

**Verification:**
- No errors in the cargo build output
- The `target/` directory is created with compiled artifacts

---

### Step 3: DONE Install Material UI Dependencies (15 minutes)

**What to do:**
1. We already installed MUI packages:
   ```bash
   npm install @mui/material @emotion/react @emotion/styled @mui/icons-material
   ```
---

### Step 4: Create Dark Theme Configuration (30 minutes)

**File to create:** `src/theme.ts`

**What to do:**
1. Create a new file `src/theme.ts`
2. Copy this code:

```typescript
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
```

**Why this matters:**
- Consistent dark theme across all components
- Pre-configured styling reduces duplicate code later

---

### Step 5: Create Main App Layout (45 minutes)

**File to edit:** `src/App.tsx`

**What to do:**
1. Replace the content of `src/App.tsx` with:

```typescript
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
```

**What each part does:**
- `ThemeProvider` - Applies dark theme to all MUI components
- `CssBaseline` - Normalizes CSS across browsers
- `Box` - Container that fills the entire window
- `EditorLayout` - Main layout component (created next)

---

### Step 6: Create Editor Layout Component (60 minutes)

**File to create:** `src/components/EditorLayout.tsx`

**What to do:**
1. Create folder: `src/components/`
2. Create file: `src/components/EditorLayout.tsx`
3. Add this code:

```typescript
import { AppBar, Toolbar, Button, Box, Typography } from '@mui/material';
import {
  VideoFile,
  FiberManualRecord,
  FileDownload
} from '@mui/icons-material';

function EditorLayout() {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge
          </Typography>

          <Button
            color="inherit"
            startIcon={<VideoFile />}
            sx={{ mr: 2 }}
          >
            Import
          </Button>

          <Button
            color="inherit"
            startIcon={<FiberManualRecord />}
            sx={{ mr: 2 }}
          >
            Record
          </Button>

          <Button
            color="inherit"
            startIcon={<FileDownload />}
          >
            Export
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
      }}>
        <Typography variant="h5" color="text.secondary">
          Import a video to get started
        </Typography>
      </Box>

      {/* Timeline Footer (Placeholder) */}
      <Box sx={{
        height: 120,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        p: 2,
      }}>
        <Typography variant="body2" color="text.secondary">
          Timeline will appear here
        </Typography>
      </Box>
    </Box>
  );
}

export default EditorLayout;
```

**Component breakdown:**
- **AppBar**: Top bar with Import/Record/Export buttons (non-functional for now)
- **Main Box**: Center area where video player will go
- **Timeline Box**: Bottom area where timeline will go

---

### Step 7: Configure Tauri Window Settings (30 minutes)

**File to edit:** `src-tauri/tauri.conf.json`

**What to do:**
1. Open `src-tauri/tauri.conf.json`
2. Find the `windows` section and update it:

```json
{
  "tauri": {
    "windows": [
      {
        "title": "ClipForge",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "center": true
      }
    ]
  }
}
```

**What these settings do:**
- `width/height`: Default window size
- `minWidth/minHeight`: Prevents window from being too small
- `center`: Opens window in center of screen
- `decorations`: Shows native window controls (close/minimize/maximize)

---

### Step 8: Test the Application (20 minutes)

**What to do:**
1. Run development build:
   ```bash
   npm run tauri dev
   ```

2. **Expected result**: A window should open showing:
   - Dark theme with cyan accents
   - Top bar with "ClipForge" title and three buttons
   - Center text: "Import a video to get started"
   - Bottom timeline placeholder

3. **Verify these behaviors:**
   - Window can be resized but not smaller than 1024x600
   - Dark theme is applied (dark background, light text)
   - Buttons have icons and labels

**If it doesn't work:**
- Check browser console (Ctrl+Shift+I or Cmd+Option+I) for errors
- Verify all files are saved
- Try `npm install` again to ensure dependencies installed

---

### Step 9: Build Production Version (Optional - 15 minutes)

**What to do:**
1. Create production build:
   ```bash
   npm run tauri build
   ```

2. Find the built app:
   - **macOS**: `src-tauri/target/release/bundle/macos/ClipForge.app`
   - **Windows**: `src-tauri/target/release/bundle/msi/ClipForge.msi`

3. Double-click to launch the standalone app

**Why build now:**
- Confirms packaging works early
- Tests that app runs outside development mode

---

## Success Criteria

- [ ] App launches in dev mode (`npm run tauri dev`)
- [ ] Window displays with dark theme
- [ ] AppBar shows "ClipForge" title and three buttons
- [ ] Window can be resized but not below minimum size
- [ ] No console errors on launch
- [ ] (Optional) Production build launches successfully

---

## Common Issues & Solutions

### Issue: "Tauri command not found"
**Solution**: Install Tauri CLI: `npm install -g @tauri-apps/cli`

### Issue: "Failed to load module"
**Solution**: Run `npm install` to ensure all dependencies are installed

### Issue: Dark theme not applying
**Solution**: Verify `theme.ts` is imported in `App.tsx` and wrapped in `ThemeProvider`

### Issue: Window is blank/white
**Solution**: Check browser console for React errors, verify all imports are correct

---

## Next Steps

Once this feature is complete:
1. Move to **PRD-02: Video Import** to add drag-and-drop functionality
2. The layout components created here will be extended with real functionality
3. State management will be added to handle video files

---

## Files Created/Modified

- ✅ `src/theme.ts` (new)
- ✅ `src/App.tsx` (modified)
- ✅ `src/components/EditorLayout.tsx` (new)
- ✅ `src-tauri/tauri.conf.json` (modified)
