// Tauri 桌面入口：创建窗口，并在开发/本机布局下尝试拉起 FastAPI 后端。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, WindowEvent};

struct BackendProc(Mutex<Option<Child>>);

/// 仓库布局下定位 backend 目录（exe 旁或相对源码树）。
fn find_backend_dir() -> Option<PathBuf> {
    let candidates = [
        // 源码开发：src-tauri/../..
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("backend")),
        // 打包后与 exe 同级的 backend/
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("backend"))),
    ];
    for c in candidates.into_iter().flatten() {
        if c.join("app").join("main.py").is_file() {
            return Some(c);
        }
    }
    None
}

fn python_exe(backend: &Path) -> PathBuf {
    let venv = backend.join(".venv").join("Scripts").join("python.exe");
    if venv.is_file() {
        return venv;
    }
    let venv_unix = backend.join(".venv").join("bin").join("python");
    if venv_unix.is_file() {
        return venv_unix;
    }
    PathBuf::from("python")
}

fn spawn_backend(backend: &Path) -> Option<Child> {
    use std::os::windows::process::CommandExt;

    // CREATE_NO_WINDOW：不弹出黑色控制台
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let py = python_exe(backend);
    // 桌面端把用户数据固定到 LOCALAPPDATA/word-traces，避免写回源码树
    let user_data = std::env::var("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                .unwrap_or_else(|| std::path::PathBuf::from("."))
        })
        .join("word-traces");
    // 默认 0.0.0.0：同一局域网手机可直连；可用 EP_BIND_HOST=127.0.0.1 收回仅本机
    let bind_host = std::env::var("EP_BIND_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let mut cmd = Command::new(py);
    cmd.arg("-m")
        .arg("uvicorn")
        .arg("app.main:app")
        .arg("--host")
        .arg(&bind_host)
        .arg("--port")
        .arg("8000")
        .env("EP_USER_DATA_DIR", &user_data)
        .current_dir(backend)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    cmd.spawn().ok()
}

fn backend_up() -> bool {
    match "127.0.0.1:8000".parse::<std::net::SocketAddr>() {
        Ok(addr) => std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok(),
        Err(_) => false,
    }
}

fn main() {
    let backend_holder = BackendProc(Mutex::new(None));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(backend_holder)
        .setup(|app| {
            // 已有服务则不重复拉起；否则尝试用仓库内 backend 启动
            if !backend_up() {
                if let Some(dir) = find_backend_dir() {
                    if let Some(child) = spawn_backend(&dir) {
                        if let Some(state) = app.try_state::<BackendProc>() {
                            if let Ok(mut slot) = state.0.lock() {
                                *slot = Some(child);
                            }
                        }
                        // 给 uvicorn 一点启动时间
                        for _ in 0..50 {
                            if backend_up() {
                                break;
                            }
                            std::thread::sleep(Duration::from_millis(100));
                        }
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<BackendProc>() {
                    if let Ok(mut slot) = state.0.lock() {
                        if let Some(child) = slot.as_mut() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Tauri app");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<BackendProc>() {
                if let Ok(mut slot) = state.0.lock() {
                    if let Some(child) = slot.as_mut() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
