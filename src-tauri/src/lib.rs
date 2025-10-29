// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_dialog::DialogExt;
use tauri::Emitter;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use std::path::PathBuf;

// Global state to track recording processes
lazy_static::lazy_static! {
    static ref RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    static ref CAMERA_RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    static ref SCREEN_PREVIEW_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
}

// Helper function to get the FFmpeg binary path
// In dev mode, use system FFmpeg from PATH
// In production, use bundled FFmpeg sidecar
fn get_ffmpeg_path() -> PathBuf {
    // Check if we're in dev mode by looking for TAURI_DEV env var
    if std::env::var("TAURI_DEV").is_ok() {
        // Dev mode: use system FFmpeg
        PathBuf::from("ffmpeg")
    } else {
        // Production mode: look for bundled sidecar binary
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // Tauri places sidecar binaries in the same directory as the executable
                #[cfg(target_os = "windows")]
                let ffmpeg_name = "ffmpeg.exe";

                #[cfg(not(target_os = "windows"))]
                let ffmpeg_name = "ffmpeg";

                let sidecar_path = exe_dir.join(ffmpeg_name);
                if sidecar_path.exists() {
                    return sidecar_path;
                }
            }
        }

        // Fallback to system FFmpeg if bundled version not found
        PathBuf::from("ffmpeg")
    }
}

// Helper function to get the FFprobe binary path
fn get_ffprobe_path() -> PathBuf {
    if std::env::var("TAURI_DEV").is_ok() {
        PathBuf::from("ffprobe")
    } else {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                #[cfg(target_os = "windows")]
                let ffprobe_name = "ffprobe.exe";

                #[cfg(not(target_os = "windows"))]
                let ffprobe_name = "ffprobe";

                let sidecar_path = exe_dir.join(ffprobe_name);
                if sidecar_path.exists() {
                    return sidecar_path;
                }
            }
        }

        PathBuf::from("ffprobe")
    }
}

// Recording options structure
#[derive(Debug, Deserialize)]
struct RecordingOptions {
    resolution: String, // "720p", "1080p", or "source"
    #[serde(default)]
    source_width: Option<i32>,
    #[serde(default)]
    source_height: Option<i32>,
    #[serde(default)]
    audio_device: Option<String>, // Optional audio device name (Windows only)
}

#[derive(Debug, Serialize)]
struct ScreenResolution {
    width: i32,
    height: i32,
}

#[derive(Debug, Serialize)]
struct CameraCapabilities {
    native_width: i32,
    native_height: i32,
    supported_resolutions: Vec<String>,
}

#[derive(Debug, Serialize)]
struct AudioVideoDevices {
    video_devices: Vec<String>,
    audio_devices: Vec<String>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Deserialize)]
struct ExportOptions {
    resolution: Option<String>, // "720p", "1080p", or "source"
    #[serde(default)]
    source_width: Option<i32>,
    #[serde(default)]
    source_height: Option<i32>,
}

#[derive(Debug, Deserialize, Clone)]
struct TrackExportData {
    path: String,
    position_x: i32,
    position_y: i32,
    volume: f64,      // 0.0 to 1.0
    opacity: f64,     // 0.0 to 1.0
    width: i32,
    height: i32,
    z_index: i32,
}

#[derive(Debug, Deserialize)]
struct CompositeExportOptions {
    resolution: Option<String>,
    #[serde(default)]
    source_width: Option<i32>,
    #[serde(default)]
    source_height: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct ClipSegment {
    path: String,
    #[serde(rename = "clipStart")]
    clip_start: f64,
    #[serde(rename = "clipEnd")]
    clip_end: f64,
}

#[derive(Debug, Deserialize, Clone)]
struct PipTrackData {
    path: String,
    offset: f64,        // Start time in seconds
    duration: f64,      // Duration in seconds
    volume: f64,        // 0.0 to 1.0
    position: String,   // "top-left", "top-right", "bottom-left", "bottom-right"
    size_percent: f64,  // 25, 33, or 50
}

#[tauri::command]
async fn trim_video(
    input_path: String,
    output_path: String,
    start_time: f64,
    end_time: f64,
    export_options: Option<ExportOptions>,
    _window: tauri::Window
) -> Result<String, String> {
    println!("[trim_video] Starting trim operation");
    println!("[trim_video] Input: {}", input_path);
    println!("[trim_video] Output: {}", output_path);
    println!("[trim_video] Start time: {}", start_time);
    println!("[trim_video] End time: {}", end_time);

    // Format time as HH:MM:SS.mmm
    fn format_time(seconds: f64) -> String {
        let hours = (seconds / 3600.0).floor() as u32;
        let minutes = ((seconds % 3600.0) / 60.0).floor() as u32;
        let secs = seconds % 60.0;
        format!("{:02}:{:02}:{:06.3}", hours, minutes, secs)
    }

    let start_str = format_time(start_time);
    let duration = end_time - start_time;
    println!("[trim_video] Start string: {}", start_str);
    println!("[trim_video] Duration: {}", duration);

    // Parse export options
    let opts = export_options.unwrap_or_else(|| ExportOptions {
        resolution: Some("source".to_string()),
        source_width: None,
        source_height: None,
    });

    // Determine resolution and bitrate for export
    let (should_scale, scale_filter, bitrate) = match opts.resolution.as_deref() {
        Some("720p") => {
            println!("[trim_video] Exporting at 720p resolution");
            (true, "scale=1280:720", "2500k")
        }
        Some("1080p") => {
            println!("[trim_video] Exporting at 1080p resolution");
            (true, "scale=1920:1080", "5000k")
        }
        Some("source") | None => {
            println!("[trim_video] Exporting at source resolution (no scaling)");
            (false, "", "8000k")
        }
        Some(res) => {
            return Err(format!("Invalid resolution: {}", res));
        }
    };

    // Build FFmpeg arguments
    let mut args = vec![
        "-y".to_string(),                        // Overwrite output file
        "-ss".to_string(), start_str,            // Start time
        "-i".to_string(), input_path,            // Input file
        "-t".to_string(), duration.to_string(),  // Duration
    ];

    // Add video filter if scaling is needed
    if should_scale {
        args.push("-vf".to_string());
        args.push(scale_filter.to_string());
    }

    // Add encoding options
    if should_scale {
        // Re-encode when scaling
        args.push("-c:v".to_string());
        args.push("libx264".to_string());
        args.push("-preset".to_string());
        args.push("fast".to_string());
        args.push("-b:v".to_string());
        args.push(bitrate.to_string());
    } else {
        // Copy codec for source resolution (fast)
        args.push("-c".to_string());
        args.push("copy".to_string());
    }

    args.push("-avoid_negative_ts".to_string());
    args.push("make_zero".to_string());
    args.push(output_path.clone());

    println!("[trim_video] FFmpeg args: {:?}", args);

    // FFmpeg command - don't capture stderr to avoid blocking
    println!("[trim_video] Spawning FFmpeg process (without stderr capture)...");
    let ffmpeg_path = get_ffmpeg_path();
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .spawn()
        .map_err(|e| {
            let err_msg = format!("Failed to start FFmpeg: {}", e);
            println!("[trim_video] ERROR: {}", err_msg);
            err_msg
        })?;

    // Wait for FFmpeg to finish without blocking the main thread
    println!("[trim_video] Waiting for FFmpeg to complete...");
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|e| {
            let err_msg = format!("Task join error: {}", e);
            println!("[trim_video] ERROR: {}", err_msg);
            err_msg
        })?
        .map_err(|e| {
            let err_msg = format!("Failed to wait for FFmpeg: {}", e);
            println!("[trim_video] ERROR: {}", err_msg);
            err_msg
        })?;

    if status.success() {
        println!("[trim_video] FFmpeg completed successfully!");
        println!("[trim_video] Output file: {}", output_path);
        Ok(output_path)
    } else {
        let err_msg = format!("FFmpeg exited with status: {}", status);
        println!("[trim_video] ERROR: {}", err_msg);
        Err(err_msg)
    }
}

#[tauri::command]
async fn concatenate_clips(
    clips: Vec<ClipSegment>,
    output_path: String,
    export_options: Option<ExportOptions>,
    pip_track: Option<PipTrackData>,
    _window: tauri::Window
) -> Result<String, String> {
    println!("[concatenate_clips] Starting concatenation of {} clips", clips.len());
    println!("[concatenate_clips] Output: {}", output_path);
    if let Some(ref pip) = pip_track {
        println!("[concatenate_clips] PiP track: {} (offset: {}s, duration: {}s, position: {})",
            pip.path, pip.offset, pip.duration, pip.position);
    }

    if clips.is_empty() {
        return Err("No clips provided for concatenation".to_string());
    }

    // Parse export options
    let opts = export_options.unwrap_or_else(|| ExportOptions {
        resolution: Some("source".to_string()),
        source_width: None,
        source_height: None,
    });

    // Format time as HH:MM:SS.mmm
    fn format_time(seconds: f64) -> String {
        let hours = (seconds / 3600.0).floor() as u32;
        let minutes = ((seconds % 3600.0) / 60.0).floor() as u32;
        let secs = seconds % 60.0;
        format!("{:02}:{:02}:{:06.3}", hours, minutes, secs)
    }

    // Create a temporary directory for intermediate files
    let temp_dir = std::env::temp_dir().join(format!("clipforge_{}", std::process::id()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Process each clip segment
    let mut segment_paths = Vec::new();
    for (i, clip) in clips.iter().enumerate() {
        println!("[concatenate_clips] Processing clip {}: {} ({}s to {}s)",
            i, clip.path, clip.clip_start, clip.clip_end);

        let segment_path = temp_dir.join(format!("segment_{}.mp4", i));
        let start_str = format_time(clip.clip_start);
        let duration = clip.clip_end - clip.clip_start;

        // Build ffmpeg command to extract this segment
        let mut ffmpeg_args = vec![
            "-y".to_string(),
            "-ss".to_string(), start_str,
            "-i".to_string(), clip.path.clone(),
            "-t".to_string(), format_time(duration),
            "-c:v".to_string(), "libx264".to_string(),
            "-preset".to_string(), "fast".to_string(),
            "-crf".to_string(), "18".to_string(),
            "-c:a".to_string(), "aac".to_string(),
            "-b:a".to_string(), "192k".to_string(),
        ];

        // Handle resolution settings
        match opts.resolution.as_deref() {
            Some("source") => {},
            Some("720p") => {
                ffmpeg_args.extend(vec!["-vf".to_string(), "scale=-2:720".to_string()]);
            },
            Some("1080p") => {
                ffmpeg_args.extend(vec!["-vf".to_string(), "scale=-2:1080".to_string()]);
            },
            _ => {}
        }

        ffmpeg_args.push(segment_path.to_str().unwrap().to_string());

        println!("[concatenate_clips] FFmpeg args for segment {}: {:?}", i, ffmpeg_args);

        let ffmpeg_path = get_ffmpeg_path();
        let status = Command::new(&ffmpeg_path)
            .args(&ffmpeg_args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

        if !status.success() {
            // Clean up temp directory
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(format!("FFmpeg failed to process segment {}", i));
        }

        segment_paths.push(segment_path);
    }

    // Create concat list file
    let concat_list_path = temp_dir.join("concat_list.txt");
    let concat_content = segment_paths
        .iter()
        .map(|p| format!("file '{}'", p.to_str().unwrap()))
        .collect::<Vec<_>>()
        .join("\n");

    std::fs::write(&concat_list_path, concat_content)
        .map_err(|e| format!("Failed to write concat list: {}", e))?;

    println!("[concatenate_clips] Concatenating segments into final output");

    // If no PiP track, use simple concat
    if pip_track.is_none() {
        let concat_args = vec![
            "-y".to_string(),
            "-f".to_string(), "concat".to_string(),
            "-safe".to_string(), "0".to_string(),
            "-i".to_string(), concat_list_path.to_str().unwrap().to_string(),
            "-c".to_string(), "copy".to_string(),
            output_path.clone(),
        ];

        println!("[concatenate_clips] Final concat args (no PiP): {:?}", concat_args);

        let ffmpeg_path = get_ffmpeg_path();
        let status = Command::new(&ffmpeg_path)
            .args(&concat_args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("Failed to execute FFmpeg for concatenation: {}", e))?;

        // Clean up temp directory
        let _ = std::fs::remove_dir_all(&temp_dir);

        if status.success() {
            println!("[concatenate_clips] Concatenation completed successfully");
            return Ok(output_path);
        } else {
            return Err("FFmpeg concatenation failed".to_string());
        }
    }

    // With PiP track, we need to apply overlay filter
    let pip = pip_track.unwrap();

    // Calculate position based on corner and size
    let overlay_position = match pip.position.as_str() {
        "top-left" => "20:20",
        "top-right" => "main_w-overlay_w-20:20",
        "bottom-left" => "20:main_h-overlay_h-20",
        "bottom-right" => "main_w-overlay_w-20:main_h-overlay_h-20",
        _ => "main_w-overlay_w-20:main_h-overlay_h-20", // Default to bottom-right
    };

    // Calculate PiP size (as a fraction of main video width)
    let pip_scale = format!("iw*{}:ih*{}", pip.size_percent / 100.0, pip.size_percent / 100.0);

    // Build complex filter for PiP overlay
    let filter_complex = format!(
        "[1:v]scale={}[pip];[0:v][pip]overlay={}:enable='between(t,{},{})'[v];[0:a][1:a]amix=inputs=2:duration=first:weights={} {}[a]",
        pip_scale,
        overlay_position,
        pip.offset,
        pip.offset + pip.duration,
        1.0, // Main audio at full volume
        pip.volume // PiP audio at specified volume
    );

    println!("[concatenate_clips] PiP overlay filter: {}", filter_complex);

    // First, concatenate the main clips without PiP
    let temp_concat_path = temp_dir.join("temp_concat.mp4");
    let concat_args = vec![
        "-y".to_string(),
        "-f".to_string(), "concat".to_string(),
        "-safe".to_string(), "0".to_string(),
        "-i".to_string(), concat_list_path.to_str().unwrap().to_string(),
        "-c".to_string(), "copy".to_string(),
        temp_concat_path.to_str().unwrap().to_string(),
    ];

    println!("[concatenate_clips] Creating temp concat (before PiP): {:?}", concat_args);

    let ffmpeg_path = get_ffmpeg_path();
    let status = Command::new(&ffmpeg_path)
        .args(&concat_args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to execute FFmpeg for temp concatenation: {}", e))?;

    if !status.success() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err("FFmpeg temp concatenation failed".to_string());
    }

    // Now apply PiP overlay
    let pip_args = vec![
        "-y".to_string(),
        "-i".to_string(), temp_concat_path.to_str().unwrap().to_string(),
        "-i".to_string(), pip.path.clone(),
        "-filter_complex".to_string(), filter_complex,
        "-map".to_string(), "[v]".to_string(),
        "-map".to_string(), "[a]".to_string(),
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "fast".to_string(),
        "-crf".to_string(), "18".to_string(),
        "-c:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), "192k".to_string(),
        output_path.clone(),
    ];

    println!("[concatenate_clips] Applying PiP overlay: {:?}", pip_args);

    let ffmpeg_path = get_ffmpeg_path();
    let status = Command::new(&ffmpeg_path)
        .args(&pip_args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to execute FFmpeg for PiP overlay: {}", e))?;

    // Clean up temp directory
    let _ = std::fs::remove_dir_all(&temp_dir);

    if status.success() {
        println!("[concatenate_clips] PiP overlay completed successfully");
        Ok(output_path)
    } else {
        Err("FFmpeg PiP overlay failed".to_string())
    }
}

#[tauri::command]
async fn save_file_dialog(default_filename: String, app: tauri::AppHandle) -> Result<String, String> {
    println!("[save_file_dialog] Opening save dialog");
    println!("[save_file_dialog] Default filename: {}", default_filename);

    // Use spawn_blocking to avoid blocking the main thread
    let file_path = tokio::task::spawn_blocking(move || {
        app
            .dialog()
            .file()
            .set_file_name(&default_filename)
            .add_filter("Video Files", &["mp4"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            println!("[save_file_dialog] File selected: {}", path_str);
            Ok(path_str)
        },
        None => {
            println!("[save_file_dialog] No file selected (user cancelled)");
            Err("No file selected".to_string())
        },
    }
}

#[tauri::command]
async fn open_file_dialog(app: tauri::AppHandle) -> Result<String, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Video Files", &["mp4", "mov"])
        .blocking_pick_file();

    match file_path {
        Some(path) => Ok(path.to_string()),
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
fn get_video_metadata(video_path: String) -> Result<String, String> {
    use std::process::Command;

    // Run ffprobe to get video metadata as JSON
    let ffprobe_path = get_ffprobe_path();
    let output = Command::new(&ffprobe_path)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &video_path
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFprobe error: {}", error));
    }

    let json = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(json)
}

#[tauri::command]
fn get_video_file(video_path: &str) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(video_path)
        .map_err(|e| format!("Failed to read video file: {}", e))
}

#[tauri::command]
fn get_video_file_path(video_path: String) -> Result<String, String> {
    // Validate path exists
    let path = std::path::Path::new(&video_path);
    if !path.exists() {
        return Err(format!("Video file not found: {}", video_path));
    }

    // Return absolute path
    match path.canonicalize() {
        Ok(canonical_path) => Ok(canonical_path.to_string_lossy().to_string()),
        Err(e) => Err(format!("Failed to resolve path: {}", e))
    }
}

#[tauri::command]
fn start_screen_recording(
    output_path: String,
    options: Option<RecordingOptions>,
    _window: tauri::Window
) -> Result<String, String> {
    println!("[start_screen_recording] Starting screen recording");
    println!("[start_screen_recording] Output path: {}", output_path);

    // Parse resolution options
    let opts = options.unwrap_or_else(|| RecordingOptions {
        resolution: "720p".to_string(),
        source_width: None,
        source_height: None,
        audio_device: None,
    });

    // Determine resolution and bitrate
    let (width, height, bitrate) = match opts.resolution.as_str() {
        "720p" => (1280, 720, "2500k"),
        "1080p" => (1920, 1080, "5000k"),
        "source" => {
            if let (Some(w), Some(h)) = (opts.source_width, opts.source_height) {
                (w, h, "8000k")
            } else {
                return Err("Source resolution not available".to_string());
            }
        }
        _ => return Err(format!("Invalid resolution: {}", opts.resolution)),
    };

    println!("[start_screen_recording] Resolution: {}x{} @ {} bitrate", width, height, bitrate);
    if opts.audio_device.is_some() {
        println!("[start_screen_recording] Audio device: {:?}", opts.audio_device);
    }

    // Platform-specific FFmpeg arguments
    let scale_filter = format!("scale={}:{}", width, height);

    // Prepare Windows input string (if needed) before args to ensure proper lifetime
    let windows_audio_input = if cfg!(target_os = "windows") {
        if let Some(audio_dev) = &opts.audio_device {
            format!("audio={}", audio_dev)
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let args = if cfg!(target_os = "macos") {
        // macOS: avfoundation supports audio input
        // Format: "1:0" means screen device 1, audio device 0 (default microphone)
        let mut args = vec![
            "-f".to_string(), "avfoundation".to_string(),
            "-framerate".to_string(), "30".to_string(),
        ];

        if opts.audio_device.is_some() {
            // Include audio: screen (1) and microphone (0)
            args.push("-i".to_string());
            args.push("1:0".to_string());
        } else {
            // Video only
            args.push("-i".to_string());
            args.push("1".to_string());
        }

        args.push("-vf".to_string());
        args.push(scale_filter.clone());
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
        args.push("-c:v".to_string());
        args.push("libx264".to_string());
        args.push("-preset".to_string());
        args.push("ultrafast".to_string());
        args.push("-b:v".to_string());
        args.push(bitrate.to_string());

        // Add audio encoding if audio device is specified
        if opts.audio_device.is_some() {
            args.push("-c:a".to_string());
            args.push("aac".to_string());
            args.push("-b:a".to_string());
            args.push("192k".to_string());
        }

        args.push(output_path.clone());
        args
    } else if cfg!(target_os = "windows") {
        // Windows: Use gdigrab for screen + dshow for audio (if specified)
        let mut args = vec![
            "-f".to_string(), "gdigrab".to_string(),
            "-framerate".to_string(), "30".to_string(),
            "-i".to_string(), "desktop".to_string(),
        ];

        // Add audio input if specified
        if let Some(_) = &opts.audio_device {
            args.push("-f".to_string());
            args.push("dshow".to_string());
            args.push("-i".to_string());
            args.push(windows_audio_input.clone());
        }

        args.push("-vf".to_string());
        args.push(scale_filter.clone());
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
        args.push("-c:v".to_string());
        args.push("libx264".to_string());
        args.push("-preset".to_string());
        args.push("ultrafast".to_string());
        args.push("-b:v".to_string());
        args.push(bitrate.to_string());

        // Add audio encoding if audio device is specified
        if opts.audio_device.is_some() {
            args.push("-c:a".to_string());
            args.push("aac".to_string());
            args.push("-b:a".to_string());
            args.push("192k".to_string());
        }

        args.push(output_path.clone());
        args
    } else {
        return Err("Unsupported platform".to_string());
    };

    println!("[start_screen_recording] FFmpeg args: {:?}", args);

    // Start FFmpeg process with stdin pipe for graceful shutdown
    let ffmpeg_path = get_ffmpeg_path();
    let child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}. Make sure you have granted screen recording permissions.", e))?;

    println!("[start_screen_recording] FFmpeg process started");

    // Store process in global state
    let mut process = RECORDING_PROCESS.lock().unwrap();
    *process = Some(child);

    Ok("Recording started".to_string())
}

#[tauri::command]
fn stop_screen_recording() -> Result<String, String> {
    use std::io::Write;

    println!("[stop_screen_recording] Stopping screen recording");

    let mut process = RECORDING_PROCESS.lock().unwrap();

    if let Some(mut child) = process.take() {
        // Send 'q' to FFmpeg stdin to gracefully stop
        if let Some(mut stdin) = child.stdin.take() {
            println!("[stop_screen_recording] Sending 'q' to FFmpeg to stop gracefully");
            if let Err(e) = stdin.write_all(b"q") {
                println!("[stop_screen_recording] Warning: Failed to send 'q' to FFmpeg: {}", e);
                // Fall back to kill if we can't write to stdin
                child.kill()
                    .map_err(|e| format!("Failed to stop recording: {}", e))?;
            } else {
                // Flush to ensure 'q' is sent
                let _ = stdin.flush();
                drop(stdin); // Close stdin
            }
        } else {
            println!("[stop_screen_recording] No stdin available, using kill");
            child.kill()
                .map_err(|e| format!("Failed to stop recording: {}", e))?;
        }

        // Wait for FFmpeg to finish encoding
        println!("[stop_screen_recording] Waiting for FFmpeg to finish encoding...");
        child.wait()
            .map_err(|e| format!("Failed to wait for FFmpeg: {}", e))?;

        println!("[stop_screen_recording] Recording stopped successfully");
        Ok("Recording stopped".to_string())
    } else {
        Err("No recording in progress".to_string())
    }
}

#[tauri::command]
fn is_recording() -> bool {
    let process = RECORDING_PROCESS.lock().unwrap();
    process.is_some()
}

#[tauri::command]
fn start_screen_preview(window: tauri::Window) -> Result<String, String> {
    use std::io::Read;
    use std::thread;

    println!("[start_screen_preview] Starting screen preview");

    // Check if preview is already running
    let mut process = SCREEN_PREVIEW_PROCESS.lock().unwrap();
    if process.is_some() {
        return Err("Preview already running".to_string());
    }

    // Platform-specific FFmpeg arguments for preview
    // Use lower quality and framerate for preview
    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "15",          // Lower framerate for preview
            "-video_size", "640x360",    // Lower resolution for preview
            "-i", "1",                    // Screen capture (1 = main display)
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "-q:v", "10",                 // JPEG quality (2-31, lower is better)
            "-"                           // Output to stdout
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "-f", "gdigrab",
            "-framerate", "15",
            "-video_size", "640x360",
            "-i", "desktop",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "-q:v", "10",
            "-"
        ]
    } else {
        return Err("Unsupported platform".to_string());
    };

    println!("[start_screen_preview] FFmpeg args: {:?}", args);

    // Start FFmpeg process with stdout piped
    let ffmpeg_path = get_ffmpeg_path();
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start preview: {}", e))?;

    // Get stdout handle
    let mut stdout = child.stdout.take()
        .ok_or("Failed to get stdout")?;

    println!("[start_screen_preview] FFmpeg process started, spawning reader thread");

    // Spawn a thread to read frames and emit events
    thread::spawn(move || {
        let mut buffer = Vec::new();
        let mut temp_buf = [0u8; 8192];
        let jpeg_start = [0xFF, 0xD8]; // JPEG start marker
        let jpeg_end = [0xFF, 0xD9];   // JPEG end marker

        loop {
            match stdout.read(&mut temp_buf) {
                Ok(0) => {
                    println!("[start_screen_preview] EOF reached, stopping preview thread");
                    break;
                }
                Ok(n) => {
                    buffer.extend_from_slice(&temp_buf[..n]);

                    // Look for complete JPEG frames
                    while let Some(start_pos) = buffer.windows(2).position(|w| w == jpeg_start) {
                        if start_pos > 0 {
                            // Remove any data before the JPEG start
                            buffer.drain(..start_pos);
                        }

                        // Look for JPEG end marker
                        if let Some(end_pos) = buffer.windows(2).position(|w| w == jpeg_end) {
                            // Extract complete JPEG frame (including end marker)
                            let frame_data = buffer.drain(..(end_pos + 2)).collect::<Vec<u8>>();

                            // Encode as base64 and emit event
                            let base64_frame = general_purpose::STANDARD.encode(&frame_data);
                            let _ = window.emit("screen-preview-frame", base64_frame);
                        } else {
                            // No end marker yet, wait for more data
                            break;
                        }
                    }
                }
                Err(e) => {
                    println!("[start_screen_preview] Error reading stdout: {}", e);
                    break;
                }
            }
        }
    });

    *process = Some(child);
    Ok("Preview started".to_string())
}

#[tauri::command]
fn stop_screen_preview() -> Result<String, String> {
    println!("[stop_screen_preview] Stopping screen preview");

    let mut process = SCREEN_PREVIEW_PROCESS.lock().unwrap();

    if let Some(mut child) = process.take() {
        child.kill()
            .map_err(|e| format!("Failed to stop preview: {}", e))?;

        child.wait()
            .map_err(|e| format!("Failed to wait for preview: {}", e))?;

        println!("[stop_screen_preview] Preview stopped successfully");
        Ok("Preview stopped".to_string())
    } else {
        Err("No preview running".to_string())
    }
}

#[tauri::command]
fn start_camera_recording(
    output_path: String,
    options: Option<RecordingOptions>,
    _window: tauri::Window
) -> Result<String, String> {
    println!("[start_camera_recording] Starting camera recording");
    println!("[start_camera_recording] Output path: {}", output_path);

    // Parse resolution options
    let opts = options.unwrap_or_else(|| RecordingOptions {
        resolution: "720p".to_string(),
        source_width: None,
        source_height: None,
        audio_device: None,
    });

    // Determine resolution and bitrate
    let (width, height, bitrate) = match opts.resolution.as_str() {
        "720p" => (1280, 720, "2500k"),
        "1080p" => (1920, 1080, "5000k"),
        "source" => {
            if let (Some(w), Some(h)) = (opts.source_width, opts.source_height) {
                (w, h, "8000k")
            } else {
                return Err("Source resolution not available".to_string());
            }
        }
        _ => return Err(format!("Invalid resolution: {}", opts.resolution)),
    };

    println!("[start_camera_recording] Resolution: {}x{} @ {} bitrate", width, height, bitrate);

    // Platform-specific FFmpeg arguments for camera
    let resolution_str = format!("{}x{}", width, height);

    // Prepare Windows input string (if needed) before args to ensure proper lifetime
    let windows_input_str = if cfg!(target_os = "windows") {
        if let Some(audio_dev) = &opts.audio_device {
            format!("video=Integrated Camera:audio={}", audio_dev)
        } else {
            "video=Integrated Camera".to_string()
        }
    } else {
        String::new()
    };

    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-video_size", &resolution_str,
            "-i", "0:0",            // Camera device (0 = default camera, 0 = default microphone)
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            "-c:a", "aac",          // Audio codec
            "-b:a", "192k",         // Audio bitrate
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        let mut args = vec![
            "-f", "dshow",
            "-framerate", "30",
            "-video_size", &resolution_str,
            "-i", &windows_input_str,
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
        ];

        // Add audio codec parameters if audio device is provided
        if opts.audio_device.is_some() {
            args.push("-c:a");
            args.push("aac");
            args.push("-b:a");
            args.push("192k");
        }

        args.push(&output_path);
        args
    } else {
        return Err("Unsupported platform".to_string());
    };

    println!("[start_camera_recording] FFmpeg args: {:?}", args);

    // Start FFmpeg process with stdin pipe for graceful shutdown
    let ffmpeg_path = get_ffmpeg_path();
    let child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to start camera recording: {}. Make sure camera is not in use by another app.",
                e
            )
        })?;

    println!("[start_camera_recording] FFmpeg process started");

    // Store process
    let mut process = CAMERA_RECORDING_PROCESS.lock().unwrap();
    *process = Some(child);

    Ok("Camera recording started".to_string())
}

#[tauri::command]
fn stop_camera_recording() -> Result<String, String> {
    use std::io::Write;

    println!("[stop_camera_recording] Stopping camera recording");

    let mut process = CAMERA_RECORDING_PROCESS.lock().unwrap();

    if let Some(mut child) = process.take() {
        // Send 'q' to FFmpeg stdin to gracefully stop
        if let Some(mut stdin) = child.stdin.take() {
            println!("[stop_camera_recording] Sending 'q' to FFmpeg to stop gracefully");
            if let Err(e) = stdin.write_all(b"q") {
                println!("[stop_camera_recording] Warning: Failed to send 'q' to FFmpeg: {}", e);
                child.kill()
                    .map_err(|e| format!("Failed to stop camera recording: {}", e))?;
            } else {
                let _ = stdin.flush();
                drop(stdin);
            }
        } else {
            println!("[stop_camera_recording] No stdin available, using kill");
            child.kill()
                .map_err(|e| format!("Failed to stop camera recording: {}", e))?;
        }

        println!("[stop_camera_recording] Waiting for FFmpeg to finish encoding...");
        child.wait()
            .map_err(|e| format!("Failed to wait for FFmpeg: {}", e))?;

        println!("[stop_camera_recording] Camera recording stopped successfully");
        Ok("Camera recording stopped".to_string())
    } else {
        Err("No camera recording in progress".to_string())
    }
}

#[tauri::command]
fn is_camera_recording() -> bool {
    let process = CAMERA_RECORDING_PROCESS.lock().unwrap();
    process.is_some()
}

#[tauri::command]
fn get_screen_resolution() -> Result<ScreenResolution, String> {
    // Note: These are default values. In a production app, you might want to query
    // the actual screen resolution using platform-specific APIs.
    // For now, returning common defaults that work with scaling filters
    Ok(ScreenResolution {
        width: 1920,
        height: 1080,
    })
}

#[tauri::command]
fn get_camera_capabilities() -> Result<CameraCapabilities, String> {
    // Note: These are default values. Camera capabilities vary by device.
    // Supported resolutions should match what's being used in the recording commands.
    Ok(CameraCapabilities {
        native_width: 1920,
        native_height: 1080,
        supported_resolutions: vec!["720p".to_string(), "1080p".to_string(), "source".to_string()],
    })
}

#[tauri::command]
fn list_audio_video_devices() -> Result<AudioVideoDevices, String> {
    if cfg!(target_os = "windows") {
        // On Windows, use FFmpeg to list DirectShow devices
        let ffmpeg_path = get_ffmpeg_path();
        let output = Command::new(&ffmpeg_path)
            .args(&["-list_devices", "true", "-f", "dshow", "-i", "dummy"])
            .output()
            .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

        // FFmpeg outputs device list to stderr
        let stderr = String::from_utf8_lossy(&output.stderr);
        let mut video_devices = Vec::new();
        let mut audio_devices = Vec::new();
        let mut in_video_section = false;
        let mut in_audio_section = false;

        for line in stderr.lines() {
            if line.contains("DirectShow video devices") {
                in_video_section = true;
                in_audio_section = false;
            } else if line.contains("DirectShow audio devices") {
                in_video_section = false;
                in_audio_section = true;
            } else if line.starts_with("[dshow") && line.contains("\"") {
                // Extract device name from lines like: [dshow @ ...] "Device Name"
                if let Some(start) = line.find('"') {
                    if let Some(end) = line[start + 1..].find('"') {
                        let device_name = &line[start + 1..start + 1 + end];
                        if in_video_section {
                            video_devices.push(device_name.to_string());
                        } else if in_audio_section {
                            audio_devices.push(device_name.to_string());
                        }
                    }
                }
            }
        }

        Ok(AudioVideoDevices {
            video_devices,
            audio_devices,
        })
    } else if cfg!(target_os = "macos") {
        // On macOS, use FFmpeg to list AVFoundation devices
        let ffmpeg_path = get_ffmpeg_path();
        let output = Command::new(&ffmpeg_path)
            .args(&["-f", "avfoundation", "-list_devices", "true", "-i", ""])
            .output()
            .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

        // FFmpeg outputs device list to stderr
        let stderr = String::from_utf8_lossy(&output.stderr);
        let mut video_devices = Vec::new();
        let mut audio_devices = Vec::new();

        for line in stderr.lines() {
            if line.contains("[AVFoundation") && line.contains("]") {
                // Extract device info from lines like: [AVFoundation indev @ ...] [0] FaceTime HD Camera
                // Find the first closing bracket, then look for the second opening bracket
                if let Some(first_close) = line.find(']') {
                    let remaining = &line[first_close + 1..];
                    if let Some(second_open) = remaining.find('[') {
                        if let Some(second_close) = remaining[second_open..].find(']') {
                            // Device name is after the second closing bracket
                            let device_start = first_close + 1 + second_open + second_close + 1;
                            if device_start < line.len() {
                                let device_name = line[device_start..].trim();
                                if !device_name.is_empty() {
                                    if line.contains("video device") || !line.contains("audio device") {
                                        video_devices.push(device_name.to_string());
                                    } else if line.contains("audio device") {
                                        audio_devices.push(device_name.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(AudioVideoDevices {
            video_devices,
            audio_devices,
        })
    } else {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
fn move_file(from: String, to: String) -> Result<String, String> {
    use std::fs;
    println!("[move_file] Moving file from {} to {}", from, to);

    fs::rename(&from, &to)
        .map_err(|e| format!("Failed to move file: {}", e))?;

    println!("[move_file] File moved successfully");
    Ok("File moved".to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<String, String> {
    use std::fs;
    println!("[delete_file] Deleting file: {}", path);

    fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete file: {}", e))?;

    println!("[delete_file] File deleted successfully");
    Ok("File deleted".to_string())
}

#[tauri::command]
async fn export_composite_video(
    output_path: String,
    tracks: Vec<TrackExportData>,
    canvas_width: i32,
    canvas_height: i32,
    export_options: Option<CompositeExportOptions>,
    _window: tauri::Window
) -> Result<String, String> {
    println!("[export_composite_video] Starting composite export");
    println!("[export_composite_video] Output: {}", output_path);
    println!("[export_composite_video] Canvas size: {}x{}", canvas_width, canvas_height);
    println!("[export_composite_video] Tracks: {}", tracks.len());

    if tracks.is_empty() {
        return Err("No tracks to export".to_string());
    }

    // Parse export options
    let opts = export_options.unwrap_or_else(|| CompositeExportOptions {
        resolution: Some("source".to_string()),
        source_width: Some(canvas_width),
        source_height: Some(canvas_height),
    });

    // Determine output resolution and bitrate
    let (output_width, output_height, bitrate) = match opts.resolution.as_deref() {
        Some("720p") => {
            println!("[export_composite_video] Exporting at 720p resolution");
            (1280, 720, "2500k")
        }
        Some("1080p") => {
            println!("[export_composite_video] Exporting at 1080p resolution");
            (1920, 1080, "5000k")
        }
        Some("source") | None => {
            println!("[export_composite_video] Exporting at source resolution");
            (canvas_width, canvas_height, "8000k")
        }
        Some(res) => {
            return Err(format!("Invalid resolution: {}", res));
        }
    };

    // Sort tracks by z-index (lower first, so they appear at bottom)
    let mut sorted_tracks = tracks.clone();
    sorted_tracks.sort_by_key(|t| t.z_index);

    // Build FFmpeg filter graph
    let mut filter_parts = Vec::new();
    let mut overlay_chain = String::new();

    // Create a black background canvas
    filter_parts.push(format!(
        "color=c=black:s={}x{}:d=30[bg]",
        output_width, output_height
    ));

    // Process each video track
    for (i, track) in sorted_tracks.iter().enumerate() {
        // Scale video to fit output resolution while maintaining aspect ratio
        let scale_x = output_width as f64 / canvas_width as f64;
        let scale_y = output_height as f64 / canvas_height as f64;

        let scaled_width = (track.width as f64 * scale_x) as i32;
        let scaled_height = (track.height as f64 * scale_y) as i32;
        let scaled_x = (track.position_x as f64 * scale_x + output_width as f64 / 2.0 - scaled_width as f64 / 2.0) as i32;
        let scaled_y = (track.position_y as f64 * scale_y + output_height as f64 / 2.0 - scaled_height as f64 / 2.0) as i32;

        // Video filter: scale, apply opacity
        filter_parts.push(format!(
            "[{}:v]scale={}:{},format=yuva420p,colorchannelmixer=aa={}[v{}]",
            i, scaled_width, scaled_height, track.opacity, i
        ));

        // Audio filter: apply volume
        filter_parts.push(format!(
            "[{}:a]volume={}[a{}]",
            i, track.volume, i
        ));

        // Build overlay chain
        if i == 0 {
            overlay_chain = format!(
                "[bg][v{}]overlay=x={}:y={}[tmp{}]",
                i, scaled_x, scaled_y, i
            );
        } else if i == sorted_tracks.len() - 1 {
            // Last overlay outputs to [vout]
            overlay_chain.push_str(&format!(
                ";[tmp{}][v{}]overlay=x={}:y={}[vout]",
                i - 1, i, scaled_x, scaled_y
            ));
        } else {
            overlay_chain.push_str(&format!(
                ";[tmp{}][v{}]overlay=x={}:y={}[tmp{}]",
                i - 1, i, scaled_x, scaled_y, i
            ));
        }
    }

    // Handle single track case
    if sorted_tracks.len() == 1 {
        overlay_chain = format!(
            "[bg][v0]overlay=x={}:y={}[vout]",
            (sorted_tracks[0].position_x as f64 * output_width as f64 / canvas_width as f64 + output_width as f64 / 2.0 - (sorted_tracks[0].width as f64 * output_width as f64 / canvas_width as f64) / 2.0) as i32,
            (sorted_tracks[0].position_y as f64 * output_height as f64 / canvas_height as f64 + output_height as f64 / 2.0 - (sorted_tracks[0].height as f64 * output_height as f64 / canvas_height as f64) / 2.0) as i32
        );
    }

    // Build audio mix
    let audio_inputs: Vec<String> = (0..sorted_tracks.len()).map(|i| format!("[a{}]", i)).collect();
    let audio_mix = if sorted_tracks.len() > 1 {
        format!(
            ";{}amix=inputs={}:duration=longest[aout]",
            audio_inputs.join(""),
            sorted_tracks.len()
        )
    } else {
        ";[a0]anull[aout]".to_string()
    };

    // Combine all filter parts
    let complete_filter = format!(
        "{};{}{}",
        filter_parts.join(";"),
        overlay_chain,
        audio_mix
    );

    println!("[export_composite_video] Filter graph: {}", complete_filter);

    // Build FFmpeg command
    let mut args = vec!["-y".to_string()];

    // Add input files
    for track in &sorted_tracks {
        args.push("-i".to_string());
        args.push(track.path.clone());
    }

    // Add filter complex
    args.push("-filter_complex".to_string());
    args.push(complete_filter);

    // Map output streams
    args.push("-map".to_string());
    args.push("[vout]".to_string());
    args.push("-map".to_string());
    args.push("[aout]".to_string());

    // Encoding options
    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    args.push("-preset".to_string());
    args.push("fast".to_string());
    args.push("-b:v".to_string());
    args.push(bitrate.to_string());
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push("-b:a".to_string());
    args.push("192k".to_string());
    args.push("-pix_fmt".to_string());
    args.push("yuv420p".to_string());

    args.push(output_path.clone());

    println!("[export_composite_video] FFmpeg args: {:?}", args);

    // Execute FFmpeg
    let ffmpeg_path = get_ffmpeg_path();
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .spawn()
        .map_err(|e| {
            let err_msg = format!("Failed to start FFmpeg: {}", e);
            println!("[export_composite_video] ERROR: {}", err_msg);
            err_msg
        })?;

    println!("[export_composite_video] Waiting for FFmpeg to complete...");
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|e| {
            let err_msg = format!("Task join error: {}", e);
            println!("[export_composite_video] ERROR: {}", err_msg);
            err_msg
        })?
        .map_err(|e| {
            let err_msg = format!("Failed to wait for FFmpeg: {}", e);
            println!("[export_composite_video] ERROR: {}", err_msg);
            err_msg
        })?;

    if status.success() {
        println!("[export_composite_video] FFmpeg completed successfully!");
        println!("[export_composite_video] Output file: {}", output_path);
        Ok(output_path)
    } else {
        let err_msg = format!("FFmpeg exited with status: {}", status);
        println!("[export_composite_video] ERROR: {}", err_msg);
        Err(err_msg)
    }
}

// No longer needed - protocol registration moved to builder

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("video", |_app, request| {
            // Extract and URL-decode file path from URL
            let encoded_path = request.uri().path().trim_start_matches('/');

            // URL decode the path (e.g., %2F -> /)
            let path = urlencoding::decode(encoded_path)
                .unwrap_or_else(|_| std::borrow::Cow::Borrowed(encoded_path))
                .to_string();

            println!("[video_protocol] Encoded path: {}", encoded_path);
            println!("[video_protocol] Decoded path: {}", path);

            // Read file
            match std::fs::read(&path) {
                Ok(data) => {
                    tauri::http::Response::builder()
                        .header("Content-Type", "video/mp4")
                        .header("Accept-Ranges", "bytes")
                        .body(data)
                        .unwrap()
                },
                Err(e) => {
                    println!("[video_protocol] Error reading file: {}", e);
                    tauri::http::Response::builder()
                        .status(404)
                        .body(format!("File not found: {}", e).into_bytes())
                        .unwrap()
                }
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_file_dialog,
            get_video_metadata,
            get_video_file,
            get_video_file_path,
            trim_video,
            concatenate_clips,
            save_file_dialog,
            start_screen_recording,
            stop_screen_recording,
            is_recording,
            start_screen_preview,
            stop_screen_preview,
            start_camera_recording,
            stop_camera_recording,
            is_camera_recording,
            get_screen_resolution,
            get_camera_capabilities,
            list_audio_video_devices,
            move_file,
            delete_file,
            export_composite_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
