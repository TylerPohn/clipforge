#!/bin/bash

# Script to download FFmpeg static binaries for cross-platform builds
# Run this script before building the production app

set -e

BINARIES_DIR="binaries"
mkdir -p "$BINARIES_DIR"

echo "Downloading FFmpeg binaries for all platforms..."

# macOS ARM64 (Apple Silicon)
if [ ! -f "$BINARIES_DIR/ffmpeg-aarch64-apple-darwin" ]; then
    echo "Downloading FFmpeg for macOS ARM64..."
    curl -L https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip -o /tmp/ffmpeg-macos-arm64.zip
    unzip -o /tmp/ffmpeg-macos-arm64.zip -d /tmp/
    mv /tmp/ffmpeg "$BINARIES_DIR/ffmpeg-aarch64-apple-darwin"
    chmod +x "$BINARIES_DIR/ffmpeg-aarch64-apple-darwin"
    rm /tmp/ffmpeg-macos-arm64.zip
fi

if [ ! -f "$BINARIES_DIR/ffprobe-aarch64-apple-darwin" ]; then
    echo "Downloading FFprobe for macOS ARM64..."
    curl -L https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip -o /tmp/ffprobe-macos-arm64.zip
    unzip -o /tmp/ffprobe-macos-arm64.zip -d /tmp/
    mv /tmp/ffprobe "$BINARIES_DIR/ffprobe-aarch64-apple-darwin"
    chmod +x "$BINARIES_DIR/ffprobe-aarch64-apple-darwin"
    rm /tmp/ffprobe-macos-arm64.zip
fi

# macOS x86_64 (Intel)
if [ ! -f "$BINARIES_DIR/ffmpeg-x86_64-apple-darwin" ]; then
    echo "Downloading FFmpeg for macOS x86_64..."
    # Note: evermeet.cx provides universal binaries, so we can use the same download
    # Or use a specific Intel build if available
    curl -L https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip -o /tmp/ffmpeg-macos-x64.zip
    unzip -o /tmp/ffmpeg-macos-x64.zip -d /tmp/
    mv /tmp/ffmpeg "$BINARIES_DIR/ffmpeg-x86_64-apple-darwin"
    chmod +x "$BINARIES_DIR/ffmpeg-x86_64-apple-darwin"
    rm /tmp/ffmpeg-macos-x64.zip
fi

if [ ! -f "$BINARIES_DIR/ffprobe-x86_64-apple-darwin" ]; then
    echo "Downloading FFprobe for macOS x86_64..."
    curl -L https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip -o /tmp/ffprobe-macos-x64.zip
    unzip -o /tmp/ffprobe-macos-x64.zip -d /tmp/
    mv /tmp/ffprobe "$BINARIES_DIR/ffprobe-x86_64-apple-darwin"
    chmod +x "$BINARIES_DIR/ffprobe-x86_64-apple-darwin"
    rm /tmp/ffprobe-macos-x64.zip
fi

# Windows x86_64
if [ ! -f "$BINARIES_DIR/ffmpeg-x86_64-pc-windows-msvc.exe" ] || [ ! -f "$BINARIES_DIR/ffprobe-x86_64-pc-windows-msvc.exe" ]; then
    echo "Downloading FFmpeg for Windows x86_64..."

    # Get the latest release URL
    FFMPEG_WIN_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"

    curl -L "$FFMPEG_WIN_URL" -o /tmp/ffmpeg-win64.zip
    unzip -o /tmp/ffmpeg-win64.zip -d /tmp/

    # The extracted directory name
    FFMPEG_WIN_DIR="/tmp/ffmpeg-master-latest-win64-gpl"

    if [ -d "$FFMPEG_WIN_DIR" ] && [ -f "$FFMPEG_WIN_DIR/bin/ffmpeg.exe" ]; then
        # Copy and rename the binaries
        cp "$FFMPEG_WIN_DIR/bin/ffmpeg.exe" "$BINARIES_DIR/ffmpeg-x86_64-pc-windows-msvc.exe"
        cp "$FFMPEG_WIN_DIR/bin/ffprobe.exe" "$BINARIES_DIR/ffprobe-x86_64-pc-windows-msvc.exe"

        # Clean up
        rm -rf "$FFMPEG_WIN_DIR"
        rm /tmp/ffmpeg-win64.zip

        echo "Windows binaries downloaded successfully!"
    else
        echo "Warning: Could not find extracted FFmpeg directory at $FFMPEG_WIN_DIR"
        echo "You may need to download Windows binaries manually from:"
        echo "https://github.com/BtbN/FFmpeg-Builds/releases"
    fi
else
    echo "Windows binaries already exist, skipping download..."
fi

echo ""
echo "All binaries downloaded successfully!"
echo "Binary sizes:"
ls -lh "$BINARIES_DIR/"
