#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use immersive_wallpapers_x11::{get_size, set_wallpaper};

#[tauri::command(async)]
fn get_size_cmd() -> Vec<immersive_wallpapers_x11::Monitor> {
    get_size().unwrap()
}

#[tauri::command(async)]
fn set_wallpaper_cmd(path: String, scale: f64, top: u32, left: u32) {
    let monitors = get_size().unwrap();
    set_wallpaper(path, scale, top, left, &monitors).unwrap();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_size_cmd, set_wallpaper_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
