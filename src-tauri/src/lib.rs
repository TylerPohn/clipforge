// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        .invoke_handler(tauri::generate_handler![greet, open_file_dialog, get_video_metadata, get_video_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
