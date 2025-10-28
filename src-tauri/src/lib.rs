// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_dialog::DialogExt;
use tauri::Emitter;
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::sync::mpsc;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn trim_video(
    input_path: String,
    output_path: String,
    start_time: f64,
    end_time: f64,
    window: tauri::Window
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

    // FFmpeg command - don't capture stderr to avoid blocking
    println!("[trim_video] Spawning FFmpeg process (without stderr capture)...");
    let mut child = Command::new("ffmpeg")
        .args(&[
            "-y",                    // Overwrite output file
            "-ss", &start_str,       // Start time
            "-i", &input_path,       // Input file
            "-t", &duration.to_string(), // Duration
            "-c", "copy",            // Copy codec (fast, no re-encode)
            "-avoid_negative_ts", "make_zero",
            &output_path
        ])
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, open_file_dialog, get_video_metadata, get_video_file, trim_video, save_file_dialog])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
