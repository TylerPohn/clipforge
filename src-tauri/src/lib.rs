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
    let mut child = Command::new("ffmpeg")
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
            delete_file,
            export_composite_video
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
