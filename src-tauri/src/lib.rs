// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_dialog::DialogExt;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

// Global state to track recording processes
lazy_static::lazy_static! {
    static ref RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    static ref CAMERA_RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
}

// Recording options structure
#[derive(Debug, Deserialize)]
struct RecordingOptions {
    resolution: String, // "720p", "1080p", or "source"
    #[serde(default)]
    source_width: Option<i32>,
    #[serde(default)]
    source_height: Option<i32>,
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
    let mut child = Command::new("ffmpeg")
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
    let output = Command::new("ffprobe")
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

    // Platform-specific FFmpeg arguments
    let scale_filter = format!("scale={}:{}", width, height);
    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-i", "1",              // Screen capture (1 = main display)
            "-vf", &scale_filter,
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "-f", "gdigrab",
            "-framerate", "30",
            "-i", "desktop",
            "-vf", &scale_filter,
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else {
        return Err("Unsupported platform".to_string());
    };

    println!("[start_screen_recording] FFmpeg args: {:?}", args);

    // Start FFmpeg process with stdin pipe for graceful shutdown
    let child = Command::new("ffmpeg")
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
    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-video_size", &resolution_str,
            "-i", "0",              // Camera device (0 = default camera)
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "-f", "dshow",
            "-framerate", "30",
            "-video_size", &resolution_str,
            "-i", "video=Integrated Camera",
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else {
        return Err("Unsupported platform".to_string());
    };

    println!("[start_camera_recording] FFmpeg args: {:?}", args);

    // Start FFmpeg process with stdin pipe for graceful shutdown
    let child = Command::new("ffmpeg")
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_file_dialog,
            get_video_metadata,
            get_video_file,
            trim_video,
            save_file_dialog,
            start_screen_recording,
            stop_screen_recording,
            is_recording,
            start_camera_recording,
            stop_camera_recording,
            is_camera_recording,
            get_screen_resolution,
            get_camera_capabilities,
            move_file,
            delete_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
